import { validatedCareOrigin, type CareConfig } from '../care/config';

/**
 * Default-deny network policy (R10/R16). @mediapipe/tasks-vision 1.1.1
 * has a built-in usage logger that POSTs counters to Google every minute and on close; it has
 * no opt-out. Only explicitly configured care Auth/REST fetches may leave the device;
 * other remote fetches and all remote beacons are refused before reaching the network.
 * The Content-Security-Policy in index.html is the second layer.
 */
type GuardedWindow = Pick<Window, 'fetch' | 'location' | 'navigator'> & { motifBlockedRequests?: number };

const GUARDED = Symbol.for('motif.offlineGuard');

function isLocal(url: string, base: string): boolean {
  try {
    const resolved = new URL(url, base);
    return resolved.protocol === 'blob:' || resolved.protocol === 'data:' || resolved.origin === new URL(base).origin;
  } catch {
    return false;
  }
}

export function installOfflineGuard(win: GuardedWindow, config?: CareConfig): void {
  const marked = win as GuardedWindow & { [GUARDED]?: true };
  if (marked[GUARDED]) return;
  marked[GUARDED] = true;
  win.motifBlockedRequests = 0;
  const block = () => { win.motifBlockedRequests = (win.motifBlockedRequests ?? 0) + 1; };
  const careOrigin = validatedCareOrigin(config);
  const fetch = win.fetch;
  win.fetch = (input, init) => {
    // String conversion also handles URL objects from another window/realm.
    const url = typeof input === 'string' ? input : 'url' in input ? input.url : String(input);
    if (isLocal(url, win.location.href)) return fetch.call(win, input, init);
    try {
      const resolved = new URL(url, win.location.href);
      if (careOrigin && resolved.origin === careOrigin && !resolved.username && !resolved.password
        && (resolved.pathname.startsWith('/auth/v1/') || resolved.pathname.startsWith('/rest/v1/'))) {
        // Fetch redirects otherwise bypass this wrapper. API calls never need them.
        return fetch.call(win, input, { ...init, redirect: 'error' });
      }
    } catch { /* Invalid URLs are denied below. */ }
    block();
    return Promise.reject(new TypeError(careOrigin ? 'Blocked: this connection is outside the approved care API.' : 'Blocked: Motif never sends data off this device.'));
  };
  const beacon = win.navigator.sendBeacon;
  if (typeof beacon === 'function') {
    win.navigator.sendBeacon = (url, data) => {
      if (isLocal(String(url), win.location.href)) return beacon.call(win.navigator, url, data);
      block();
      return false;
    };
  }
}
