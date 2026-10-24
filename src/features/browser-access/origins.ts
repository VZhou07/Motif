import type { RejectCode } from './protocol';

/** Exact scheme + host + port. Returns null for anything that is not an ordinary http(s) origin without userinfo. */
export function exactOrigin(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || parsed.username || parsed.password) return null;
    return parsed.origin;
  } catch { return null; }
}

export function sameOrigin(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = exactOrigin(a);
  return left !== null && left === exactOrigin(b);
}

/** Short text for the card ("en.wikipedia.org" or "127.0.0.1:3000"). */
export function describeOrigin(origin: string): string {
  try { return new URL(origin).host; } catch { return 'this page'; }
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost']);
/** Sign-in and store hosts Motif never offers, even if a helper asks. */
export const DENIED_HOSTS: ReadonlySet<string> = new Set([
  'chromewebstore.google.com', 'chrome.google.com', 'accounts.google.com', 'myaccount.google.com', 'login.microsoftonline.com',
  'login.live.com', 'appleid.apple.com', 'id.apple.com',
]);

export type AllowRequest = { ok: true; origin: string; pattern: string } | { ok: false; message: string };

/**
 * Validates a helper's typed or picked site. Exact origin only: no wildcard, no userinfo, https or loopback http.
 * The helper may paste a full address; only its origin is requested.
 */
export function normalizeAllowRequest(input: string): AllowRequest {
  const value = input.trim();
  if (!value || value.includes('*')) return { ok: false, message: 'Enter one exact site, such as https://en.wikipedia.org. Wildcards are not allowed.' };
  let parsed: URL;
  try { parsed = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`); }
  catch { return { ok: false, message: 'That is not a web address.' }; }
  if (parsed.username || parsed.password) return { ok: false, message: 'Addresses with a user name or password are not allowed.' };
  const loopback = parsed.protocol === 'http:' && LOOPBACK.has(parsed.hostname);
  if (parsed.protocol !== 'https:' && !loopback) return { ok: false, message: 'Only https sites (or localhost for testing) can be allowed.' };
  if (DENIED_HOSTS.has(parsed.hostname)) return { ok: false, message: 'Motif does not control store or sign-in pages.' };
  if (!loopback && !parsed.hostname.includes('.')) return { ok: false, message: 'Enter a full site name, such as en.wikipedia.org.' };
  if (/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname) && !loopback) return { ok: false, message: 'Numeric addresses are not allowed except localhost.' };
  return { ok: true, origin: parsed.origin, pattern: `${parsed.origin}/*` };
}

/** Maps a Chrome error message to a code. Unknown errors are execution failures, never silent success. */
export function classifyChromeError(message: string): RejectCode {
  const text = message.toLowerCase();
  if (text.includes('cannot find a next page') || text.includes('no next page')) return 'no-history';
  if (text.includes('error page') || text.includes('chrome-error://') || text.includes('chrome://') || text.includes('extensions gallery')
    || text.includes('cannot be scripted') || text.includes('file urls') || text.includes('cannot access a chrome')) return 'unsupported-page';
  if (text.includes('must request permission') || text.includes('cannot access contents of')) return 'permission-missing';
  if (text.includes('frame with id') || text.includes('was removed') || text.includes('navigat')) return 'page-changed';
  if (text.includes('no tab with id')) return 'tab-closed';
  return 'execution-failed';
}
