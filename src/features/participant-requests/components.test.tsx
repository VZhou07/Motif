import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CareError } from '../../care';
import type { CareClient, CareRequest, CareSnapshot } from '../../care';
import { ParticipantRequestController } from './controller';
import { ParticipantPairing } from './ParticipantPairing';
import { ParticipantRequestsPanel } from './ParticipantRequestsPanel';

/**
 * Rendering tests only. PGlite cannot load in jsdom, so a minimal stand-in client publishes
 * snapshots; delivery behaviour is covered against real SQL in controller.test.ts.
 */
const PID = '00000000-0000-4000-8000-0000000000a1';
const GID = '00000000-0000-4000-8000-0000000000b1';
const date = '2026-10-17T12:00:00Z';
const participant = { id: PID, group_id: GID, alias: 'Alex', user_id: '00000000-0000-4000-8000-0000000000c1', revoked_at: null, created_at: date };
const online = (requests: CareRequest[] = []): CareSnapshot => ({ epoch: 1, connection: 'online', error: null, participants: [participant], requests,
  access: { version: 1, role: 'participant', group: null, participant, receiver_name: 'Ward A' } });
const request = (id: string, status: CareRequest['status'], kind: CareRequest['kind'] = 'water'): CareRequest =>
  ({ id, group_id: GID, participant_id: PID, kind, status, revision: 1, created_at: date, updated_at: date });

function stand(initial: CareSnapshot) {
  let snapshot = initial;
  const listeners = new Set<(s: CareSnapshot) => void>();
  const client = {
    get snapshot() { return snapshot; },
    watch: (listener: (s: CareSnapshot) => void) => { listeners.add(listener); listener(snapshot); return () => listeners.delete(listener); },
    refresh: vi.fn(async () => snapshot),
    sendRequest: vi.fn(() => new Promise<CareRequest>(() => {})),
    transitionRequest: vi.fn(() => new Promise<CareRequest>(() => {})),
    pair: vi.fn(async () => snapshot),
    signOut: vi.fn(async () => {}),
  } as unknown as CareClient & { sendRequest: ReturnType<typeof vi.fn>; pair: ReturnType<typeof vi.fn>; signOut: ReturnType<typeof vi.fn>; transitionRequest: ReturnType<typeof vi.fn> };
  const emit = (next: CareSnapshot) => act(() => { snapshot = next; for (const listener of listeners) listener(next); });
  return { client, emit };
}

describe('participant request panel', () => {
  it('renders each request target once, with live labels and truthful card text', () => {
    const { client, emit } = stand(online());
    const controller = new ParticipantRequestController({ client, newId: () => '00000000-0000-4000-8000-000000000001' });
    controller.setActive(true);
    render(<ParticipantRequestsPanel controller={controller} />);
    expect(screen.getByText(/Requests from/).textContent).toContain('Requests from Alex go to Ward A.');
    expect(screen.getAllByRole('button', { name: 'Ask for water' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Ask for water' }));
    expect(client.sendRequest).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', 'water');
    expect(screen.getByRole('button', { name: 'Water: sending' })).toBeTruthy();
    expect(screen.getByText('Sending — not confirmed yet.')).toBeTruthy();
    emit(online([request('00000000-0000-4000-8000-000000000001', 'acknowledged')]));
    expect(screen.getByRole('button', { name: 'Water: Ward A acknowledged' })).toBeTruthy();
    expect(screen.getByText('Ward A acknowledged it.')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Cancel water request' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Cancel this water request' })).toBeTruthy();
  });

  it('routes clicks through the integrator and disables everything while paused', () => {
    const { client } = stand(online());
    const controller = new ParticipantRequestController({ client });
    controller.setActive(true);
    const onActivate = vi.fn();
    const { rerender } = render(<ParticipantRequestsPanel controller={controller} onActivate={onActivate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ask for general help' }));
    expect(onActivate).toHaveBeenCalledWith('request:help');
    expect(client.sendRequest).not.toHaveBeenCalled();
    rerender(<ParticipantRequestsPanel controller={controller} onActivate={onActivate} disabled />);
    for (const button of screen.getAllByRole('button')) expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows last-known state while offline and disables card actions', () => {
    const { client, emit } = stand(online([request('00000000-0000-4000-8000-000000000002', 'sent', 'bathroom')]));
    const controller = new ParticipantRequestController({ client });
    controller.setActive(true);
    render(<ParticipantRequestsPanel controller={controller} />);
    emit({ ...online(), connection: 'offline', access: { version: 1, role: 'signed-out', group: null, participant: null, receiver_name: null }, requests: [], participants: [] });
    expect(screen.getByRole('status').textContent).toContain("Can't reach the caregiver service");
    expect(screen.getByText('Sent — your caregiver has not responded yet. (last known, not confirmed right now)')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Cancel this bathroom assistance request' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders nothing when this device is not paired', () => {
    const { client } = stand({ ...online(), connection: 'idle', access: { version: 1, role: 'signed-out', group: null, participant: null, receiver_name: null } });
    const controller = new ParticipantRequestController({ client });
    const { container } = render(<ParticipantRequestsPanel controller={controller} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('participant pairing view', () => {
  const signedOut = (): CareSnapshot => ({ ...online(), connection: 'idle', participants: [],
    access: { version: 1, role: 'signed-out', group: null, participant: null, receiver_name: null } });

  it('pairs with a code, clears the field and shows who receives requests', async () => {
    const { client, emit } = stand(signedOut());
    const controller = new ParticipantRequestController({ client });
    render(<ParticipantPairing controller={controller} />);
    const field = screen.getByLabelText('Invitation code');
    fireEvent.change(field, { target: { value: 'a'.repeat(64) } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Pair this device' })); });
    expect(client.pair).toHaveBeenCalledWith('a'.repeat(64));
    expect((field as HTMLInputElement).value).toBe('');
    emit(online());
    expect(screen.getByText(/This device sends requests as/).textContent).toContain('This device sends requests as Alex to Ward A.');
    expect(screen.getByText(/Signing out ends this device's pairing/)).toBeTruthy();
  });

  it('shows a plain pairing error without echoing the code', async () => {
    const { client } = stand(signedOut());
    client.pair.mockRejectedValueOnce(new CareError('invalid_invite', 'x'));
    const controller = new ParticipantRequestController({ client });
    render(<ParticipantPairing controller={controller} />);
    fireEvent.change(screen.getByLabelText('Invitation code'), { target: { value: 'b'.repeat(64) } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Pair this device' })); });
    expect(screen.getByRole('alert').textContent).toContain('That invitation code is not valid or has expired. Ask for a new one.');
    expect(document.body.textContent).not.toContain('b'.repeat(64));
  });

  it('signs out, clearing this person immediately', async () => {
    const { client } = stand(online([request('00000000-0000-4000-8000-000000000003', 'sent')]));
    const controller = new ParticipantRequestController({ client });
    controller.setActive(true);
    render(<><ParticipantPairing controller={controller} /><ParticipantRequestsPanel controller={controller} /></>);
    expect(screen.getByRole('group', { name: 'Requests' })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sign this device out' })); });
    expect(client.signOut).toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: 'Requests' })).toBeNull();
    expect(screen.getByLabelText('Invitation code')).toBeTruthy();
  });

  it('a revoked device signs out of the old pairing before using a new code', async () => {
    const order: string[] = [];
    const { client } = stand({ ...online(), requests: [],
      access: { version: 1, role: 'revoked', group: null, participant: { ...participant, revoked_at: date }, receiver_name: null } });
    client.signOut.mockImplementation(async () => { order.push('signOut'); });
    client.pair.mockImplementation(async () => { order.push('pair'); return client.snapshot; });
    const controller = new ParticipantRequestController({ client });
    render(<ParticipantPairing controller={controller} />);
    fireEvent.change(screen.getByLabelText('Invitation code'), { target: { value: 'c'.repeat(64) } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Pair this device' })); });
    expect(order).toEqual(['signOut', 'pair']);
    expect(client.pair).toHaveBeenCalledWith('c'.repeat(64));
  });

  it('explains revoked, caregiver and not-configured states', () => {
    const revoked = stand({ ...online(), access: { version: 1, role: 'revoked', group: null, participant: { ...participant, revoked_at: date }, receiver_name: null }, requests: [] });
    const { unmount } = render(<ParticipantPairing controller={new ParticipantRequestController({ client: revoked.client })} />);
    expect(screen.getByText(/Your caregiver removed this pairing\. Ask them for a new invitation/)).toBeTruthy();
    expect(screen.getByLabelText('Invitation code')).toBeTruthy();
    unmount();
    const caregiver = stand({ ...online(), participants: [], requests: [],
      access: { version: 1, role: 'caregiver', group: { id: GID, owner_id: participant.user_id, name: 'Ward A', created_at: date }, participant: null, receiver_name: 'Ward A' } });
    const second = render(<ParticipantPairing controller={new ParticipantRequestController({ client: caregiver.client })} />);
    expect(screen.getByText(/Signed in as a caregiver/)).toBeTruthy();
    second.unmount();
    render(<ParticipantPairing controller={new ParticipantRequestController({ client: null })} />);
    expect(screen.getByText('Caregiver requests are not set up on this device. Local communication still works.')).toBeTruthy();
  });
});
