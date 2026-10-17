import { afterEach, describe, expect, it, vi } from 'vitest';
import { CareService } from './client';
import type { CareCredential, CareTransport } from './client';
import { parseAccess, parseRequest } from './contracts';

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const PA = '00000000-0000-4000-8000-000000000003';
const GA = '00000000-0000-4000-8000-000000000004';
const GB = '00000000-0000-4000-8000-000000000005';
const RID = '00000000-0000-4000-8000-000000000006';
const date = '2026-10-17T12:00:00Z';
const participant = { id: PA, group_id: GA, alias: 'Alex', user_id: A, revoked_at: null as string | null, created_at: date };
const group = { id: GB, owner_id: B, name: 'B group', created_at: date };
const request = { id: RID, group_id: GA, participant_id: PA, kind: 'water', status: 'sent', revision: 1, created_at: date, updated_at: date };
function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
async function settle() { for (let i = 0; i < 30; i++) await Promise.resolve(); }
function fixture(initial: 'participant' | 'caregiver' | 'signed-out' = 'participant') {
  let current: CareCredential | null = initial === 'signed-out' ? null
    : initial === 'caregiver' ? { token: 'token-B', userId: B, anonymous: false } : { token: 'token-A', userId: A, anonymous: true };
  let callback = () => {};
  let revoked = false;
  let paired = initial === 'participant';
  const records: unknown[] = [];
  const access = (token: string) => token === 'token-B'
    ? { version: 1, role: 'caregiver', group, participant: null, receiver_name: 'B group' }
    : { version: 1, role: !paired ? 'unpaired' : revoked ? 'revoked' : 'participant', group: null,
      participant: paired ? { ...participant, revoked_at: revoked ? date : null } : null, receiver_name: paired && !revoked ? 'A group' : null };
  const implementation = async (name: string, args: Record<string, unknown>, token: string): Promise<unknown> => {
    if (name === 'motif_access') return access(token);
    if (name === 'motif_send_request') { records.push({ ...request, id: args.p_request_id, kind: args.p_kind }); return { version: 1, request: records.at(-1) }; }
    if (name === 'motif_redeem_invite') { paired = true; return { version: 1, ok: true, participant }; }
    if (name === 'motif_create_invite') return { version: 1, participant_id: PA, token: 'invite-token', expires_at: date };
    throw Error(`Unexpected test RPC ${name}`);
  };
  const transport = {
    auth: {
      credential: vi.fn(async () => current),
      signIn: vi.fn(async () => { current = { token: 'token-B', userId: B, anonymous: false }; callback(); }),
      signInAnonymous: vi.fn(async () => { current = { token: 'token-A', userId: A, anonymous: true }; callback(); }),
      signOut: vi.fn(async () => { current = null; callback(); }),
      onChange: vi.fn((cb: () => void) => { callback = cb; return vi.fn(); }),
    },
    rpc: vi.fn(implementation),
    list: vi.fn(async (table: string, token: string) => token === 'token-B' || revoked ? [] : table === 'participants' ? [{ ...participant }] : [...records]),
  } satisfies CareTransport;
  const client = new CareService(transport);
  return { client, transport, implementation, records, access, getCurrent: () => current,
    setCurrent: (value: CareCredential | null) => { current = value; }, emit: () => callback(), revoke: () => { revoked = true; } };
}
afterEach(() => vi.useRealTimers());

describe('care service contract and identity isolation', () => {
  it('loads only authorized snapshots, with no token in public state', async () => {
    const f = fixture();
    const state = await f.client.refresh();
    expect(state.access.role).toBe('participant');
    expect(state.participants).toEqual([participant]);
    expect(JSON.stringify(state)).not.toContain('token-A');
    state.participants.length = 0;
    expect(f.client.snapshot.participants).toHaveLength(1);
    await f.client.dispose();
  });
  it('sends the supplied idempotency ID and kind, never a client-chosen sender', async () => {
    const f = fixture(); await f.client.refresh();
    expect(await f.client.sendRequest(RID, 'water')).toEqual(request);
    expect(f.transport.rpc).toHaveBeenCalledWith('motif_send_request', { p_request_id: RID, p_kind: 'water' }, 'token-A', expect.any(AbortSignal));
    expect(f.client.snapshot.requests).toEqual([request]);
    await f.client.dispose();
  });
  it('keeps failed operations failed instead of fabricating a sent record', async () => {
    const f = fixture(); await f.client.refresh();
    f.transport.rpc.mockRejectedValueOnce(Error('offline'));
    await expect(f.client.sendRequest(RID, 'water')).rejects.toThrow('offline');
    expect(f.client.snapshot.requests).toEqual([]);
    await f.client.dispose();
  });
  it.each([
    { id: B }, { kind: 'help' }, { participant_id: B }, { group_id: B },
  ])('rejects mismatched mutation output %j before returning success', async (change) => {
    const f = fixture(); await f.client.refresh();
    f.transport.rpc.mockResolvedValueOnce({ version: 1, request: { ...request, ...change } });
    await expect(f.client.sendRequest(RID, 'water')).rejects.toThrow(/does not match/);
    expect(f.client.snapshot.requests).toEqual([]); await f.client.dispose();
  });
  it('checks invitation participant and transition revision/status correlations', async () => {
    const f = fixture('caregiver'); await f.client.refresh();
    f.transport.rpc.mockResolvedValueOnce({ version: 1, participant_id: B, token: 'wrong-invite', expires_at: date });
    await expect(f.client.createInvite(PA)).rejects.toThrow(/does not match/);
    f.transport.rpc.mockResolvedValueOnce({ version: 1, request: { ...request, group_id: GB, status: 'acknowledged', revision: 1 } });
    await expect(f.client.transitionRequest(RID, 1, 'acknowledged')).rejects.toThrow(/does not match/);
    await f.client.dispose();
  });
  it('fails closed on malformed or another participant snapshot', async () => {
    const f = fixture();
    f.transport.list.mockResolvedValueOnce([{ ...participant, id: B }]);
    await expect(f.client.refresh()).rejects.toThrow(/does not match/);
    expect(f.client.snapshot.connection).toBe('offline');
    expect(f.client.snapshot.requests).toEqual([]);
    await f.client.dispose();
  });
  it('serializes actual SDK identity writes, then reconciles delayed old callbacks', async () => {
    const f = fixture('signed-out'); const first = deferred();
    f.transport.auth.signIn.mockImplementationOnce(async () => { await first.promise; f.setCurrent({ token: 'token-A', userId: A, anonymous: true }); f.emit(); });
    const a = f.client.signIn('a@example.com', 'a').catch((e: unknown) => e);
    await settle();
    const b = f.client.signIn('b@example.com', 'b');
    expect(f.transport.auth.signIn).toHaveBeenCalledTimes(1);
    first.resolve(); await a;
    expect((await b).access.role).toBe('caregiver');
    expect(f.getCurrent()?.userId).toBe(B);
    f.emit(); await settle(); await f.client.refresh();
    expect(f.client.snapshot.access.group?.owner_id).toBe(B);
    expect(f.getCurrent()?.userId).toBe(B);
    await f.client.dispose();
  });
  it('rejects an old queued Send before dispatch when another sign-in is requested', async () => {
    const f = fixture(); await f.client.refresh();
    const blocked = deferred<unknown>();
    f.transport.rpc.mockImplementationOnce(() => blocked.promise);
    const read = f.client.refresh().catch((e: unknown) => e); await settle();
    const send = f.client.sendRequest(RID, 'water').catch((e: unknown) => e);
    const login = f.client.signIn('b@example.com', 'b');
    blocked.resolve(f.access('token-A')); await read;
    expect(await send).toMatchObject({ code: 'session_changed' });
    await login;
    expect(f.transport.rpc.mock.calls.filter(([name]) => name === 'motif_send_request')).toHaveLength(0);
    expect(f.client.snapshot.access.group?.owner_id).toBe(B);
    await f.client.dispose();
  });
  it('an already dispatched send stays pinned to A while B waits, never sending as B', async () => {
    const f = fixture(); await f.client.refresh(); const blocked = deferred<unknown>();
    f.transport.rpc.mockImplementationOnce(async (name, args, token) => { await blocked.promise; return f.implementation(name, args, token); });
    const send = f.client.sendRequest(RID, 'water').catch((e: unknown) => e); await settle();
    const login = f.client.signIn('b@example.com', 'b');
    expect(f.transport.auth.signIn).not.toHaveBeenCalled();
    blocked.resolve(undefined);
    expect(await send).toMatchObject({ code: 'session_changed' });
    await login;
    expect(f.transport.rpc.mock.calls.find(([name]) => name === 'motif_send_request')?.[2]).toBe('token-A');
    expect(f.client.snapshot.requests).toEqual([]);
    expect(f.getCurrent()?.userId).toBe(B);
    await f.client.dispose();
  });
  it('signs out, clears private data and refuses further queued operations', async () => {
    const f = fixture(); await f.client.refresh(); await f.client.sendRequest(RID, 'water');
    await f.client.signOut();
    expect(f.client.snapshot.access.role).toBe('signed-out');
    expect(f.client.snapshot.requests).toEqual([]);
    await expect(f.client.sendRequest(RID, 'water')).rejects.toMatchObject({ code: 'auth_required' });
    await f.client.dispose();
  });
  it('revoked binding clears requests and changes the consumer epoch', async () => {
    const f = fixture(); await f.client.refresh(); await f.client.sendRequest(RID, 'water');
    const before = f.client.snapshot.epoch; f.revoke();
    const state = await f.client.refresh();
    expect(state.access.role).toBe('revoked'); expect(state.epoch).toBeGreaterThan(before);
    expect(state.requests).toEqual([]);
    await expect(f.client.sendRequest(RID, 'water')).rejects.toMatchObject({ code: 'auth_required' });
    await f.client.dispose();
  });
  it('pairs a new anonymous identity and refuses a caregiver identity', async () => {
    const f = fixture('signed-out');
    expect((await f.client.pair('invite')).access.role).toBe('participant');
    expect(f.transport.auth.signInAnonymous).toHaveBeenCalledTimes(1);
    await f.client.dispose();
    const g = fixture('caregiver');
    await expect(g.client.pair('invite')).rejects.toMatchObject({ code: 'wrong_role' });
    expect(g.transport.rpc).not.toHaveBeenCalled(); await g.client.dispose();
  });
  it('never redeems an old invitation after a new account change was queued', async () => {
    const f = fixture('signed-out'); const credentials = deferred<CareCredential | null>();
    f.transport.auth.credential.mockImplementationOnce(() => credentials.promise);
    const pair = f.client.pair('invite').catch((e: unknown) => e); await settle();
    const login = f.client.signIn('b@example.com', 'b'); credentials.resolve(null);
    expect(await pair).toMatchObject({ code: 'session_changed' }); await login;
    expect(f.transport.rpc.mock.calls.filter(([name]) => name === 'motif_redeem_invite')).toHaveLength(0);
    await f.client.dispose();
  });
  it('polls without overlap and disposes timers and delayed work', async () => {
    vi.useFakeTimers(); const f = fixture(); const blocked = deferred<unknown>();
    f.transport.rpc.mockImplementationOnce(() => blocked.promise);
    const listener = vi.fn(); f.client.watch(listener); await settle();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(f.transport.rpc).toHaveBeenCalledTimes(1);
    const disposed = f.client.dispose(); blocked.resolve(f.access('token-A')); await disposed;
    const calls = f.transport.rpc.mock.calls.length; f.emit(); await vi.advanceTimersByTimeAsync(6_000);
    expect(f.transport.rpc).toHaveBeenCalledTimes(calls);
    expect(vi.getTimerCount()).toBe(0);
    await expect(f.client.refresh()).rejects.toMatchObject({ code: 'disposed' });
  });
  it('recovers a watched offline snapshot on the next poll, but stops after sign-out', async () => {
    vi.useFakeTimers(); const f = fixture(); f.client.watch(() => {}); await settle();
    expect(f.client.snapshot.connection).toBe('online');
    f.transport.rpc.mockRejectedValueOnce(Error('temporary outage'));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(f.client.snapshot.connection).toBe('offline');
    expect(f.client.snapshot.requests).toEqual([]);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(f.client.snapshot.connection).toBe('online');
    expect(f.client.snapshot.access.participant?.id).toBe(PA);
    await f.client.signOut();
    const calls = f.transport.rpc.mock.calls.length;
    await vi.advanceTimersByTimeAsync(6_000);
    expect(f.transport.rpc).toHaveBeenCalledTimes(calls);
    expect(vi.getTimerCount()).toBe(0);
    await f.client.dispose();
  });
  it('rejects malformed roles, identity mismatches and nonfinite request revisions', () => {
    const f = fixture();
    expect(() => parseAccess(f.access('token-B'), A, true)).toThrow(/identity/);
    expect(() => parseAccess({ ...f.access('token-A'), version: 2 }, A, true)).toThrow(/version/);
    expect(() => parseRequest({ ...request, revision: NaN })).toThrow(/invalid/);
    expect(() => parseRequest({ ...request, status: 'approved' })).toThrow(/invalid/);
  });
});
