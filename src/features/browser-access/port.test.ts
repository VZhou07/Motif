import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserCommand } from '../../care/browser-contract';
import { FakeChrome } from './fake-chrome.test-support';
import { createBrowserCommandPort, type BrowserPort, type PortHost } from './port';
import { createWorker } from './worker';

const SITE = 'https://en.wikipedia.org';
interface TestHost extends PortHost { input: number; access: number; identity: string; mode: 'communication' | 'browser'; time: number; returns: number; canReturn: boolean }
let host: TestHost;
let chrome: FakeChrome;
let port: BrowserPort;
let n = 0;

const makeHost = (): TestHost => {
  const h: TestHost = {
    input: 5, access: 2, identity: 'participant:A', mode: 'browser', time: 10_000, returns: 0, canReturn: true,
    now: () => h.time, inputEpoch: () => h.input, accessEpoch: () => h.access, identityKey: () => h.identity, scope: () => h.mode,
    returnToCommunication: () => { h.returns += 1; if (h.canReturn) h.mode = 'communication'; return h.canReturn; },
  };
  return h;
};
const cmd = (action: BrowserCommand['action'] = 'scroll-down', extra: Partial<BrowserCommand> = {}): BrowserCommand => ({
  version: 1, id: `c-${(n += 1)}`, action, inputEpoch: host.input, accessEpoch: host.access, issuedAtMs: host.time, expiresAtMs: host.time + 600, ...extra,
});

beforeEach(async () => {
  n = 0;
  host = makeHost();
  chrome = new FakeChrome();
  chrome.addTab({ id: 7, windowId: 1, url: `${SITE}/wiki/Cat`, active: true });
  chrome.grant(SITE);
  createWorker(chrome);
  port = createBrowserCommandPort(host, { send: (message) => chrome.runtime.sendMessage(message) }, { panelId: 'panel-1' });
  expect(await port.bind({ tabId: 7, windowId: 1, origin: SITE })).toEqual({ ok: true });
});

describe('validation before anything is sent', () => {
  const sentBefore = () => chrome.sent.length;
  it('runs a valid scroll through the worker', async () => {
    const before = sentBefore();
    expect(await port.execute(cmd('scroll-down'))).toMatchObject({ version: 1, status: 'executed' });
    expect(chrome.sent.length).toBe(before + 1);
    expect(chrome.executed).toHaveLength(1);
  });
  it.each([
    ['bad version', { version: 2 as 1 }, 'bad-version'],
    ['empty id', { id: '' }, 'bad-id'],
    ['unknown action', { action: 'click' as never }, 'unknown-action'],
    ['prototype action', { action: 'toString' as never }, 'unknown-action'],
    ['NaN time', { issuedAtMs: Number.NaN }, 'invalid-times'],
    ['expired', { issuedAtMs: 9_000, expiresAtMs: 9_900 }, 'expired'],
    ['zero length', { expiresAtMs: 10_000 }, 'invalid-times'],
    ['too long', { expiresAtMs: 12_000 }, 'invalid-times'],
    ['future', { issuedAtMs: 10_100, expiresAtMs: 10_600 }, 'not-yet-valid'],
    ['old input epoch', { inputEpoch: 4 }, 'stale-input-epoch'],
    ['new input epoch', { inputEpoch: 6 }, 'stale-input-epoch'],
    ['old access epoch', { accessEpoch: 1 }, 'stale-access-epoch'],
  ])('rejects %s and sends nothing', async (_name, extra, reason) => {
    const before = sentBefore();
    const result = await port.execute(cmd('scroll-down', extra as Partial<BrowserCommand>));
    expect(result).toMatchObject({ status: 'rejected', reason });
    expect(sentBefore()).toBe(before);
    expect(chrome.executed).toHaveLength(0);
  });
  it('rejects a non-object without throwing', async () => {
    expect(await port.execute(null as never)).toMatchObject({ status: 'rejected', reason: 'bad-message' });
    expect(await port.execute({ id: 'x' } as never)).toMatchObject({ id: 'x', status: 'rejected' });
  });
  it('rejects outside browser scope, without a binding, and for a changed person', async () => {
    host.mode = 'communication';
    expect(await port.execute(cmd())).toMatchObject({ reason: 'wrong-scope' });
    host.mode = 'browser';
    host.identity = 'participant:B';
    expect(await port.execute(cmd())).toMatchObject({ reason: 'identity-changed' });
    host.identity = 'participant:A';
    port.release();
    expect(await port.execute(cmd())).toMatchObject({ reason: 'not-bound' });
    expect(chrome.executed).toHaveLength(0);
  });
  it('rejects a duplicate id after success and after rejection', async () => {
    const ok = cmd('scroll-down');
    expect((await port.execute(ok)).status).toBe('executed');
    expect(await port.execute(ok)).toMatchObject({ reason: 'duplicate' });
    chrome.scriptError = new Error('boom');
    await port.bind({ tabId: 7, windowId: 1, origin: SITE });
    const failing = cmd('scroll-down');
    expect(await port.execute(failing)).toMatchObject({ reason: 'execution-failed' });
    expect(await port.execute(failing)).toMatchObject({ reason: 'duplicate' });
    expect(chrome.executed).toHaveLength(2);
  });
  it('allows one command in flight and never queues a second', async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    const original = chrome.scriptResult;
    chrome.scriptResult = async () => { await gate; return original(); };
    const first = port.execute(cmd('scroll-down'));
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await port.execute(cmd('scroll-up'));
    expect(second).toMatchObject({ reason: 'busy' });
    finish();
    expect((await first).status).toBe('executed');
    expect(chrome.executed).toHaveLength(1);
  });
});

describe('invalidate and release', () => {
  it('cancels the pending command with a clear reason and ignores the late reply', async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    const original = chrome.scriptResult;
    chrome.scriptResult = async () => { await gate; return original(); };
    const pending = port.execute(cmd('scroll-down'));
    await new Promise((resolve) => setTimeout(resolve, 5));
    port.invalidate();
    expect(await pending).toMatchObject({ status: 'rejected', reason: 'invalidated' });
    finish();
    await new Promise((resolve) => setTimeout(resolve, 5));
    host.input += 1;
    expect(await port.execute(cmd('scroll-down'))).toMatchObject({ status: 'executed' }); // still bound; invalidate cancels pending work only
  });
  it('is idempotent and safe with nothing pending', () => {
    expect(() => { port.invalidate(); port.invalidate(); }).not.toThrow();
  });
  it('turns a reply under changed epochs into invalidated, never success', async () => {
    const original = chrome.scriptResult;
    chrome.scriptResult = () => { host.input += 1; return original(); };
    expect(await port.execute(cmd('scroll-down'))).toMatchObject({ status: 'rejected', reason: 'invalidated' });
  });
  it('release forgets the binding and tells the worker, which then refuses', async () => {
    port.release();
    expect(port.binding).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(chrome.sent.at(-1)).toMatchObject({ type: 'motif/release', panelId: 'panel-1' });
    expect(chrome.store.has('motif.binding')).toBe(false);
  });
});

describe('return to communication', () => {
  it('is handled locally and never reaches runtime.sendMessage', async () => {
    const sendMessage = vi.spyOn(chrome.runtime, 'sendMessage');
    const before = chrome.sent.length;
    expect(await port.execute(cmd('return-to-communication'))).toMatchObject({ status: 'executed' });
    expect(host.returns).toBe(1);
    expect(host.mode).toBe('communication');
    expect(chrome.sent.length).toBe(before);
    expect(sendMessage).not.toHaveBeenCalled();
  });
  it('works with no binding and after the permission is gone', async () => {
    port.release();
    chrome.grantedOrigins.clear();
    expect(await port.execute(cmd('return-to-communication'))).toMatchObject({ status: 'executed' });
  });
  it('is still checked: stale epochs, duplicates and a host that cannot return', async () => {
    expect(await port.execute(cmd('return-to-communication', { inputEpoch: 1 }))).toMatchObject({ reason: 'stale-input-epoch' });
    expect(host.returns).toBe(0);
    host.canReturn = false;
    expect(await port.execute(cmd('return-to-communication'))).toMatchObject({ status: 'rejected', reason: 'wrong-scope' });
    const again = cmd('return-to-communication');
    host.canReturn = true;
    expect((await port.execute(again)).status).toBe('executed');
    expect(await port.execute(again)).toMatchObject({ reason: 'duplicate' });
  });
});

describe('worker problems', () => {
  it('maps an unreachable worker to worker-unavailable and drops the binding', async () => {
    const lonely = createBrowserCommandPort(host, { send: async () => { throw new Error('Could not establish connection. Receiving end does not exist.'); } });
    expect(await lonely.bind({ tabId: 7, windowId: 1, origin: SITE })).toEqual({ ok: false, reason: 'worker-unavailable' });
    chrome.messageEvent.listeners.clear();
    expect(await port.execute(cmd('scroll-down'))).toMatchObject({ reason: 'worker-unavailable' });
    expect(port.binding).toBeNull();
  });
  it('treats nonsense replies as failures', async () => {
    for (const reply of [undefined, null, 'ok', { ok: true }, { ok: true, result: { id: 'other', status: 'executed', version: 1 } }]) {
      const odd = createBrowserCommandPort(host, { send: async (message) => ((message as { type: string }).type === 'motif/bind' ? { ok: true } : reply) });
      await odd.bind({ tabId: 7, windowId: 1, origin: SITE });
      expect(await odd.execute(cmd('scroll-down'))).toMatchObject({ status: 'rejected', reason: 'execution-failed' });
    }
  });
  it('drops the binding when the worker reports the page changed', async () => {
    chrome.tabsById.get(7)!.url = 'https://example.com/';
    expect(await port.execute(cmd('scroll-down'))).toMatchObject({ reason: 'page-changed' });
    expect(port.binding).toBeNull();
    expect(await port.execute(cmd('scroll-down'))).toMatchObject({ reason: 'not-bound' });
  });
});

describe('binding', () => {
  it('refuses a second concurrent bind', async () => {
    let finish!: (value: unknown) => void;
    const slow = createBrowserCommandPort(host, { send: () => new Promise((resolve) => { finish = resolve; }) });
    const first = slow.bind({ tabId: 7, windowId: 1, origin: SITE });
    expect(await slow.bind({ tabId: 7, windowId: 1, origin: SITE })).toEqual({ ok: false, reason: 'busy' });
    finish({ ok: true });
    expect(await first).toEqual({ ok: true });
  });
  it('aborts a bind when access or the person changed while the worker was checking', async () => {
    let finish!: (value: unknown) => void;
    const sent: unknown[] = [];
    const slow = createBrowserCommandPort(host, { send: (message) => { sent.push(message); return new Promise((resolve) => { finish = resolve; }); } });
    const pending = slow.bind({ tabId: 7, windowId: 1, origin: SITE });
    host.access += 1;
    finish({ ok: true });
    expect(await pending).toEqual({ ok: false, reason: 'stale-access-epoch' });
    expect(slow.binding).toBeNull();
    expect(sent.at(-1)).toMatchObject({ type: 'motif/release' });
  });
  it('aborts a bind interrupted by invalidate()', async () => {
    let finish!: (value: unknown) => void;
    const slow = createBrowserCommandPort(host, { send: () => new Promise((resolve) => { finish = resolve; }) });
    const pending = slow.bind({ tabId: 7, windowId: 1, origin: SITE });
    slow.invalidate();
    finish({ ok: true });
    expect(await pending).toMatchObject({ ok: false });
  });
  it('refuses a malformed origin before sending', async () => {
    const before = chrome.sent.length;
    expect(await port.bind({ tabId: 7, windowId: 1, origin: `${SITE}/wiki` })).toEqual({ ok: false, reason: 'unsupported-page' });
    expect(chrome.sent.length).toBe(before);
  });
  it('passes the worker\'s refusal through', async () => {
    chrome.tabsById.get(7)!.status = 'loading';
    expect(await port.bind({ tabId: 7, windowId: 1, origin: SITE })).toEqual({ ok: false, reason: 'page-loading' });
  });
});

describe('cross-account', () => {
  it('account A\'s command cannot run after the person becomes B, even through a still-bound worker', async () => {
    const aCommand = cmd('scroll-down');
    host.access += 1; host.identity = 'participant:B'; // B signs in; epoch bumps
    expect(await port.execute(aCommand)).toMatchObject({ reason: 'stale-access-epoch' });
    const bCommand = cmd('scroll-down');
    expect(await port.execute(bCommand)).toMatchObject({ reason: 'identity-changed' }); // binding still names A
    expect(chrome.executed).toHaveLength(0);
    // Even bypassing the port, the worker refuses a command made under A's access epoch.
    const direct = await chrome.deliver({ type: 'motif/command', v: 1, panelId: 'panel-1', command: { ...aCommand, accessEpoch: host.access }, ttlMs: 600 },
      { id: chrome.id, url: `chrome-extension://${chrome.id}/sidepanel.html`, origin: `chrome-extension://${chrome.id}`, frameId: 0 });
    expect(direct).toMatchObject({ ok: true, result: { status: 'rejected', reason: 'stale-access-epoch' } });
  });
});

describe('a transport that throws synchronously ("Extension context invalidated.")', () => {
  let broken = false;
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
  beforeEach(() => { broken = false; unhandled.length = 0; process.on('unhandledRejection', onUnhandled); });
  afterEach(() => { process.off('unhandledRejection', onUnhandled); });
  const make = () => createBrowserCommandPort(host, { send: (message) => { if (broken) throw new Error('Extension context invalidated.'); return chrome.runtime.sendMessage(message); } }, { panelId: 'panel-2' });

  it('execute resolves to a rejected worker-unavailable result and drops the binding', async () => {
    const p = make();
    expect(await p.bind({ tabId: 7, windowId: 1, origin: SITE })).toEqual({ ok: true });
    broken = true;
    await expect(p.execute(cmd('scroll-down'))).resolves.toMatchObject({ status: 'rejected', reason: 'worker-unavailable' });
    expect(p.binding).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(unhandled).toEqual([]);
  });
  it('release never throws, and neither does a release after a failed bind', async () => {
    const p = make();
    await p.bind({ tabId: 7, windowId: 1, origin: SITE });
    broken = true;
    expect(() => p.release()).not.toThrow();
    expect(p.binding).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(unhandled).toEqual([]);
  });
  it('bind resolves to worker-unavailable, and the abort path (person changed mid-bind) does not throw', async () => {
    broken = true;
    expect(await make().bind({ tabId: 7, windowId: 1, origin: SITE })).toEqual({ ok: false, reason: 'worker-unavailable' });
    broken = false;
    let finish!: (value: unknown) => void;
    let calls = 0;
    const p = createBrowserCommandPort(host, { send: (message) => { calls += 1; if (calls > 1) throw new Error('Extension context invalidated.'); void message; return new Promise((resolve) => { finish = resolve; }); } });
    const pending = p.bind({ tabId: 7, windowId: 1, origin: SITE });
    host.access += 1;
    finish({ ok: true });
    await expect(pending).resolves.toEqual({ ok: false, reason: 'stale-access-epoch' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(unhandled).toEqual([]);
  });
});

describe('release() while a command is in flight', () => {
  it('resolves the pending command as invalidated and ignores the late reply', async () => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => { open = resolve; });
    const original = chrome.scriptResult;
    chrome.scriptResult = async () => { await gate; return original(); };
    const pending = port.execute(cmd('scroll-down'));
    await new Promise((resolve) => setTimeout(resolve, 5));
    port.release();
    await expect(pending).resolves.toMatchObject({ status: 'rejected', reason: 'invalidated' });
    open();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(port.binding).toBeNull();
    expect(await port.execute(cmd('scroll-down'))).toMatchObject({ reason: 'not-bound' });
  });
});
