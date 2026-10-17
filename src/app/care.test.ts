import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetSharedCareClientForTests, sharedCareClient } from './care';

const KEY = 'sb_publishable_abcdefghijklmnop1234';
const READY = { VITE_SUPABASE_URL: 'https://abcdefghij.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: KEY };

afterEach(async () => { await resetSharedCareClientForTests(); });

describe('sharedCareClient', () => {
  it('creates nothing at import: a fresh module still has no client to reset', async () => {
    vi.resetModules();
    const factory = vi.fn();
    vi.doMock('../care', async (original) => ({ ...(await original<typeof import('../care')>()), createSupabaseCareClient: factory }));
    await import('./care');
    await import('../Root');
    expect(factory).not.toHaveBeenCalled();
    vi.doUnmock('../care');
  });

  it('creates no client and makes no request when networking is not configured', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    expect(sharedCareClient({})).toEqual({ status: 'not-configured' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports invalid configuration without echoing the supplied values', () => {
    const state = sharedCareClient({ VITE_SUPABASE_URL: 'https://evil.example.com', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_supersecretvalue123456' });
    expect(state.status).toBe('invalid');
    const text = JSON.stringify(state);
    expect(text).not.toMatch(/evil\.example|supersecret/);
  });

  it('returns the same single client for the page on every call', () => {
    const first = sharedCareClient(READY);
    const second = sharedCareClient(READY);
    expect(first.status).toBe('ready');
    expect(second).toEqual(first);
    if (first.status === 'ready' && second.status === 'ready') expect(second.client).toBe(first.client);
  });

  it('refuses a second project in the same page instead of creating another identity', () => {
    expect(sharedCareClient(READY).status).toBe('ready');
    const other = sharedCareClient({ ...READY, VITE_SUPABASE_URL: 'https://zyxwvutsrq.supabase.co' });
    expect(other).toEqual({ status: 'invalid', message: 'The care connection could not start. Reload the page and try again.' });
  });

  it('can be created again after reset (hot reload) because the old client was disposed', async () => {
    const first = sharedCareClient(READY);
    await resetSharedCareClientForTests();
    const next = sharedCareClient(READY);
    expect(next.status).toBe('ready');
    if (first.status === 'ready' && next.status === 'ready') expect(next.client).not.toBe(first.client);
  });
});
