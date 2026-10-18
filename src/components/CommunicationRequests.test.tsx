import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CareClient, CareRequest, CareSnapshot } from '../care';
import { Harness } from '../app/session.test-support';
import { ParticipantRequestController } from '../features/participant-requests/controller';
import { CommunicationView } from './CommunicationView';

/** W1 screen wiring. A stand-in client publishes snapshots (PGlite cannot load in jsdom); delivery is covered in session.requests.test.ts. */
const PID = '00000000-0000-4000-8000-0000000000a1';
const participant = { id: PID, group_id: '00000000-0000-4000-8000-0000000000b1', alias: 'Alex', user_id: '00000000-0000-4000-8000-0000000000c1', revoked_at: null, created_at: '2026-10-17T12:00:00Z' };
const snapshot: CareSnapshot = { epoch: 1, connection: 'online', error: null, participants: [participant], requests: [],
  access: { version: 1, role: 'participant', group: null, participant, receiver_name: 'Ward A' } };

function paired() {
  const client = {
    get snapshot() { return snapshot; },
    watch: (listener: (s: CareSnapshot) => void) => { listener(snapshot); return () => {}; },
    refresh: vi.fn(async () => snapshot),
    sendRequest: vi.fn(() => new Promise<CareRequest>(() => {})),
    transitionRequest: vi.fn(() => new Promise<CareRequest>(() => {})),
    pair: vi.fn(async () => snapshot),
    signOut: vi.fn(async () => {}),
  } as unknown as CareClient & { sendRequest: ReturnType<typeof vi.fn> };
  let h: Harness | null = null;
  const requests = new ParticipantRequestController({ client, announce: (text) => h?.session.announceExternal(text) });
  h = new Harness({ requests });
  h.setUpToCommunication();
  return { client, requests, h };
}

describe('communication screen with caregiver requests (W1)', () => {
  it('shows the Ask button on the board, the request buttons inside it once, and the pairing card in the Helper', () => {
    const { requests, h } = paired();
    const view = render(<CommunicationView snapshot={h.snap} session={h.session} requests={requests} />);
    expect(screen.getByRole('button', { name: 'Ask caregiver' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ask for water' })).toBeNull();
    act(() => { h.session.selectTarget('ask'); });
    view.rerender(<CommunicationView snapshot={h.snap} session={h.session} requests={requests} />);
    expect(screen.getAllByRole('button', { name: 'Ask for water' })).toHaveLength(1);
    act(() => { h.session.selectTarget('back'); h.session.selectTarget('more'); });
    view.rerender(<CommunicationView snapshot={h.snap} session={h.session} requests={requests} />);
    expect(screen.getByText('Caregiver requests: pair this device')).toBeTruthy();
  });

  it('a helper click on Ask opens it and a click on Water sends exactly once', () => {
    const { client, requests, h } = paired();
    const view = render(<CommunicationView snapshot={h.snap} session={h.session} requests={requests} />);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Ask caregiver' })); });
    view.rerender(<CommunicationView snapshot={h.snap} session={h.session} requests={requests} />);
    expect(screen.getByRole('heading', { name: 'Ask caregiver' })).toBeTruthy();
    expect(screen.getAllByRole('group', { name: 'Requests' })).toHaveLength(1);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Ask for water' })); });
    expect(client.sendRequest).toHaveBeenCalledTimes(1);
  });
});
