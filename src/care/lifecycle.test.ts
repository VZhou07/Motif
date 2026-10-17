import { afterEach, expect, it, vi } from 'vitest';
import { createSupabaseCareClient } from './client';
import type { CareClient } from './contracts';

let client: CareClient | undefined;
afterEach(async () => {
  await client?.dispose();
  client = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

it('settles real SDK initialization before disposal so background work cannot restart', async () => {
  vi.useFakeTimers();
  localStorage.clear();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const network = vi.fn(() => Promise.reject(new Error('No backend is used in this lifecycle check.')));
  vi.stubGlobal('fetch', network);
  const config = { url: 'https://lifecycle-check.supabase.co', publishableKey: 'sb_publishable_abcdefghijklmnop' };
  client = createSupabaseCareClient(config);
  await client.dispose();
  await vi.advanceTimersByTimeAsync(100);
  expect(vi.getTimerCount()).toBe(0);
  expect(network).not.toHaveBeenCalled();
  client = createSupabaseCareClient(config);
  await client.dispose();
  await vi.advanceTimersByTimeAsync(100);
  expect(vi.getTimerCount()).toBe(0);
  expect(network).not.toHaveBeenCalled();
});
