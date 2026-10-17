import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CareError, type CareSnapshot } from '../../care';
import { CaregiverDashboard } from './CaregiverDashboard';
import { FakeCareClient, fakeSound, manualClock } from './client.test-support';
import { OTHER_GROUP_ID, caregiverAccess, group, iso, person, request, signedOut, snapshot } from './fixtures.test-support';

afterEach(() => { vi.useRealTimers(); });

async function mount(initial?: CareSnapshot, options: { clock?: ReturnType<typeof manualClock> } = {}) {
  const client = new FakeCareClient();
  if (initial) client.emit(initial);
  const sound = fakeSound();
  const clock = options.clock ?? manualClock();
  const view = render(<CaregiverDashboard client={client} sound={sound.port} clock={clock} />);
  await act(async () => { await Promise.resolve(); });
  return { client, sound, clock, ...view };
}
const emit = (client: FakeCareClient, snap: CareSnapshot) => act(() => { client.emit(snap); });
const openList = () => screen.getByRole('list', { name: 'Open requests' });

describe('signing in', () => {
  it('shows the sign-in form only after the cold-start refresh settles, and signs in with the typed account', async () => {
    const { client } = await mount();
    const email = screen.getByLabelText('E-mail');
    const password = screen.getByLabelText('Password') as HTMLInputElement;
    fireEvent.change(email, { target: { value: ' carer@example.org ' } });
    fireEvent.change(password, { target: { value: 'secret-pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(client.signIn).toHaveBeenCalledWith('carer@example.org', 'secret-pass'));
    expect(password.value).toBe('');
  });

  it('keeps the form and the error after a failed sign-in, even when the next snapshots are offline then idle', async () => {
    const { client } = await mount();
    client.signIn.mockImplementationOnce(async () => {
      client.emit(signedOut({ epoch: 1, connection: 'offline', error: 'The care service could not be reached.' }));
      throw new CareError('auth_failed', 'Care account sign-in could not be completed. Check the account and project setup.');
    });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'carer@example.org' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText(/sign-in could not be completed/)).toBeTruthy();
    expect(screen.queryByText("Can't reach the care service")).toBeNull();
    await emit(client, signedOut({ epoch: 1 }));
    expect(screen.getByText(/sign-in could not be completed/)).toBeTruthy();
    expect(screen.getByLabelText('E-mail')).toBeTruthy();
  });

  it('a genuine outage before any sign-in shows the unreachable panel next to the form', async () => {
    const { client } = await mount();
    await emit(client, signedOut({ epoch: 0, connection: 'offline', error: 'The care service could not be reached.' }));
    expect(screen.getByText("Can't reach the care service")).toBeTruthy();
    expect(screen.getByLabelText('E-mail')).toBeTruthy();
    client.refresh.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Retry now' }));
    expect(client.refresh).toHaveBeenCalled();
  });

  it('a device paired as a person explains itself and signs out only after confirmation', async () => {
    const { client } = await mount(snapshot({ access: { ...caregiverAccess(), role: 'participant', group: null } }));
    expect(screen.getByText('This device is not signed in as a caregiver')).toBeTruthy();
    expect(screen.queryByLabelText('E-mail')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out of this device' }));
    expect(client.signOut).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, sign out of this device' }));
    await waitFor(() => expect(client.signOut).toHaveBeenCalledTimes(1));
  });

  it('a caregiver without a group can create one', async () => {
    const { client } = await mount(snapshot({ access: caregiverAccess({ group: null }) }));
    client.createGroup.mockResolvedValueOnce(group());
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Home' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create group' }));
    await waitFor(() => expect(client.createGroup).toHaveBeenCalledWith('Home'));
  });
});

describe('requests', () => {
  it('keeps two people with the same alias distinct and acts on the right request id and revision', async () => {
    const first = person('Alex', { created_at: iso(-300) });
    const second = person('Alex', { created_at: iso(-200) });
    const forFirst = request(first, { created_at: iso(-60) });
    const forSecond = request(second, { created_at: iso(-30), kind: 'help', revision: 4 });
    const { client } = await mount(snapshot({ participants: [first, second], requests: [forFirst, forSecond] }));
    const cards = within(openList()).getAllByRole('listitem');
    expect(cards.map((card) => card.querySelector('.cg-card-title')?.textContent)).toEqual(['Alex #1 · Water New', 'Alex #2 · General help New']);
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge: General help request from Alex #2' }));
    await waitFor(() => expect(client.transitionRequest).toHaveBeenCalledTimes(1));
    expect(client.transitionRequest).toHaveBeenCalledWith(forSecond.id, 4, 'acknowledged');
  });

  it('a displayed or replayed request is never acknowledged by itself, and duplicates show one card', async () => {
    const alex = person('Alex');
    const water = request(alex);
    const { client } = await mount(snapshot({ participants: [alex], requests: [water, { ...water }] }));
    for (let i = 0; i < 3; i++) await emit(client, snapshot({ participants: [alex], requests: [water] }));
    expect(within(openList()).getAllByRole('listitem')).toHaveLength(1);
    expect(client.transitionRequest).not.toHaveBeenCalled();
  });

  it('shows the status the server reports: Acknowledge for sent, Mark complete for acknowledged, none when finished', async () => {
    const alex = person('Alex');
    const water = request(alex);
    const { client } = await mount(snapshot({ participants: [alex], requests: [water] }));
    expect(screen.getByText('Waiting — not yet acknowledged')).toBeTruthy();
    await emit(client, snapshot({ participants: [alex], requests: [{ ...water, status: 'acknowledged', revision: 2 }] }));
    expect(screen.getByRole('button', { name: 'Mark complete: Water request from Alex' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Acknowledge/ })).toBeNull();
    // an older replay never brings back the Acknowledge button or the old revision
    await emit(client, snapshot({ participants: [alex], requests: [water] }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark complete: Water request from Alex' }));
    await waitFor(() => expect(client.transitionRequest).toHaveBeenCalledWith(water.id, 2, 'completed'));
    await emit(client, snapshot({ participants: [alex], requests: [{ ...water, status: 'completed', revision: 3 }] }));
    expect(within(openList()).queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByText(/Recently finished \(1\)/)).toBeTruthy();
  });

  it('a double click sends one action, and the card changes only when the server says so', async () => {
    const alex = person('Alex');
    const water = request(alex);
    const { client } = await mount(snapshot({ participants: [alex], requests: [water] }));
    let finish!: () => void;
    client.transitionRequest.mockImplementationOnce(() => new Promise((resolve) => { finish = () => resolve({ ...water, status: 'acknowledged', revision: 2 }); }));
    const button = screen.getByRole('button', { name: 'Acknowledge: Water request from Alex' });
    // Both clicks land before React re-renders (a fast double tap), so the disabled state cannot help yet.
    act(() => { button.click(); button.click(); });
    expect(client.transitionRequest).toHaveBeenCalledTimes(1);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Waiting — not yet acknowledged')).toBeTruthy();
    await act(async () => { finish(); });
    expect(screen.getByText('Waiting — not yet acknowledged')).toBeTruthy();
  });

  it('a refused action shows an honest message and refreshes the authoritative state', async () => {
    const alex = person('Alex');
    const water = request(alex);
    const { client } = await mount(snapshot({ participants: [alex], requests: [water] }));
    client.refresh.mockClear();
    client.transitionRequest.mockRejectedValueOnce(new CareError('request_failed', 'The care service refused this operation (400).'));
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge: Water request from Alex' }));
    expect(await screen.findByText(/could not be confirmed\. It may have been refused or may already have taken effect/)).toBeTruthy();
    expect(client.refresh).toHaveBeenCalled();
  });

  it('a removed person disappears from the open list and their requests do not chime', async () => {
    const alex = person('Alex');
    const sam = person('Sam');
    const { client, sound } = await mount(snapshot({ participants: [alex, sam], requests: [] }));
    fireEvent.click(screen.getByRole('button', { name: 'Enable sound' }));
    await waitFor(() => expect(sound.enable).toHaveBeenCalled());
    await emit(client, snapshot({ participants: [alex, { ...sam, revoked_at: iso(1) }], requests: [request(sam)] }));
    expect(within(openList()).queryAllByRole('listitem')).toHaveLength(0);
    expect(sound.chime).not.toHaveBeenCalled();
    expect(screen.getByText('Removed people (1)')).toBeTruthy();
  });

  it('renders hostile aliases as text', async () => {
    const evil = person('<img src=x onerror="alert(1)">');
    await mount(snapshot({ participants: [evil], requests: [request(evil)] }));
    expect(document.querySelector('img')).toBeNull();
    expect(within(openList()).getByText('<img src=x onerror="alert(1)">')).toBeTruthy();
  });
});

describe('connection', () => {
  it('keeps the last board while offline, pauses actions, and announces when the connection returns', async () => {
    const alex = person('Alex');
    const water = request(alex);
    const { client } = await mount(snapshot({ participants: [alex], requests: [water] }));
    await emit(client, signedOut({ epoch: 1, connection: 'offline', error: 'The care service could not be reached.' }));
    expect(screen.getByText(/Connection lost\. Showing information from/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Acknowledge: Water request from Alex' }) as HTMLButtonElement).disabled).toBe(true);
    client.refresh.mockClear();
    fireEvent.click(screen.getAllByRole('button', { name: 'Retry now' })[0]!);
    expect(client.refresh).toHaveBeenCalled();
    await emit(client, snapshot({ participants: [alex], requests: [water] }));
    expect(screen.queryByText(/Connection lost\. Showing/)).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Connection restored.');
    expect((screen.getByRole('button', { name: 'Acknowledge: Water request from Alex' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('Sign in again drops the old board at once', async () => {
    const alex = person('Alex');
    const { client } = await mount(snapshot({ participants: [alex], requests: [request(alex)] }));
    await emit(client, signedOut({ epoch: 1, connection: 'offline', error: 'x' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }));
    expect(screen.queryByRole('list', { name: 'Open requests' })).toBeNull();
    expect(screen.getByLabelText('E-mail')).toBeTruthy();
  });

  it('an expired session says so and shows nothing of the previous board', async () => {
    const alex = person('Alex');
    const { client } = await mount(snapshot({ participants: [alex], requests: [request(alex)] }));
    await emit(client, signedOut({ epoch: 2 }));
    expect(screen.getByRole('alert').textContent).toBe('Your session ended. Sign in again.');
    expect(screen.queryByText(/Alex/)).toBeNull();
  });

  it('caregiver B never sees caregiver A after an account change', async () => {
    const alex = person('Alex');
    const water = request(alex);
    const { client, container } = await mount(snapshot({ participants: [alex], requests: [water] }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await act(async () => { client.emit(signedOut({ epoch: 2 })); });
    expect(screen.queryByText('Your session ended. Sign in again.')).toBeNull();
    const bob = person('Bob', { group_id: OTHER_GROUP_ID });
    await emit(client, snapshot({ epoch: 3, access: caregiverAccess({ group: group({ id: OTHER_GROUP_ID, name: 'B group' }) }), participants: [bob], requests: [request(bob)] }));
    expect(container.innerHTML).not.toContain(alex.id);
    expect(container.innerHTML).not.toContain(water.id);
    expect(screen.queryByText(/Alex/)).toBeNull();
    expect(screen.getByText(/B group/)).toBeTruthy();
  });

  it('unsubscribes from the client on unmount', async () => {
    const { client, unmount } = await mount(snapshot());
    expect(client.watchers).toBe(1);
    unmount();
    expect(client.watchers).toBe(0);
  });
});

describe('sound', () => {
  it('stays silent until Enable sound, then chimes once per genuinely new request', async () => {
    const alex = person('Alex');
    const old = request(alex);
    const { client, sound } = await mount(snapshot({ participants: [alex], requests: [old] }));
    await emit(client, snapshot({ participants: [alex], requests: [old, request(alex, { kind: 'help' })] }));
    expect(sound.enable).not.toHaveBeenCalled();
    expect(sound.chime).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Enable sound' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sound on (turn off)' })).toBeTruthy());
    const fresh = request(alex, { kind: 'bathroom' });
    const list = [old, fresh];
    await emit(client, snapshot({ participants: [alex], requests: list }));
    await emit(client, snapshot({ participants: [alex], requests: list }));
    expect(sound.chime).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toBe('New request: Bathroom assistance from Alex.');
    await emit(client, snapshot({ participants: [alex], requests: [old, { ...fresh, status: 'acknowledged', revision: 2 }] }));
    expect(sound.chime).toHaveBeenCalledTimes(1);
  });

  it('an outage, a token-refresh epoch bump and reconnect re-alert nothing old and alert a new request once', async () => {
    const alex = person('Alex');
    const old = request(alex);
    const { client, sound } = await mount(snapshot({ participants: [alex], requests: [old] }));
    fireEvent.click(screen.getByRole('button', { name: 'Enable sound' }));
    await waitFor(() => expect(sound.enable).toHaveBeenCalled());
    await emit(client, signedOut({ epoch: 1, connection: 'offline', error: 'x' }));
    await emit(client, snapshot({ epoch: 2, connection: 'loading', access: signedOut().access }));
    await emit(client, signedOut({ epoch: 2, connection: 'offline', error: 'x' }));
    expect(sound.chime).not.toHaveBeenCalled();
    const during = request(alex, { kind: 'reposition' });
    await emit(client, snapshot({ epoch: 2, participants: [alex], requests: [old, during] }));
    expect(sound.chime).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Sound on (turn off)' })).toBeTruthy();
  });

  it('a different caregiver group starts silent: its existing queue does not chime', async () => {
    const alex = person('Alex');
    const { client, sound } = await mount(snapshot({ participants: [alex], requests: [] }));
    fireEvent.click(screen.getByRole('button', { name: 'Enable sound' }));
    await waitFor(() => expect(sound.enable).toHaveBeenCalled());
    await emit(client, signedOut({ epoch: 2 }));
    const bob = person('Bob', { group_id: OTHER_GROUP_ID });
    await emit(client, snapshot({ epoch: 3, access: caregiverAccess({ group: group({ id: OTHER_GROUP_ID }) }), participants: [bob], requests: [request(bob)] }));
    expect(sound.chime).not.toHaveBeenCalled();
  });
});

describe('people and invitations', () => {
  it('creates an invitation code, counts it down and hides it when it expires', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false, toFake: ['setInterval', 'clearInterval'] });
    const waiting = person('Alex', { user_id: null });
    const clock = manualClock();
    const { client } = await mount(snapshot({ participants: [waiting] }), { clock });
    client.createInvite.mockResolvedValueOnce({ version: 1, participant_id: waiting.id, token: 'K7Q2-M9XA', expires_at: new Date(clock.wallNow + 600_000).toISOString() });
    fireEvent.click(screen.getByRole('button', { name: 'Create invitation for Alex' }));
    expect(await screen.findByText('K7Q2-M9XA')).toBeTruthy();
    expect(screen.getByText(/expires in 10:00/)).toBeTruthy();
    expect(screen.getByRole('status').textContent).not.toContain('K7Q2');
    await act(async () => { clock.advance(61_000); vi.advanceTimersByTime(1_000); });
    expect(screen.getByText(/expires in 8:59/)).toBeTruthy();
    await act(async () => { clock.advance(540_000); vi.advanceTimersByTime(1_000); });
    expect(screen.queryByText('K7Q2-M9XA')).toBeNull();
  });

  it('hides the code when the person pairs', async () => {
    const waiting = person('Alex', { user_id: null });
    const { client } = await mount(snapshot({ participants: [waiting] }));
    client.createInvite.mockResolvedValueOnce({ version: 1, participant_id: waiting.id, token: 'CODE-1234', expires_at: iso(600) });
    fireEvent.click(screen.getByRole('button', { name: 'Create invitation for Alex' }));
    expect(await screen.findByText('CODE-1234')).toBeTruthy();
    await emit(client, snapshot({ participants: [{ ...waiting, user_id: '00000000-0000-4000-8000-00000000ffff' }] }));
    expect(screen.queryByText('CODE-1234')).toBeNull();
    expect(screen.getByText('Paired')).toBeTruthy();
  });

  it('adds a person, and removes one or clears everything only after confirmation', async () => {
    const alex = person('Alex');
    const { client } = await mount(snapshot({ participants: [alex] }));
    client.createParticipant.mockResolvedValueOnce(person('Sam'));
    fireEvent.change(screen.getByLabelText('Add a person (name shown to you)'), { target: { value: '  Sam ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add person' }));
    await waitFor(() => expect(client.createParticipant).toHaveBeenCalledWith('Sam'));

    client.revokeParticipant.mockResolvedValueOnce({ ...alex, revoked_at: iso(1) });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Alex' }));
    expect(client.revokeParticipant).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove Alex' }));
    await waitFor(() => expect(client.revokeParticipant).toHaveBeenCalledWith(alex.id));

    fireEvent.click(screen.getByRole('button', { name: 'Clear everything' }));
    expect(client.clearGroup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, clear everything' }));
    await waitFor(() => expect(client.clearGroup).toHaveBeenCalledTimes(1));
  });
});

describe('keyboard', () => {
  it('reaches Acknowledge with the keyboard, then moves focus to the same card\'s Mark complete button', async () => {
    const alex = person('Alex');
    const water = request(alex);
    const user = userEvent.setup();
    const { client } = await mount(snapshot({ participants: [alex], requests: [water] }));
    client.transitionRequest.mockImplementationOnce(async (id, revision, status) => {
      client.emit(snapshot({ participants: [alex], requests: [{ ...water, status: 'acknowledged', revision: 2 }] }));
      return { ...water, id, status, revision: revision + 1 };
    });
    const acknowledge = screen.getByRole('button', { name: 'Acknowledge: Water request from Alex' });
    for (let i = 0; i < 10 && document.activeElement !== acknowledge; i++) await user.tab();
    expect(document.activeElement).toBe(acknowledge);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Mark complete: Water request from Alex' })));
    expect(client.transitionRequest).toHaveBeenCalledWith(water.id, 1, 'acknowledged');
  });
});
