import { createSupabaseCareClient, parseCareConfig, type CareClient } from '../care';

export type CareState =
  | { status: 'ready'; client: CareClient }
  | { status: 'not-configured' }
  | { status: 'invalid'; message: string };

const START_FAILED = 'The care connection could not start. Reload the page and try again.';
let shared: { url: string; client: CareClient } | null = null;

/**
 * One care client per page, created on first use (never at import) and kept across route
 * switches, so one page always has exactly one account identity.
 */
export function sharedCareClient(env: Record<string, unknown> = import.meta.env): CareState {
  const parsed = parseCareConfig(env);
  if (parsed.status !== 'ready') return parsed;
  if (shared) return shared.url === parsed.config.url ? { status: 'ready', client: shared.client } : { status: 'invalid', message: START_FAILED };
  try {
    const client = createSupabaseCareClient(parsed.config);
    shared = { url: parsed.config.url, client };
    return { status: 'ready', client };
  } catch {
    return { status: 'invalid', message: START_FAILED };
  }
}

export async function resetSharedCareClientForTests(): Promise<void> {
  const previous = shared;
  shared = null;
  await previous?.client.dispose();
}

// A hot reload re-evaluates this module; release the old client so the factory guard allows a new one.
if (import.meta.hot) import.meta.hot.dispose(() => resetSharedCareClientForTests());
