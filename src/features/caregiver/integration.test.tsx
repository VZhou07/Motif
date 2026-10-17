import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CareError } from '../../care';
import { CareService, type CareCredential, type CareTransport } from '../../care/client';
import { CaregiverDashboard } from './CaregiverDashboard';
import { fakeSound, manualClock } from './client.test-support';
import { OTHER_GROUP_ID, group, iso, person, request } from './fixtures.test-support';

/** The REAL shared CareService (src/care/client.ts) over a test-only transport standing in for Supabase. */
const A_USER = '00000000-0000-4000-8000-00000000aaa1';
const B_USER = '00000000-0000-4000-8000-00000000bbb1';
const GROUP_A = group({ owner_id: A_USER, name: 'A group' });
const GROUP_B = group({ id: OTHER_GROUP_ID, owner_id: B_USER, name: 'B group' });

function backend() {
  const alex = person('Alex', { group_id: GROUP_A.id });
  const sam = person('Sam', { group_id: GROUP_A.id });
  const bob = person('Bob', { group_id: GROUP_B.id });
  const db = {
    participants: [alex, sam, bob],
    requests: [request(alex, { kind: 'water' }), request(bob, { kind: 'help' })],
  };
  const accounts: Record<string, { credential: CareCredential; group: typeof GROUP_A }> = {
    'a@example.org': { credential: { token: 'token-A', userId: A_USER, anonymous: false }, group: GROUP_A },
    'b@example.org': { credential: { token: 'token-B', userId: B_USER, anonymous: false }, group: GROUP_B },
  };
  const state = { credential: null as CareCredential | null, failing: false, credentialGate: null as Promise<void> | null, onChange: () => {} };
  const groupOf = (token: string) => Object.values(accounts).find((account) => account.credential.token === token)!.group;
  const transport: CareTransport = {
    auth: {
      async credential() { if (state.credentialGate) await state.credentialGate; if (state.failing) throw new CareError('auth_failed', 'x'); return state.credential; },
      async signIn(email, password) {
        if (password !== 'correct-horse' || !accounts[email]) throw new CareError('auth_failed', 'Care account sign-in could not be completed. Check the account and project setup.');
        state.credential = accounts[email]!.credential;
      },
      async signInAnonymous() { throw new Error('not used'); },
      async signOut() { state.credential = null; },
      onChange(callback) { state.onChange = callback; return () => {}; },
    },
    async rpc(name, args, token) {
      if (state.failing) throw new Error('network down');
      const g = groupOf(token);
      if (name === 'motif_access') return { version: 1, role: 'caregiver', group: g, participant: null, receiver_name: g.name };
      if (name === 'motif_transition_request') {
        const found = db.requests.find((r) => r.id === args.p_request_id && r.group_id === g.id);
        if (!found || found.revision !== args.p_revision) throw new CareError('request_failed', 'The care service refused this operation (400).');
        Object.assign(found, { status: args.p_status, revision: found.revision + 1, updated_at: iso(5) });
        return { version: 1, request: { ...found } };
      }
      throw new Error(`unexpected ${name}`);
    },
    async list(table, token) {
      if (state.failing) throw new Error('network down');
      const g = groupOf(token);
      // RLS stand-in: only the signed-in caregiver's own group.
      return table === 'participants' ? db.participants.filter((p) => p.group_id === g.id) : db.requests.filter((r) => r.group_id === g.id);
    },
  };
  return { transport, state, db, alex, sam, bob };
}

let service: CareService | null = null;
afterEach(async () => { await service?.dispose(); service = null; });

async function start(signedIn: 'a' | null = 'a') {
  const env = backend();
  if (signedIn) env.state.credential = { token: 'token-A', userId: A_USER, anonymous: false };
  service = new CareService(env.transport);
  const sound = fakeSound();
  const view = render(<CaregiverDashboard client={service} sound={sound.port} clock={manualClock()} />);
  return { ...env, sound, service, ...view };
}

describe('caregiver dashboard on the real CareService', () => {
  it('shows only the signed-in caregiver group and acknowledges with the server revision', async () => {
    const { db, alex } = await start();
    const list = await screen.findByRole('list', { name: 'Open requests' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByText(/Bob/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge: Water request from Alex #1' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mark complete: Water request from Alex #1' })).toBeTruthy());
    expect(db.requests.find((r) => r.participant_id === alex.id)).toMatchObject({ status: 'acknowledged', revision: 2 });
  });

  it('cold start with a slow session check shows loading, never the sign-in form, then the board', async () => {
    let open!: () => void;
    const env = backend();
    env.state.credential = { token: 'token-A', userId: A_USER, anonymous: false };
    env.state.credentialGate = new Promise((resolve) => { open = resolve; });
    service = new CareService(env.transport);
    render(<CaregiverDashboard client={service} sound={fakeSound().port} clock={manualClock()} />);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(screen.getByText('Connecting to the care service…')).toBeTruthy();
    expect(screen.queryByLabelText('E-mail')).toBeNull();
    await act(async () => { env.state.credentialGate = null; open(); });
    expect(await screen.findByRole('list', { name: 'Open requests' })).toBeTruthy();
  });

  it('an outage keeps the board with actions paused; recovery restores it and a request made meanwhile chimes once', async () => {
    const { state, db, alex, sound, service: client } = await start();
    await screen.findByRole('list', { name: 'Open requests' });
    fireEvent.click(screen.getByRole('button', { name: 'Enable sound' }));
    await waitFor(() => expect(sound.enable).toHaveBeenCalled());
    state.failing = true;
    await act(async () => { await client.refresh().catch(() => {}); });
    expect(screen.getByText(/Connection lost\. Showing information from/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Acknowledge: Water request from Alex #1' }) as HTMLButtonElement).disabled).toBe(true);
    db.requests.push(request(alex, { kind: 'bathroom', created_at: iso(10) }));
    expect(sound.chime).not.toHaveBeenCalled();
    state.failing = false;
    await act(async () => { await client.refresh(); });
    expect(within(screen.getByRole('list', { name: 'Open requests' })).getAllByRole('listitem')).toHaveLength(2);
    expect(sound.chime).toHaveBeenCalledTimes(1);
  });

  it('a wrong password keeps the form with a message; signing out and in as B shows nothing of A', async () => {
    const { service: client, container, alex, sound } = await start(null);
    await screen.findByLabelText('E-mail');
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'a@example.org' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText(/sign-in could not be completed/)).toBeTruthy();
    expect(screen.getByLabelText('E-mail')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('list', { name: 'Open requests' });
    expect(screen.getByText(/A group/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Enable sound' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sound on (turn off)' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByLabelText('E-mail');
    expect(screen.queryByText('Your session ended. Sign in again.')).toBeNull();
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'b@example.org' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText(/B group/);
    expect(screen.getAllByText(/Bob/).length).toBeGreaterThan(0);
    expect(sound.chime).not.toHaveBeenCalled(); // B's existing queue never chimes
    expect(container.innerHTML).not.toContain(alex.id);
    expect(screen.queryByText(/Alex/)).toBeNull();
    expect(client.snapshot.access.group?.id).toBe(OTHER_GROUP_ID);
  });

  it('an action against a stale revision is refused, explained, and the latest state is shown', async () => {
    const { db, alex } = await start();
    await screen.findByRole('list', { name: 'Open requests' });
    const row = db.requests.find((r) => r.participant_id === alex.id)!;
    Object.assign(row, { status: 'cancelled', revision: 2 }); // the person cancelled meanwhile
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge: Water request from Alex #1' }));
    expect(await screen.findByText(/could not be confirmed/)).toBeTruthy();
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Open requests' })).queryAllByRole('listitem')).toHaveLength(0));
    expect(row.status).toBe('cancelled');
  });
});
