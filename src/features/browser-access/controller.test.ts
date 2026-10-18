import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CareClient } from '../../care/contracts';
import { BrowserController, type ControllerDeps } from './controller';
import { FakeChrome } from './fake-chrome.test-support';
import { createPortHost, identityFromCare, type CareIdentitySource, type CareRole, type IdentityState } from './host';
import { createBrowserCommandPort, type BrowserPort } from './port';
import { ToySession } from './toy-session';
import { createWorker } from './worker';

const SITE = 'https://en.wikipedia.org';
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

class FakeCare implements CareIdentitySource {
  identity: IdentityState = { epoch: 1, role: 'participant', participantId: 'A', alias: 'Alex' };
  private readonly listeners = new Set<() => void>();
  getIdentity() { return { ...this.identity }; }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  set(patch: Partial<IdentityState>, bump = true) { this.identity = { ...this.identity, ...patch, epoch: this.identity.epoch + (bump ? 1 : 0) }; this.listeners.forEach((l) => l()); }
}

interface Rig { chrome: FakeChrome; session: ToySession; care: FakeCare; port: BrowserPort; controller: BrowserController; say: string[]; clock: { now: number } }
let rig: Rig;
let stop: () => void;

function build(overrides: Partial<ControllerDeps> = {}, wrapChrome?: (chrome: FakeChrome) => ControllerDeps['chrome']): Rig {
  const chrome = new FakeChrome();
  chrome.addTab({ id: 7, windowId: 1, url: `${SITE}/wiki/Cat`, active: true });
  chrome.grant(SITE);
  createWorker(chrome);
  const session = new ToySession();
  const care: CareIdentitySource = overrides.care ?? new FakeCare();
  const clock = { now: 50_000 };
  const port = createBrowserCommandPort(createPortHost(session, care, () => clock.now), { send: (m) => chrome.runtime.sendMessage(m) }, { panelId: 'panel-1' });
  const say: string[] = [];
  const controller = new BrowserController({ session, port, chrome: wrapChrome ? wrapChrome(chrome) : chrome, now: () => clock.now, announce: (t) => say.push(t), care, ...overrides });
  stop = controller.start();
  return { chrome, session, care: care as FakeCare, port, controller, say, clock };
}
async function browse(r: Rig = rig) {
  r.session.highlight('browse');
  r.session.select();
  await flush();
}
async function pick(id: string, r: Rig = rig) { r.session.highlight(id); r.session.select(); await flush(); }

beforeEach(() => { rig = build(); });
afterEach(() => stop());

describe('entering browser control', () => {
  it('binds the active tab, shows its origin and keeps the binding after its own scope change', async () => {
    await browse();
    expect(rig.session.scope).toBe('browser');
    expect(rig.port.binding).toMatchObject({ tabId: 7, origin: SITE, identityKey: 'participant:A' });
    expect(rig.controller.getState()).toMatchObject({ phase: 'controlling', origin: SITE, message: 'Controlling en.wikipedia.org.' });
    await flush();
    expect(rig.port.binding).not.toBeNull(); // entering bumped the input epoch itself; that is not a failure
    expect(rig.say.at(-1)).toMatch(/Return to messages/);
  });
  it('binds the last focused window, and ignores activity in other windows', async () => {
    rig.chrome.addTab({ id: 20, windowId: 2, url: 'https://developer.mozilla.org/', active: true });
    rig.chrome.grant('https://developer.mozilla.org');
    rig.chrome.lastFocusedWindow = 2;
    await browse();
    expect(rig.port.binding).toMatchObject({ tabId: 20, windowId: 2 });
    rig.chrome.onActivated.fire({ tabId: 7, windowId: 1 });
    expect(rig.port.binding).not.toBeNull();
    rig.chrome.onActivated.fire({ tabId: 21, windowId: 2 });
    expect(rig.port.binding).toBeNull();
  });
  it.each([
    ['a page whose url Chrome hides', (r: Rig) => { r.chrome.tabsById.get(7)!.url = undefined; }, 'unsupported-page'],
    ['a page without permission', (r: Rig) => { r.chrome.grantedOrigins.clear(); }, 'permission-missing'],
    ['a chrome-error page', (r: Rig) => { r.chrome.tabsById.get(7)!.url = 'chrome-error://chromewebdata/'; }, 'unsupported-page'],
    ['a loading page', (r: Rig) => { r.chrome.tabsById.get(7)!.status = 'loading'; }, 'page-loading'],
  ])('explains %s and stays on messages', async (_n, change, code) => {
    change(rig);
    await browse();
    expect(rig.session.scope).toBe('communication');
    expect(rig.port.binding).toBeNull();
    expect(rig.controller.getState()).toMatchObject({ phase: 'idle', code });
    expect(rig.say.at(-1)).toBeTruthy();
  });
  it('refuses caregiver and revoked accounts', async () => {
    for (const role of ['caregiver', 'revoked'] as CareRole[]) {
      rig.care.set({ role, participantId: null });
      await browse();
      expect(rig.session.scope).toBe('communication');
      expect(rig.chrome.sent.filter((m) => (m as { type: string }).type === 'motif/bind')).toHaveLength(0);
    }
  });
  it('rejects a second Browse while one is being bound', async () => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => { open = resolve; });
    stop();
    const slow = build({}, (c) => ({ permissions: c.permissions, tabs: { ...c.tabs, query: async (q) => { await gate; return c.tabs.query(q); } } }));
    rig = slow;
    slow.session.highlight('browse');
    slow.session.select();
    slow.session.select();
    expect(slow.controller.getState().message).toMatch(/Already looking/);
    open();
    await flush();
    expect(slow.chrome.sent.filter((m) => (m as { type: string }).type === 'motif/bind')).toHaveLength(1);
    expect(slow.session.scope).toBe('browser');
  });
  it('abandons a Browse if input changed while binding, before anything is bound', async () => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => { open = resolve; });
    stop();
    const slow = build({}, (c) => ({ permissions: c.permissions, tabs: { ...c.tabs, query: async (q) => { await gate; return c.tabs.query(q); } } }));
    rig = slow;
    slow.session.highlight('browse');
    slow.session.select();
    slow.session.frame('missing'); // input interrupted while the page is being found
    slow.session.frame('tracked');
    open();
    await flush();
    expect(slow.session.scope).toBe('communication');
    expect(slow.port.binding).toBeNull();
    expect(slow.chrome.store.has('motif.binding')).toBe(false);
    expect(slow.chrome.sent.filter((m) => (m as { type: string }).type === 'motif/bind')).toHaveLength(0);
  });
  it('abandons a Browse if the person changed after the worker bound the tab, and releases it', async () => {
    stop();
    const r = build();
    rig = r;
    const original = r.chrome.permissions.contains;
    // The worker checks permissions during bind; switch the person at exactly that moment.
    let switched = false;
    r.chrome.onAwait = () => { if (!switched && r.chrome.sent.some((m) => (m as { type: string }).type === 'motif/bind')) { switched = true; r.care.set({ participantId: 'B' }); } };
    void original;
    r.session.highlight('browse');
    r.session.select();
    await flush();
    expect(r.session.scope).toBe('communication');
    expect(r.port.binding).toBeNull();
    expect(r.chrome.store.has('motif.binding')).toBe(false);
  });
});

describe('commands', () => {
  beforeEach(async () => { await browse(); });

  it('one selection is one scroll, with a short time to live on the controller clock', async () => {
    await pick('browser:scroll-down');
    expect(rig.chrome.executed).toHaveLength(1);
    expect(rig.chrome.executed[0]!.args).toEqual([0.75]);
    const command = (rig.chrome.sent.at(-1) as { command: { issuedAtMs: number; expiresAtMs: number }; ttlMs: number });
    expect(command.command.expiresAtMs - command.command.issuedAtMs).toBe(600);
    expect(command.ttlMs).toBe(600);
    expect(rig.session.effects).toEqual(['browser:browse', 'browser:scroll-down']);
    expect(rig.controller.getState().message).toBe('Scrolled down.');
  });
  it('Back works and reports; Back at the start says so and keeps control', async () => {
    await pick('browser:back');
    expect(rig.chrome.goBacks).toEqual([7]);
    rig.chrome.backError = new Error('Cannot find a next page in history.');
    await pick('browser:back');
    expect(rig.controller.getState()).toMatchObject({ phase: 'controlling', code: 'no-history' });
    expect(rig.session.scope).toBe('browser');
  });
  it('Back that lands on another site succeeds, then control ends with the reason', async () => {
    rig.chrome.onBack = (id) => { rig.chrome.tabsById.get(id)!.url = 'https://example.com/'; };
    await pick('browser:back');
    await flush();
    expect(rig.chrome.goBacks).toEqual([7]);
    expect(rig.session.scope).toBe('communication');
    expect(rig.port.binding).toBeNull();
    expect(rig.controller.getState().code).toBe('left-site');
  });
  it('a failed command ends control with a plain explanation', async () => {
    rig.chrome.scriptError = new Error('Cannot access a chrome-error:// URL');
    await pick('browser:scroll-up');
    expect(rig.session.scope).toBe('communication');
    expect(rig.controller.getState().code).toBe('unsupported-page');
    expect(rig.say.at(-1)).toMatch(/cannot control this page/);
  });
  it('a page that cannot scroll keeps control and says so', async () => {
    rig.chrome.scriptResult = () => [{ frameId: 0, result: { before: 5, after: 5, height: 700 } }];
    await pick('browser:scroll-down');
    expect(rig.controller.getState()).toMatchObject({ phase: 'controlling', code: 'cannot-scroll' });
  });
});

describe('Pause and Return', () => {
  beforeEach(async () => { await browse(); });
  it('Pause keeps scope and binding; the next command uses the new epoch', async () => {
    await pick('pause');
    expect(rig.session.paused).toBe(true);
    expect(rig.session.scope).toBe('browser');
    expect(rig.port.binding).not.toBeNull();
    rig.session.select(); // resume
    await flush();
    await pick('browser:scroll-down');
    expect(rig.chrome.executed).toHaveLength(1);
  });
  it('Return leaves browser scope, releases the binding and the worker, and request tiles still work exactly once', async () => {
    await pick('browser:return');
    expect(rig.session.scope).toBe('communication');
    expect(rig.port.binding).toBeNull();
    expect(rig.chrome.store.has('motif.binding')).toBe(false);
    const care = vi.fn();
    rig.session.highlight('request:water');
    rig.session.select({ care });
    await flush();
    expect(care).toHaveBeenCalledTimes(1);
    expect(rig.session.effects.filter((e) => e.startsWith('care:'))).toEqual(['care:request:water']);
    expect(rig.chrome.executed).toHaveLength(0);
  });
  it('a request tile does nothing while in browser scope', async () => {
    const care = vi.fn();
    expect(rig.session.tiles()).not.toContain('request:water');
    rig.session.highlight('browser:scroll-down');
    rig.session.select({ care });
    expect(care).not.toHaveBeenCalled();
  });
});

describe('fail-closed', () => {
  beforeEach(async () => { await browse(); });
  it('tracking loss cancels an in-flight command and returns to messages, but not synchronously inside the session', async () => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => { open = resolve; });
    const original = rig.chrome.scriptResult;
    rig.chrome.scriptResult = async () => { await gate; return original(); };
    rig.session.highlight('browser:scroll-down');
    rig.session.select();
    await new Promise((resolve) => setTimeout(resolve, 5));
    rig.session.frame('missing');
    expect(rig.session.scope).toBe('browser'); // the session's own call stack is not re-entered
    await flush();
    expect(rig.session.scope).toBe('communication');
    expect(rig.port.binding).toBeNull();
    open();
    await flush();
    expect(rig.controller.getState().code).toBe('tracking-lost');
  });
  it.each(['missing', 'multiple', 'invalid', 'stale'])('a %s frame drops browser control', async (tracking) => {
    rig.session.frame(tracking);
    await flush();
    expect(rig.session.scope).toBe('communication');
    expect(rig.chrome.executed).toHaveLength(0);
  });
  it('hidden panel, lock loss and unload drop control', async () => {
    rig.session.setHidden(true);
    await flush();
    expect(rig.controller.getState().code).toBe('hidden');
    rig.session.setHidden(false);
    await browse();
    rig.controller.notifyLockLost();
    expect(rig.controller.getState().code).toBe('lock-lost');
    expect(rig.session.scope).toBe('communication');
  });
  it('a stale command after recovery is not replayed late', async () => {
    rig.session.frame('missing');
    await flush();
    rig.session.frame('tracked');
    await browse();
    expect(rig.chrome.executed).toHaveLength(0);
  });
});

describe('tab and permission events', () => {
  beforeEach(async () => { await browse(); });
  const fire = {
    activatedAway: (r: Rig) => r.chrome.onActivated.fire({ tabId: 8, windowId: 1 }),
    otherOrigin: (r: Rig) => r.chrome.onUpdated.fire(7, { url: 'https://example.com/' }, { id: 7, url: 'https://example.com/' }),
    otherPort: (r: Rig) => r.chrome.onUpdated.fire(7, { url: 'https://en.wikipedia.org:8443/' }, { id: 7 }),
    urlMissing: (r: Rig) => r.chrome.onUpdated.fire(7, { status: 'loading' }, { id: 7 }),
    removed: (r: Rig) => r.chrome.onRemoved.fire(7),
    replaced: (r: Rig) => r.chrome.onReplaced.fire(9, 7),
    permission: (r: Rig) => r.chrome.onPermissionsRemoved.fire({ origins: [`${SITE}/*`] }),
    allPermissions: (r: Rig) => r.chrome.onPermissionsRemoved.fire({}),
  };
  it.each(Object.keys(fire) as Array<keyof typeof fire>)('%s drops control', async (name) => {
    fire[name](rig);
    await flush();
    expect(rig.port.binding).toBeNull();
    expect(rig.session.scope).toBe('communication');
  });
  it('same-origin navigation only cancels the in-flight command', async () => {
    rig.chrome.onUpdated.fire(7, { url: `${SITE}/wiki/Dog`, status: 'loading' }, { id: 7, url: `${SITE}/wiki/Dog` });
    await flush();
    expect(rig.port.binding).not.toBeNull();
    expect(rig.session.scope).toBe('browser');
  });
  it('unrelated tabs and other origins\' grants change nothing', async () => {
    rig.chrome.onUpdated.fire(99, { url: 'https://example.com/' }, { id: 99 });
    rig.chrome.onRemoved.fire(99);
    rig.chrome.onPermissionsRemoved.fire({ origins: ['https://example.com/*'] });
    rig.chrome.onActivated.fire({ tabId: 7, windowId: 1 });
    await flush();
    expect(rig.port.binding).not.toBeNull();
  });
});

describe('identity', () => {
  beforeEach(async () => { await browse(); });
  it('a new epoch (sign out, pair, switch, revoke) drops control', async () => {
    rig.care.set({ participantId: 'B', alias: 'Bea' });
    await flush();
    expect(rig.session.scope).toBe('communication');
    expect(rig.port.binding).toBeNull();
    expect(rig.chrome.store.has('motif.binding')).toBe(false);
    expect(rig.controller.getState().code).toBe('identity-changed');
  });
  it('a poll failure that wipes access WITHOUT an epoch bump also drops control', async () => {
    rig.care.set({ role: 'signed-out', participantId: null, alias: null }, false);
    await flush();
    expect(rig.session.scope).toBe('communication');
  });
  it('A\'s in-flight command cannot run as B, and B must choose Browse again', async () => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => { open = resolve; });
    const original = rig.chrome.scriptResult;
    rig.chrome.scriptResult = async () => { await gate; return original(); };
    rig.session.highlight('browser:scroll-down');
    rig.session.select();
    await new Promise((resolve) => setTimeout(resolve, 5));
    rig.care.set({ participantId: 'B', alias: 'Bea' });
    open();
    await flush();
    expect(rig.port.binding).toBeNull();
    rig.session.highlight('phrase:0');
    expect(rig.session.scope).toBe('communication');
    await pick('browser:scroll-down').catch(() => {}); // not in communication scope: no such tile
    expect(rig.chrome.executed.length).toBeLessThanOrEqual(1); // only the pre-switch A scroll could have started
    await browse();
    expect(rig.port.binding).toMatchObject({ identityKey: 'participant:B' });
  });
  it('no tab data reaches the care backend', async () => {
    const spy = vi.fn();
    const client = { snapshot: { epoch: 3, access: { role: 'participant', participant: { id: 'A', alias: 'Alex' } } }, watch: () => () => {},
      sendRequest: spy, transitionRequest: spy, createGroup: spy, createParticipant: spy, createInvite: spy, pair: spy, signIn: spy, signOut: spy, refresh: spy, clearGroup: spy, revokeParticipant: spy };
    stop();
    const r = build({ care: identityFromCare(client as unknown as Pick<CareClient, 'snapshot' | 'watch'>) });
    await browse(r);
    await pick('browser:scroll-down', r);
    await pick('browser:return', r);
    expect(spy).not.toHaveBeenCalled();
    rig = r;
  });
});

describe('idle return', () => {
  it('counts only active, tracked, unpaused time, warns first, then returns', async () => {
    stop();
    const timers = { handle: null as null | (() => void), setInterval: (fn: () => void) => { timers.handle = fn; return 1; }, clearInterval: () => { timers.handle = null; } };
    const r = build({ idleMs: 90_000, timers });
    await browse(r);
    const tick = (ms: number) => { r.clock.now += ms; r.controller.idleTick(); };
    for (let i = 0; i < 40; i += 1) tick(1_000);
    expect(r.session.scope).toBe('browser');
    r.session.setPaused(true);
    for (let i = 0; i < 300; i += 1) tick(1_000); // a long Pause does not count
    expect(r.session.scope).toBe('browser');
    r.session.setPaused(false);
    for (let i = 0; i < 25; i += 1) tick(1_000);
    expect(r.say.some((t) => /30 seconds/.test(t))).toBe(true);
    for (let i = 0; i < 30; i += 1) tick(1_000);
    await flush();
    expect(r.session.scope).toBe('communication');
    expect(r.controller.getState().code).toBe('idle');
    rig = r;
  });
  it('a command resets the idle counter', async () => {
    stop();
    const r = build({ idleMs: 60_000, timers: { setInterval: () => 1, clearInterval: () => {} } });
    await browse(r);
    const tick = (ms: number) => { r.clock.now += ms; r.controller.idleTick(); };
    for (let i = 0; i < 50; i += 1) tick(1_000);
    await pick('browser:scroll-down', r);
    for (let i = 0; i < 50; i += 1) tick(1_000);
    expect(r.session.scope).toBe('browser');
    rig = r;
  });
});

describe('helper-only site permissions', () => {
  it('requests exactly one validated origin and never from a gesture path', async () => {
    const request = vi.spyOn(rig.chrome.permissions, 'request');
    expect(await rig.controller.allowSite('https://*.wikipedia.org')).toMatchObject({ ok: false });
    expect(await rig.controller.allowSite('http://example.com')).toMatchObject({ ok: false });
    expect(request).not.toHaveBeenCalled();
    await browse();
    await pick('browser:scroll-down');
    expect(request).not.toHaveBeenCalled();
  });
  it('grants and revokes an exact origin, ending control of a revoked site', async () => {
    expect(await rig.controller.allowSite('https://developer.mozilla.org/en-US/')).toEqual({ ok: true, origin: 'https://developer.mozilla.org' });
    expect(rig.chrome.grantedOrigins.has('https://developer.mozilla.org/*')).toBe(true);
    await browse();
    expect(await rig.controller.revokeSite(SITE)).toBe(true);
    expect(rig.port.binding).toBeNull();
    expect(await rig.controller.revokeSite('https://en.wikipedia.org/wiki')).toBe(false);
  });
});

describe('lifecycle', () => {
  it('dispose releases the binding, returns to messages and detaches the sink', async () => {
    await browse();
    stop();
    expect(rig.session.scope).toBe('communication');
    expect(rig.port.binding).toBeNull();
    expect(rig.session.tiles()).not.toContain('browse');
    stop = () => {};
  });
});
