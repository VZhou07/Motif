import { vi } from 'vitest';
import type { CareClient, CareRequest, CareSnapshot } from '../../care';
import type { SoundPort, SoundState } from './sound';
import { signedOut } from './fixtures.test-support';

/** Test-only CareClient reproducing the real client's published shapes (offline = signed-out + empty, same epoch). */
export class FakeCareClient implements CareClient {
  private current: CareSnapshot = signedOut({ epoch: 0 });
  private readonly listeners = new Set<(snapshot: CareSnapshot) => void>();
  readonly refresh = vi.fn(async () => this.snapshot);
  readonly signIn = vi.fn(async (_email: string, _password: string) => this.snapshot);
  readonly pair = vi.fn(async (_token: string) => this.snapshot);
  readonly signOut = vi.fn(async () => {});
  readonly createGroup = vi.fn(async (_name: string) => { throw new Error('not set'); }) as unknown as CareClient['createGroup'] & ReturnType<typeof vi.fn>;
  readonly createParticipant = vi.fn(async (_alias: string) => { throw new Error('not set'); }) as unknown as CareClient['createParticipant'] & ReturnType<typeof vi.fn>;
  readonly createInvite = vi.fn(async (_id: string) => { throw new Error('not set'); }) as unknown as CareClient['createInvite'] & ReturnType<typeof vi.fn>;
  readonly revokeParticipant = vi.fn(async (_id: string) => { throw new Error('not set'); }) as unknown as CareClient['revokeParticipant'] & ReturnType<typeof vi.fn>;
  readonly sendRequest = vi.fn(async () => { throw new Error('caregivers never send'); }) as unknown as CareClient['sendRequest'];
  readonly transitionRequest = vi.fn(async (id: string, revision: number, status: 'acknowledged' | 'completed' | 'cancelled'): Promise<CareRequest> => {
    const found = this.current.requests.find((request) => request.id === id)!;
    return { ...found, status, revision: revision + 1 };
  });
  readonly clearGroup = vi.fn(async () => {});
  readonly dispose = vi.fn(async () => {});
  get snapshot(): CareSnapshot { return structuredClone(this.current); }
  get watchers(): number { return this.listeners.size; }
  watch(listener: (snapshot: CareSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => { this.listeners.delete(listener); };
  }
  /** Publish a snapshot exactly as the real client would. */
  emit(snapshot: CareSnapshot): void {
    this.current = snapshot;
    for (const listener of this.listeners) listener(this.snapshot);
  }
}

export function fakeSound() {
  let state: SoundState = 'off';
  const enable = vi.fn(async () => { state = 'on'; return true; });
  const disable = vi.fn(() => { state = 'off'; });
  const chime = vi.fn(() => {});
  const port: SoundPort = { get state() { return state; }, enable, disable, chime };
  return { port, enable, disable, chime };
}

export function manualClock(start = 1_000) {
  const clock = { monoNow: start, wallNow: Date.parse('2026-10-17T12:00:00Z'), mono: () => clock.monoNow, wall: () => clock.wallNow,
    advance(ms: number) { clock.monoNow += ms; clock.wallNow += ms; } };
  return clock;
}
