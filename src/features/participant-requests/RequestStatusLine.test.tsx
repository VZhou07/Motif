import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CareError } from '../../care';
import type { CareClient, CareRequest, CareSnapshot } from '../../care';
import { ParticipantRequestController } from './controller';
import { RequestStatusLine } from './RequestStatusLine';

/** W2 Q4 rendering. A stand-in client publishes snapshots (PGlite cannot load in jsdom). */
const PID = '00000000-0000-4000-8000-0000000000a1';
const GID = '00000000-0000-4000-8000-0000000000b1';
const participant = { id: PID, group_id: GID, alias: 'Alex', user_id: '00000000-0000-4000-8000-0000000000c1', revoked_at: null, created_at: '2026-10-17T12:00:00Z' };
const at = (minute: number) => `2026-10-17T12:${String(minute).padStart(2, '0')}:00Z`;
const request = (id: string, status: CareRequest['status'], kind: CareRequest['kind'], minute: number): CareRequest =>
  ({ id: `00000000-0000-4000-8000-00000000000${id}`, group_id: GID, participant_id: PID, kind, status, revision: 1, created_at: at(minute), updated_at: at(minute) });
const online = (requests: CareRequest[] = [], connection: CareSnapshot['connection'] = 'online'): CareSnapshot => ({ epoch: 1, connection, error: null, participants: [participant], requests,
  access: { version: 1, role: 'participant', group: null, participant, receiver_name: 'Ward A' } });

function stand(initial: CareSnapshot) {
  let snapshot = initial;
  const listeners = new Set<(s: CareSnapshot) => void>();
  const client = {
    get snapshot() { return snapshot; },
    watch: (listener: (s: CareSnapshot) => void) => { listeners.add(listener); listener(snapshot); return () => listeners.delete(listener); },
    refresh: vi.fn(async () => snapshot),
    sendRequest: vi.fn(() => Promise.reject(new CareError('request_failed', 'x'))),
    transitionRequest: vi.fn(() => new Promise<CareRequest>(() => {})),
    pair: vi.fn(async () => snapshot),
    signOut: vi.fn(async () => {}),
  } as unknown as CareClient;
  const emit = (next: CareSnapshot) => act(() => { snapshot = next; for (const listener of listeners) listener(next); });
  const controller = new ParticipantRequestController({ client });
  return { client, controller, emit };
}
const lines = (container: HTMLElement) => [...container.querySelectorAll('.request-status-line p')].map((line) => line.textContent);

describe('request status on the main board (W2 Q4)', () => {
  it('shows a sent request plainly, with nothing to select and no live region', () => {
    const { controller } = stand(online([request('1', 'sent', 'water', 1)]));
    const { container } = render(<RequestStatusLine controller={controller} />);
    expect(lines(container)).toEqual(['Water: Sent — your caregiver has not responded yet.']);
    const line = container.querySelector('.request-status-line')!;
    expect(line.querySelectorAll('button, a, [tabindex], [data-scan-id]')).toHaveLength(0);
    expect(line.querySelectorAll('[aria-live], [role]')).toHaveLength(0);
    expect(line.hasAttribute('aria-live') || line.hasAttribute('role')).toBe(false);
  });

  it('names who acknowledged, keeps Done visible, and shows an older open request beside it', () => {
    const { controller, emit } = stand(online([request('1', 'acknowledged', 'water', 1)]));
    const { container } = render(<RequestStatusLine controller={controller} />);
    expect(lines(container)).toEqual(['Water: Ward A acknowledged it.']);
    emit(online([request('1', 'completed', 'water', 1)]));
    expect(lines(container)).toEqual(['Water: Done.']);
    emit(online([request('1', 'completed', 'water', 1), request('2', 'sent', 'help', 2), request('3', 'cancelled', 'bathroom', 3)]));
    expect(lines(container)).toEqual(['Bathroom assistance: Cancelled.', 'General help: Sent — your caregiver has not responded yet.']);
  });

  it('shows two lines at most and says how many more are open', () => {
    const { controller } = stand(online([request('1', 'sent', 'water', 1), request('2', 'sent', 'help', 2), request('3', 'acknowledged', 'bathroom', 3)]));
    const { container } = render(<RequestStatusLine controller={controller} />);
    expect(lines(container)).toHaveLength(3);
    expect(lines(container)[2]).toBe('+1 more open — see Ask caregiver.');
  });

  it('marks statuses as last known while offline', () => {
    const { controller, emit } = stand(online([request('1', 'sent', 'water', 1)]));
    const { container } = render(<RequestStatusLine controller={controller} />);
    emit(online([request('1', 'sent', 'water', 1)], 'offline'));
    expect(lines(container)[0]).toContain('(last known, not confirmed right now)');
  });

  it('points a failed send to Ask caregiver, since the board has nothing to select', async () => {
    const { controller } = stand(online());
    controller.setActive(true);
    const { container } = render(<RequestStatusLine controller={controller} />);
    await act(async () => { controller.activate('request:water'); await Promise.resolve(); await Promise.resolve(); });
    const text = lines(container)[0] ?? '';
    expect(text).toContain('Not confirmed');
    expect(text).toContain('Open Ask caregiver to try again.');
    expect(text).not.toContain('Select it');
  });

  it('renders nothing when not paired or signed out', () => {
    const { controller, emit } = stand(online([request('1', 'sent', 'water', 1)]));
    const { container } = render(<RequestStatusLine controller={controller} />);
    emit({ ...online(), participants: [], requests: [], access: { version: 1, role: 'signed-out', group: null, participant: null, receiver_name: null } });
    expect(container.querySelector('.request-status-line')).toBeNull();
    const fresh = stand(online());
    const second = render(<RequestStatusLine controller={fresh.controller} />);
    expect(second.container.querySelector('.request-status-line')).toBeNull();
    expect(screen.queryAllByText(/Water:/)).toHaveLength(0);
  });
});
