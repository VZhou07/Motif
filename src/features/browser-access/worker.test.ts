import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BrowserCommand } from '../../care/browser-contract';
import { EXT_ID, EXT_ORIGIN, FakeChrome, PANEL_SENDER } from './fake-chrome.test-support';
import type { MessageSender } from './chrome-like';
import { BINDING_KEY, createWorker, isTrustedSender, scrollPage, SEEN_KEY, type Worker } from './worker';
import type { WorkerReply } from './protocol';

const SITE = 'https://en.wikipedia.org';
let chrome: FakeChrome;
let worker: Worker;
let clock = 1_000;
let n = 0;

const bindMsg = (extra: Record<string, unknown> = {}) => ({ type: 'motif/bind', v: 1, panelId: 'panel-1', identityKey: 'participant:A', accessEpoch: 4, tabId: 7, windowId: 1, origin: SITE, ...extra });
const cmd = (action: BrowserCommand['action'] = 'scroll-down', extra: Partial<BrowserCommand> = {}): BrowserCommand =>
  ({ version: 1, id: `id-${(n += 1)}`, action, inputEpoch: 10, accessEpoch: 4, issuedAtMs: 0, expiresAtMs: 600, ...extra });
const cmdMsg = (command: BrowserCommand, extra: Record<string, unknown> = {}) => ({ type: 'motif/command', v: 1, panelId: 'panel-1', command, ttlMs: 600, ...extra });
const send = (message: unknown, sender: MessageSender = PANEL_SENDER) => chrome.deliver(message, sender) as Promise<WorkerReply>;
const reasonOf = (reply: WorkerReply) => (reply.ok ? reply.result?.reason : reply.reason);
const statusOf = (reply: WorkerReply) => (reply.ok ? reply.result?.status : 'refused');

beforeEach(() => {
  clock = 1_000;
  n = 0;
  chrome = new FakeChrome();
  chrome.addTab({ id: 7, windowId: 1, url: `${SITE}/wiki/Cat`, active: true });
  chrome.addTab({ id: 8, windowId: 1, url: 'https://example.com/', active: false });
  chrome.grant(SITE);
  chrome.onAwait = () => { clock += 1; };
  worker = createWorker(chrome, { now: () => clock });
});
afterEach(() => worker.dispose());

describe('sender identity', () => {
  const trusted = (sender: MessageSender | undefined) => isTrustedSender(sender, chrome.runtime);
  it('accepts only the Motif controller page', () => {
    expect(trusted(PANEL_SENDER)).toBe(true);
    expect(trusted({ ...PANEL_SENDER, tab: { id: 99 } })).toBe(true); // docked window copy lives in a tab
  });
  it.each([
    ['no sender', undefined],
    ['wrong extension id', { ...PANEL_SENDER, id: 'other' }],
    ['wrong origin', { ...PANEL_SENDER, origin: 'chrome-extension://other' }],
    ['web page', { id: EXT_ID, url: 'https://evil.example/sidepanel.html', origin: 'https://evil.example', frameId: 0 }],
    ['content-script shape', { id: EXT_ID, url: 'https://en.wikipedia.org/wiki/Cat', origin: 'https://en.wikipedia.org', frameId: 0, tab: { id: 7 } }],
    ['camera grant page', { ...PANEL_SENDER, url: `${EXT_ORIGIN}/grant-camera.html` }],
    ['another extension page', { ...PANEL_SENDER, url: `${EXT_ORIGIN}/other.html` }],
    ['path trick', { ...PANEL_SENDER, url: `${EXT_ORIGIN}/x/sidepanel.html` }],
    ['subframe', { ...PANEL_SENDER, frameId: 3 }],
    ['missing frame', { ...PANEL_SENDER, frameId: undefined }],
    ['unparseable url', { ...PANEL_SENDER, url: 'nonsense' }],
  ])('rejects %s', (_name, sender) => expect(trusted(sender as MessageSender | undefined)).toBe(false));

  it('refuses every message type from a page or the grant page', async () => {
    for (const sender of [{ id: EXT_ID, url: 'https://evil.example/', origin: 'https://evil.example', frameId: 0 }, { ...PANEL_SENDER, url: `${EXT_ORIGIN}/grant-camera.html` }]) {
      expect(reasonOf(await send(bindMsg(), sender))).toBe('sender-rejected');
      expect(reasonOf(await send(cmdMsg(cmd()), sender))).toBe('sender-rejected');
      expect(reasonOf(await send({ type: 'motif/release', v: 1, panelId: 'panel-1' }, sender))).toBe('sender-rejected');
    }
    expect(chrome.executed).toHaveLength(0);
    expect(chrome.store.size).toBe(0);
  });

  it('has no external, connect or content-script entry points to receive from', () => {
    expect(chrome.messageEvent.listeners.size).toBe(1); // onMessage only; ChromeLike offers no external event to subscribe to
    expect(Object.keys(chrome.runtime)).not.toContain('onMessageExternal');
  });
});

describe('listener contract', () => {
  it('registers synchronously when the worker is created and answers asynchronously with exactly one response', async () => {
    const fresh = new FakeChrome();
    expect(fresh.messageEvent.listeners.size).toBe(0);
    createWorker(fresh);
    expect(fresh.messageEvent.listeners.size).toBe(1);
    const [listener] = [...fresh.messageEvent.listeners];
    let calls = 0;
    const keepOpen = listener!({ type: 'motif/release', v: 1, panelId: 'p' }, PANEL_SENDER, () => { calls += 1; });
    expect(keepOpen).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(calls).toBe(1);
  });
  it('sets the toolbar icon to open the panel', () => expect(chrome.panelBehavior).toEqual([{ openPanelOnActionClick: true }]));
  it('answers malformed input with a refusal and nothing runs', async () => {
    expect(reasonOf(await send({ nonsense: true }))).toBe('bad-message');
    expect(reasonOf(await send(cmdMsg(cmd('return-to-communication'))))).toBe('unknown-action');
    expect(chrome.executed).toHaveLength(0);
  });
});

describe('binding', () => {
  it('binds the active, loaded, allowed tab and stores it', async () => {
    expect(await send(bindMsg())).toEqual({ ok: true });
    expect((chrome.store.get(BINDING_KEY) as { tabId: number }).tabId).toBe(7);
  });
  it.each([
    ['inactive tab', bindMsg({ tabId: 8, origin: 'https://example.com' }), 'page-changed'],
    ['unknown tab', bindMsg({ tabId: 99 }), 'tab-closed'],
    ['origin mismatch (port)', bindMsg({ origin: 'https://en.wikipedia.org:8443' }), 'page-changed'],
    ['wrong window', bindMsg({ windowId: 2 }), 'page-changed'],
    ['non-origin string', bindMsg({ origin: 'https://en.wikipedia.org/wiki' }), 'unsupported-page'],
  ])('refuses %s', async (_n, message, reason) => {
    expect(reasonOf(await send(message))).toBe(reason);
    expect(chrome.store.has(BINDING_KEY)).toBe(false);
  });
  it('refuses a page whose url is hidden or a permission that is missing or still loading', async () => {
    chrome.tabsById.get(7)!.url = undefined;
    expect(reasonOf(await send(bindMsg()))).toBe('unsupported-page');
    chrome.tabsById.get(7)!.url = `${SITE}/`;
    chrome.tabsById.get(7)!.status = 'loading';
    expect(reasonOf(await send(bindMsg()))).toBe('page-loading');
    chrome.tabsById.get(7)!.status = 'complete';
    chrome.grantedOrigins.clear();
    expect(reasonOf(await send(bindMsg()))).toBe('permission-missing');
  });
  it('refuses to bind the sender\'s own tab', async () => {
    expect(reasonOf(await send(bindMsg(), { ...PANEL_SENDER, tab: { id: 7 } }))).toBe('sender-rejected');
  });
  it('release removes only its own binding', async () => {
    await send(bindMsg());
    await send({ type: 'motif/release', v: 1, panelId: 'someone-else' });
    expect(chrome.store.has(BINDING_KEY)).toBe(true);
    await send({ type: 'motif/release', v: 1, panelId: 'panel-1' });
    expect(chrome.store.has(BINDING_KEY)).toBe(false);
  });
});

describe('commands', () => {
  beforeEach(async () => { await send(bindMsg()); });

  it('scrolls the top frame of the bound tab by about three quarters of the viewport and reports success', async () => {
    const reply = await send(cmdMsg(cmd('scroll-down')));
    expect(statusOf(reply)).toBe('executed');
    const call = chrome.executed[0]!;
    expect(call.target).toEqual({ tabId: 7, frameIds: [0] });
    expect(call.args).toEqual([0.75]);
    expect(call.world).toBe('ISOLATED');
    expect(call.func).toBe(scrollPage);
    await send(cmdMsg(cmd('scroll-up')));
    expect(chrome.executed[1]!.args).toEqual([-0.75]);
  });
  it('goes back with tabs.goBack', async () => {
    expect(statusOf(await send(cmdMsg(cmd('back'))))).toBe('executed');
    expect(chrome.goBacks).toEqual([7]);
  });

  it('runs a duplicate id once, including when both arrive at the same time', async () => {
    const command = cmd('scroll-down');
    const [a, b] = await Promise.all([send(cmdMsg(command)), send(cmdMsg(command))]);
    expect([statusOf(a), statusOf(b)].sort()).toEqual(['executed', 'rejected']);
    expect([reasonOf(a), reasonOf(b)]).toContain('duplicate');
    expect(chrome.executed).toHaveLength(1);
    expect(reasonOf(await send(cmdMsg(command)))).toBe('duplicate');
    expect(chrome.executed).toHaveLength(1);
  });
  it('does not rerun a command that failed (id is spent)', async () => {
    chrome.scriptError = new Error('boom');
    const command = cmd();
    expect(reasonOf(await send(cmdMsg(command)))).toBe('execution-failed');
    chrome.scriptError = null;
    await send(bindMsg()); // the failure dropped the binding; the replay memory outlives it
    expect(reasonOf(await send(cmdMsg(command)))).toBe('duplicate');
  });
  it('keeps only the last 256 ids', async () => {
    for (let i = 0; i < 260; i += 1) await send(cmdMsg(cmd('back')));
    expect((chrome.store.get(SEEN_KEY) as string[]).length).toBe(256);
  });

  it('rejects a different panel, a changed access epoch and a reordered stale input epoch', async () => {
    expect(statusOf(await send(cmdMsg(cmd('scroll-down', { inputEpoch: 10 }))))).toBe('executed');
    expect(reasonOf(await send({ ...cmdMsg(cmd()), panelId: 'panel-2' }))).toBe('not-bound');
    expect(reasonOf(await send(cmdMsg(cmd('scroll-down', { accessEpoch: 5 }))))).toBe('stale-access-epoch');
    expect(reasonOf(await send(cmdMsg(cmd('scroll-down', { inputEpoch: 9 }))))).toBe('stale-input-epoch');
    expect(statusOf(await send(cmdMsg(cmd('scroll-down', { inputEpoch: 11 }))))).toBe('executed');
    expect(chrome.executed).toHaveLength(2);
  });
  it('rejects every command after release', async () => {
    await send({ type: 'motif/release', v: 1, panelId: 'panel-1' });
    expect(reasonOf(await send(cmdMsg(cmd())))).toBe('not-bound');
  });

  it('drops the binding when the tab changes, navigates elsewhere, loads, or loses permission', async () => {
    const cases: Array<[string, () => void, string]> = [
      ['other origin', () => { chrome.tabsById.get(7)!.url = 'https://example.com/'; }, 'page-changed'],
      ['other port', () => { chrome.tabsById.get(7)!.url = 'https://en.wikipedia.org:8443/'; }, 'page-changed'],
      ['url hidden', () => { chrome.tabsById.get(7)!.url = undefined; }, 'page-changed'],
      ['loading', () => { chrome.tabsById.get(7)!.status = 'loading'; }, 'page-changed'],
      ['tab no longer active', () => { chrome.active.set(1, 8); }, 'page-changed'],
      ['tab closed', () => { chrome.tabsById.delete(7); }, 'tab-closed'],
      ['permission removed', () => { chrome.grantedOrigins.clear(); }, 'permission-missing'],
    ];
    for (const [, change, reason] of cases) {
      await send({ type: 'motif/release', v: 1, panelId: 'panel-1' });
      chrome.tabsById.set(7, { id: 7, windowId: 1, url: `${SITE}/`, status: 'complete' }); chrome.active.set(1, 7); chrome.grant(SITE);
      await send(bindMsg());
      change();
      const before = chrome.executed.length;
      const reply = await send(cmdMsg(cmd()));
      expect(reasonOf(reply)).toBe(reason);
      expect(chrome.executed.length).toBe(before);
      expect(chrome.store.has(BINDING_KEY)).toBe(false);
    }
  });

  it('maps Chrome failures to codes and fails closed on unknown errors', async () => {
    chrome.scriptError = new Error('Cannot access a chrome-error:// URL');
    expect(reasonOf(await send(cmdMsg(cmd())))).toBe('unsupported-page');
    expect(chrome.store.has(BINDING_KEY)).toBe(false);
    await send(bindMsg());
    chrome.scriptError = new Error('Frame with ID 0 was removed.');
    expect(reasonOf(await send(cmdMsg(cmd())))).toBe('page-changed');
    await send(bindMsg());
    chrome.scriptError = new Error('who knows');
    expect(reasonOf(await send(cmdMsg(cmd())))).toBe('execution-failed');
    expect(chrome.store.has(BINDING_KEY)).toBe(false);
  });
  it('keeps the binding for Back with no history and for a page that cannot scroll', async () => {
    chrome.backError = new Error('Cannot find a next page in history.');
    expect(reasonOf(await send(cmdMsg(cmd('back'))))).toBe('no-history');
    chrome.scriptResult = () => [{ frameId: 0, result: { before: 40, after: 40, height: 700 } }];
    expect(reasonOf(await send(cmdMsg(cmd('scroll-down'))))).toBe('cannot-scroll');
    expect(chrome.store.has(BINDING_KEY)).toBe(true);
  });
  it.each([
    ['nothing', undefined], ['null', null], ['a string', 'ok'], ['NaN', { before: Number.NaN, after: 1, height: 1 }],
    ['Infinity', { before: 0, after: Infinity, height: 1 }], ['missing field', { before: 0, after: 1 }], ['page-supplied strings', { before: '0', after: '9', height: '1' }],
  ])('treats %s from the injected function as a failure, not success', async (_n, value) => {
    chrome.scriptResult = () => [{ frameId: 0, result: value }];
    const reply = await send(cmdMsg(cmd('scroll-down')));
    expect(statusOf(reply)).toBe('rejected');
    expect(reasonOf(reply)).toBe('execution-failed');
    expect(chrome.store.has(BINDING_KEY)).toBe(false);
  });
  it('treats an empty injection list as a failure', async () => {
    chrome.scriptResult = () => [];
    expect(reasonOf(await send(cmdMsg(cmd('scroll-down'))))).toBe('execution-failed');
  });
});

describe('deadline', () => {
  beforeEach(async () => { await send(bindMsg()); });
  it('does not start when a slow tabs.get used up the time to live', async () => {
    chrome.onAwait = () => { clock += 400; }; // every awaited Chrome call is slow
    const reply = await send(cmdMsg(cmd('scroll-down'), { ttlMs: 600 }));
    expect(reasonOf(reply)).toBe('expired');
    expect(chrome.executed).toHaveLength(0);
    expect(chrome.goBacks).toHaveLength(0);
  });
  it('starts the clock when the message is received, not when it reaches the front of the queue', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const original = chrome.scriptResult;
    chrome.scriptResult = async () => { await gate; clock += 5_000; return original(); };
    const first = send(cmdMsg(cmd('scroll-down')));
    const second = send(cmdMsg(cmd('scroll-up')));
    await new Promise((resolve) => setTimeout(resolve, 5));
    release();
    expect(statusOf(await first)).toBe('executed');
    expect(reasonOf(await second)).toBe('expired');
    expect(chrome.executed).toHaveLength(1);
  });
  it('still reports what really happened when the action finishes late', async () => {
    chrome.scriptResult = () => { clock += 5_000; return [{ frameId: 0, result: { before: 0, after: 10, height: 700 } }]; };
    expect(statusOf(await send(cmdMsg(cmd('scroll-down'))))).toBe('executed');
  });
});

describe('injected function', () => {
  it('asks the page for a smooth-free scroll of the given fraction and returns numbers', () => {
    const calls: unknown[] = [];
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    window.scrollBy = ((options: unknown) => { calls.push(options); }) as typeof window.scrollBy;
    const element = document.scrollingElement ?? document.documentElement;
    element.scrollTop = 0;
    const out = scrollPage(0.75);
    expect(calls).toEqual([{ top: 600, left: 0, behavior: 'instant' }]);
    expect(out).toEqual({ before: 0, after: 0, height: 800 });
  });
  it('is self-contained so Chrome can serialize it', () => {
    const source = scrollPage.toString();
    expect(source).not.toMatch(/chrome|import|require/);
  });
});
