import type { ChromeLike, ChromeTab } from './chrome-like';
import {
  accessKey, describeIdentity, identityKey, isBlocked, type BrowserHostSession, type BrowserRequest, type CareIdentitySource, type IdentityState,
} from './host';
import { describeOrigin, exactOrigin, normalizeAllowRequest, sameOrigin } from './origins';
import type { BrowserPort } from './port';
import { DEFAULT_TTL_MS, DROPS_SCOPE, IDLE_RETURN_MS, REJECT_TEXT, type RejectCode } from './protocol';

export type DropReason = RejectCode | 'tracking-lost' | 'hidden' | 'idle' | 'scope-ended' | 'tab-changed' | 'left-site' | 'lock-lost' | 'permission-removed' | 'unload' | 'detached';

const DROP_TEXT: Record<Exclude<DropReason, RejectCode>, string> = {
  'tracking-lost': 'Tracking was lost, so browser control stopped. You are back on your messages.',
  hidden: 'Motif was hidden, so browser control stopped. You are back on your messages.',
  idle: 'Returned to your messages after a few minutes without a browser action.',
  'scope-ended': 'You are back on your messages.',
  'tab-changed': 'The page was switched, so browser control stopped. You are back on your messages.',
  'left-site': 'You left the allowed site, so browser control stopped. You are back on your messages.',
  'lock-lost': 'Another Motif window took over, so browser control stopped. You are back on your messages.',
  'permission-removed': 'Permission for the site was removed, so browser control stopped. You are back on your messages.',
  unload: 'Motif is closing.',
  detached: 'Browser control is no longer available. You are back on your messages.',
};
const dropText = (reason: DropReason): string => (reason in DROP_TEXT ? DROP_TEXT[reason as keyof typeof DROP_TEXT] : REJECT_TEXT[reason as RejectCode]);

export interface ControllerState {
  phase: 'idle' | 'binding' | 'controlling';
  origin: string | null;
  /** Latest plain-language message (also announced). */
  message: string | null;
  code: DropReason | null;
  blocked: boolean;
  identity: string;
}

export interface Timers {
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface ControllerDeps {
  session: BrowserHostSession;
  care: CareIdentitySource;
  port: BrowserPort;
  chrome: Pick<ChromeLike, 'tabs' | 'permissions'>;
  /** Controller monotonic clock (performance.now). */
  now: () => number;
  announce?: (text: string) => void;
  newId?: () => string;
  idleMs?: number;
  ttlMs?: number;
  timers?: Timers;
  /** Runs callbacks after the current synchronous work (listener callbacks must not rebuild the scanner re-entrantly). */
  defer?: (callback: () => void) => void;
}

const IDLE_WARNING_MS = 30_000;
const IDLE_TICK_MS = 1_000;

/**
 * Owns the lifecycle around the port: binding, scope, tab and permission events, identity, idle return.
 * Invariant: a binding exists if and only if the session is in browser scope.
 */
export class BrowserController {
  private readonly idleMs: number;
  private readonly ttlMs: number;
  private readonly defer: (callback: () => void) => void;
  private readonly timers: Timers;
  private readonly announce: (text: string) => void;
  private readonly newId: () => string;
  private state: ControllerState;
  private readonly listeners = new Set<() => void>();
  private cleanups: Array<() => void> = [];
  private browsePending = false;
  private entering = false;
  private boundAccess: string | null = null;
  private reconcileQueued = false;
  private idleTimer: unknown;
  private idleAccumulatedMs = 0;
  private lastIdleTick = 0;
  private idleWarned = false;
  private started = false;

  constructor(private readonly deps: ControllerDeps) {
    this.idleMs = deps.idleMs ?? IDLE_RETURN_MS;
    this.ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
    this.defer = deps.defer ?? ((callback) => queueMicrotask(callback));
    this.timers = deps.timers ?? { setInterval: (cb, ms) => setInterval(cb, ms), clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>) };
    this.announce = deps.announce ?? (() => {});
    this.newId = deps.newId ?? (() => crypto.randomUUID());
    this.state = this.baseState();
  }

  getState(): ControllerState { return this.state; }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }

  private baseState(): ControllerState {
    const identity = this.deps.care.getIdentity();
    return { phase: 'idle', origin: null, message: null, code: null, blocked: isBlocked(identity), identity: describeIdentity(identity) };
  }
  private set(patch: Partial<ControllerState>): void {
    this.state = { ...this.state, ...patch, blocked: isBlocked(this.deps.care.getIdentity()), identity: describeIdentity(this.deps.care.getIdentity()) };
    for (const listener of [...this.listeners]) listener();
  }
  private say(code: DropReason | null, text: string): void { this.set({ code, message: text }); this.announce(text); }

  start(): () => void {
    if (this.started) return () => this.dispose();
    this.started = true;
    const { session, care, chrome } = this.deps;
    session.setBrowserSink(this.onRequest);
    this.cleanups.push(() => session.setBrowserSink(null));
    this.cleanups.push(session.onFailClosed(this.onFailClosed));
    this.cleanups.push(session.subscribe(this.scheduleReconcile));
    this.cleanups.push(care.subscribe(this.scheduleReconcile));
    const { tabs, permissions } = chrome;
    const onActivated = (info: { tabId: number; windowId: number }) => {
      const binding = this.deps.port.binding;
      if (binding && info.windowId === binding.windowId && info.tabId !== binding.tabId) this.drop('tab-changed');
    };
    const onUpdated = (tabId: number, change: { url?: string; status?: string }, tab: ChromeTab) => {
      const binding = this.deps.port.binding;
      if (!binding || tabId !== binding.tabId) return;
      const url = change.url ?? tab.url;
      if (change.url === undefined && change.status === undefined) return;
      if (!url || !sameOrigin(url, binding.origin)) { this.drop('left-site'); return; }
      this.deps.port.invalidate(); // same-origin navigation: cancel the in-flight command, keep the binding
    };
    const onRemoved = (tabId: number) => { if (this.deps.port.binding?.tabId === tabId) this.drop('tab-changed'); };
    const onReplaced = (added: number, removed: number) => { if (this.deps.port.binding && (this.deps.port.binding.tabId === removed || this.deps.port.binding.tabId === added)) this.drop('tab-changed'); };
    const onPermissionRemoved = (removedPermissions: { origins?: string[] }) => {
      const binding = this.deps.port.binding;
      if (!binding) return;
      if (!removedPermissions.origins || removedPermissions.origins.includes(`${binding.origin}/*`)) this.drop('permission-removed');
    };
    tabs.onActivated.addListener(onActivated); this.cleanups.push(() => tabs.onActivated.removeListener(onActivated));
    tabs.onUpdated.addListener(onUpdated); this.cleanups.push(() => tabs.onUpdated.removeListener(onUpdated));
    tabs.onRemoved.addListener(onRemoved); this.cleanups.push(() => tabs.onRemoved.removeListener(onRemoved));
    tabs.onReplaced.addListener(onReplaced); this.cleanups.push(() => tabs.onReplaced.removeListener(onReplaced));
    permissions.onRemoved.addListener(onPermissionRemoved); this.cleanups.push(() => permissions.onRemoved.removeListener(onPermissionRemoved));
    return () => this.dispose();
  }

  dispose(): void {
    if (!this.started) return;
    this.started = false;
    this.stopIdle();
    this.deps.port.release();
    const cleanups = this.cleanups;
    this.cleanups = [];
    for (const cleanup of cleanups) cleanup();
    if (this.deps.session.getHostState().scope === 'browser') this.deps.session.returnToCommunication();
  }

  /** The panel became hidden or is unloading, or the runtime lock was lost. */
  notifyHidden(): void { this.drop('hidden'); }
  notifyLockLost(): void { this.drop('lock-lost'); }

  // ── Requests from the session ───────────────────────────────────────────

  private readonly onRequest = (request: BrowserRequest): void => {
    // Never leave a rejection unhandled: any unexpected failure ends control with a plain reason.
    const failed = () => { this.browsePending = false; this.drop('execution-failed'); };
    if (request === 'browse') { void this.browse().catch(failed); return; }
    void this.command(request).catch(failed);
  };

  private async browse(): Promise<void> {
    const { session, care, port, chrome } = this.deps;
    if (this.browsePending) { this.say('busy', 'Already looking for a page. Please wait.'); return; }
    const identity = care.getIdentity();
    if (isBlocked(identity)) { this.say('identity-changed', 'Browser control is not available for this account.'); return; }
    // Everything that must still hold when the asynchronous binding finishes.
    const epoch = session.getInputEpoch();
    const access = accessKey(identity);
    this.browsePending = true;
    this.set({ phase: 'binding', message: 'Looking for the page you are viewing...', code: null });
    try {
      const abort = (): boolean => session.getInputEpoch() !== epoch || accessKey(care.getIdentity()) !== access;
      let tabs: ChromeTab[];
      try { tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); } catch { this.fail('execution-failed'); return; }
      if (abort()) { this.set({ phase: 'idle' }); return; }
      const tab = tabs.find((candidate) => candidate.id !== undefined && candidate.windowId !== undefined);
      const origin = exactOrigin(tab?.url);
      if (!tab || tab.id === undefined || tab.windowId === undefined || !origin) { this.fail('unsupported-page'); return; }
      const bound = await port.bind({ tabId: tab.id, windowId: tab.windowId, origin });
      if (abort()) { port.release(); this.set({ phase: 'idle' }); return; }
      if (!bound.ok) { this.fail(bound.reason); return; }
      this.entering = true;
      let entered = false;
      try { entered = session.enterBrowserScope(); } finally { this.entering = false; }
      if (!entered) { port.release(); this.set({ phase: 'idle' }); return; }
      this.boundAccess = access;
      this.resetIdle();
      this.startIdle();
      this.set({ phase: 'controlling', origin, code: null, message: `Controlling ${describeOrigin(origin)}.` });
      this.announce(`Browser controls for ${describeOrigin(origin)}. Return to messages is the last item.`);
    } finally { this.browsePending = false; }
  }

  private fail(reason: RejectCode): void {
    this.deps.port.release();
    this.set({ phase: 'idle', origin: null });
    this.say(reason, REJECT_TEXT[reason]);
  }

  private async command(request: Exclude<BrowserRequest, 'browse'>): Promise<void> {
    const { session, care, port } = this.deps;
    const identity = care.getIdentity();
    const now = this.deps.now();
    this.resetIdleOnly();
    const result = await port.execute({
      version: 1, id: this.newId(), action: request, inputEpoch: session.getInputEpoch(), accessEpoch: identity.epoch, issuedAtMs: now, expiresAtMs: now + this.ttlMs,
    });
    if (result.status === 'executed') {
      this.say(null, request === 'back' ? 'Went back.' : request === 'scroll-down' ? 'Scrolled down.' : 'Scrolled up.');
      if (request === 'back') void this.verifyAfterBack();
      return;
    }
    const reason = (result.reason ?? 'execution-failed') as RejectCode;
    // Control already ended for a better reason (tracking loss, new person, ...): do not overwrite that message.
    if (reason === 'invalidated' && !(this.deps.port.binding && this.deps.session.getHostState().scope === 'browser')) return;
    if (DROPS_SCOPE.has(reason)) { this.drop(reason); return; }
    this.say(reason, REJECT_TEXT[reason]);
  }

  /** Back may land on another site; success is reported, then control ends with a clear reason. */
  private async verifyAfterBack(): Promise<void> {
    const binding = this.deps.port.binding;
    if (!binding) return;
    try {
      const tab = await this.deps.chrome.tabs.get(binding.tabId);
      const current = this.deps.port.binding;
      if (current && current.tabId === binding.tabId && (!tab.url || !sameOrigin(tab.url, current.origin))) this.drop('left-site');
    } catch { this.drop('tab-changed'); }
  }

  // ── Fail-closed handling ────────────────────────────────────────────────

  private readonly onFailClosed = (): void => {
    // Synchronous: cancel whatever is in flight now. The scope change itself waits until the session finished its work.
    if (this.entering) return;
    this.deps.port.invalidate();
    this.scheduleReconcile();
  };

  private readonly scheduleReconcile = (): void => {
    if (this.reconcileQueued) return;
    this.reconcileQueued = true;
    this.defer(() => { this.reconcileQueued = false; this.reconcile(); });
  };

  /** Enforces: binding exists iff browser scope, and the scope only continues while input, access and the page stay valid. */
  reconcile(): void {
    if (!this.started) return;
    const { session, care, port } = this.deps;
    const host = session.getHostState();
    const identity: IdentityState = care.getIdentity();
    const bound = port.binding;
    if (this.entering || this.browsePending) return;
    if (bound && host.scope !== 'browser') { this.drop('scope-ended'); return; }
    if (host.scope === 'browser' && !bound) { this.drop('not-bound'); return; }
    if (host.scope !== 'browser' || !bound) {
      if (this.state.blocked !== isBlocked(identity) || this.state.identity !== describeIdentity(identity)) this.set({});
      return;
    }
    if (isBlocked(identity) || accessKey(identity) !== this.boundAccess || bound.identityKey !== identityKey(identity)) { this.drop('identity-changed'); return; }
    if (host.hidden) { this.drop('hidden'); return; }
    if (host.tracking !== 'tracked' || host.camera !== 'running') { this.drop('tracking-lost'); return; }
  }

  /** Release the binding and go back to messages, with a visible reason. Idempotent. */
  drop(reason: DropReason): void {
    const { session, port } = this.deps;
    const wasControlling = port.binding !== null || session.getHostState().scope === 'browser';
    port.release();
    this.boundAccess = null;
    this.stopIdle();
    if (session.getHostState().scope === 'browser') session.returnToCommunication();
    if (!wasControlling) return;
    this.set({ phase: 'idle', origin: null });
    this.say(reason, dropText(reason));
  }

  // ── Idle return (does not count paused or untracked time) ───────────────

  private resetIdle(): void { this.idleAccumulatedMs = 0; this.idleWarned = false; this.lastIdleTick = this.deps.now(); }
  private resetIdleOnly(): void { this.idleAccumulatedMs = 0; this.idleWarned = false; }
  private startIdle(): void {
    this.stopIdle();
    this.idleTimer = this.timers.setInterval(() => this.idleTick(), IDLE_TICK_MS);
  }
  private stopIdle(): void { if (this.idleTimer !== undefined) { this.timers.clearInterval(this.idleTimer); this.idleTimer = undefined; } }
  /** Exposed for tests with a fake clock. */
  idleTick(): void {
    const now = this.deps.now();
    const elapsed = Math.min(Math.max(now - this.lastIdleTick, 0), 2 * IDLE_TICK_MS);
    this.lastIdleTick = now;
    const host = this.deps.session.getHostState();
    if (host.scope !== 'browser') return;
    if (host.paused || host.tracking !== 'tracked' || host.hidden) return;
    this.idleAccumulatedMs += elapsed;
    if (!this.idleWarned && this.idleAccumulatedMs >= this.idleMs - IDLE_WARNING_MS) {
      this.idleWarned = true;
      this.announce('Returning to your messages in 30 seconds. Use a browser action to stay.');
    }
    if (this.idleAccumulatedMs >= this.idleMs) this.drop('idle');
  }

  // ── Helper-only permission actions (must be called from a click handler) ─

  async allowSite(input: string): Promise<{ ok: true; origin: string } | { ok: false; message: string }> {
    const request = normalizeAllowRequest(input);
    if (!request.ok) return request;
    let granted = false;
    try { granted = await this.deps.chrome.permissions.request({ origins: [request.pattern] }); } catch { granted = false; }
    return granted ? { ok: true, origin: request.origin } : { ok: false, message: 'The browser did not grant access to that site.' };
  }
  async revokeSite(origin: string): Promise<boolean> {
    if (exactOrigin(origin) !== origin) return false;
    const removed = await this.deps.chrome.permissions.remove({ origins: [`${origin}/*`] });
    if (this.deps.port.binding?.origin === origin) this.drop('permission-removed');
    return removed;
  }
}
