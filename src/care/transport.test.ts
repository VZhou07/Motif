import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseCareClient } from './client';
import type { CareClient } from './contracts';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
const A = '00000000-0000-4000-8000-000000000001';
const P = '00000000-0000-4000-8000-000000000002';
const G = '00000000-0000-4000-8000-000000000003';
const R = '00000000-0000-4000-8000-000000000004';
const date = '2026-10-17T12:00:00Z';
const config = { url: 'https://motif-test.supabase.co', publishableKey: 'sb_publishable_abcdefghijklmnop' };
const participant = { id: P, group_id: G, alias: 'A', user_id: A, revoked_at: null, created_at: date };
const access = { version: 1, role: 'participant', group: null, participant, receiver_name: 'Care group' };
let clients: CareClient[] = [];
function sdkFixture() {
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: { access_token: 'pinned-token' } }, error: null })),
    getUser: vi.fn(async () => ({ data: { user: { id: A, is_anonymous: true } }, error: null })),
    signInWithPassword: vi.fn(async () => ({ error: null })),
    signInAnonymously: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    initialize: vi.fn(async () => ({ error: null })),
    dispose: vi.fn(async () => {}),
  };
  vi.mocked(createClient).mockReturnValue({ auth } as unknown as ReturnType<typeof createClient>);
  return auth;
}
function make(other = config) { const client = createSupabaseCareClient(other); clients.push(client); return client; }
beforeEach(() => {
  clients = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    return new Response(JSON.stringify(url.endsWith('/rpc/motif_access') ? access : url.includes('/participants?') ? [participant] : []),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
});
afterEach(async () => { for (const client of clients) await client.dispose(); vi.unstubAllGlobals(); });

describe('real Supabase factory boundary', () => {
  it('validates configuration again before constructing an SDK or making requests', () => {
    const sdk = sdkFixture();
    expect(() => make({ ...config, url: 'https://evil.test' })).toThrow(/valid Supabase/);
    expect(() => make({ ...config, publishableKey: 'sb_secret_never-send' })).toThrow(/valid Supabase/);
    expect(createClient).not.toHaveBeenCalled(); expect(sdk.getSession).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('uses explicit public-key/token headers, server access and no redirect following', async () => {
    const sdk = sdkFixture(); const client = make(); await client.refresh();
    expect(sdk.getUser).toHaveBeenCalledWith('pinned-token');
    expect(fetch).toHaveBeenCalledWith(`${config.url}/rest/v1/rpc/motif_access`, expect.objectContaining({
      method: 'POST', redirect: 'error', body: '{}', headers: expect.objectContaining({ apikey: config.publishableKey, Authorization: 'Bearer pinned-token' }),
    }));
    expect(client.snapshot.access.participant?.id).toBe(P);
    expect(JSON.stringify(client.snapshot)).not.toContain('pinned-token');
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('realtime'), expect.anything());
  });
  it('does not construct a second SDK while the current one is active', async () => {
    const sdk = sdkFixture(); const client = make();
    expect(() => make()).toThrow(/existing care client/);
    expect(createClient).toHaveBeenCalledTimes(1);
    await client.dispose(); expect(sdk.dispose).toHaveBeenCalledTimes(1);
    const next = make(); expect(next).not.toBe(client);
    expect(createClient).toHaveBeenCalledTimes(2);
  });
  it('keeps the factory guard until SDK background cleanup has settled', async () => {
    const sdk = sdkFixture(); let release!: () => void;
    sdk.dispose.mockImplementationOnce(() => new Promise<void>((done) => { release = done; }));
    const client = make(); const disposing = client.dispose();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(sdk.dispose).toHaveBeenCalledTimes(1);
    expect(() => make()).toThrow(/existing care client/);
    release(); await disposing;
    expect(() => make()).not.toThrow();
  });
  it('gives different projects distinct persisted Auth storage namespaces', () => {
    sdkFixture(); make(); make({ ...config, url: 'https://other-project.supabase.co' });
    const options = vi.mocked(createClient).mock.calls.map((call) => call[2]?.auth?.storageKey);
    expect(options[0]).not.toBe(options[1]);
  });
  it('fails on a structurally valid send response for the wrong request or person', async () => {
    sdkFixture(); const client = make(); await client.refresh();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ version: 1, request: {
      id: A, group_id: G, participant_id: P, kind: 'water', status: 'sent', revision: 1, created_at: date, updated_at: date,
    } }), { status: 200 }));
    await expect(client.sendRequest(R, 'water')).rejects.toThrow(/does not match/);
    expect(client.snapshot.requests).toEqual([]);
  });
  it('does not call a failed HTTP operation Sent', async () => {
    sdkFixture(); const client = make(); await client.refresh();
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 403 }));
    await expect(client.sendRequest(R, 'water')).rejects.toMatchObject({ code: 'request_failed' });
    expect(client.snapshot.requests).toEqual([]);
  });
});
