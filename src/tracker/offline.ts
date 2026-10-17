/**
 * Keeps every network request on this device (R10 revision 3). @mediapipe/tasks-vision 1.1.1
 * has a built-in usage logger that POSTs counters to Google every minute and on close; it has
 * no opt-out, so any fetch or beacon to another origin is refused before it reaches the network.
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

export function installOfflineGuard(win: GuardedWindow): void {
  const marked = win as GuardedWindow & { [GUARDED]?: true };
  if (marked[GUARDED]) return;
  marked[GUARDED] = true;
  win.motifBlockedRequests = 0;
  const block = () => { win.motifBlockedRequests = (win.motifBlockedRequests ?? 0) + 1; };
  const fetch = win.fetch;
  win.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (isLocal(url, win.location.href)) return fetch.call(win, input, init);
    block();
    return Promise.reject(new TypeError('Blocked: Motif never sends data off this device.'));
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
