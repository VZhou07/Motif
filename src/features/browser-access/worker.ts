import type { BrowserCommandResult } from '../../care/browser-contract';
import type { ChromeLike, MessageListener, MessageSender } from './chrome-like';
import { classifyChromeError, exactOrigin, sameOrigin } from './origins';
import {
  parseWorkerMessage, SCROLL_FRACTION, SEEN_ID_LIMIT, type BindMessage, type CommandMessage, type RejectCode, type ReleaseMessage, type WorkerReply,
} from './protocol';

export const BINDING_KEY = 'motif.binding';
export const SEEN_KEY = 'motif.seen';
const BIND_BUDGET_MS = 2_000;

export interface Binding {
  panelId: string; identityKey: string; accessEpoch: number; tabId: number; windowId: number; origin: string;
  /** Highest input epoch seen from this panel. Commands below it are reordered or stale. */
  maxInputEpoch: number | null;
}

/** URL.origin is opaque ("null") for extension URLs in some runtimes, so build it from the parts. */
const originOf = (url: URL): string => `${url.protocol}//${url.host}`;

/** True only for the Motif controller page (side panel or docked copy), never for pages, scripts or other extension pages. */
export function isTrustedSender(sender: MessageSender | undefined, api: Pick<ChromeLike['runtime'], 'id' | 'getURL'>): boolean {
  if (!sender || sender.id !== api.id || sender.frameId !== 0) return false;
  let own: URL;
  let url: URL;
  try { own = new URL(api.getURL('')); url = new URL(sender.url ?? ''); } catch { return false; }
  return sender.origin === originOf(own) && originOf(url) === originOf(own) && url.pathname === '/sidepanel.html';
}

/** Runs inside the page (isolated world). Numbers in, numbers out; the page cannot call it. */
export function scrollPage(fraction: number): { before: number; after: number; height: number } {
  const element = document.scrollingElement ?? document.documentElement;
  const before = element.scrollTop;
  const height = window.innerHeight;
  window.scrollBy({ top: fraction * height, left: 0, behavior: 'instant' });
  return { before, after: element.scrollTop, height };
}

const finiteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
function validScrollResult(value: unknown): value is { before: number; after: number; height: number } {
  return typeof value === 'object' && value !== null && finiteNumber((value as Record<string, unknown>).before)
    && finiteNumber((value as Record<string, unknown>).after) && finiteNumber((value as Record<string, unknown>).height);
}

export interface Worker { dispose(): void }

/**
 * The service worker's whole job: validate and run tab commands. No tracker, no UI. All state lives in
 * chrome.storage.session because MV3 workers are suspended. Messages are handled one at a time.
 */
export function createWorker(api: ChromeLike, options: { now?: () => number } = {}): Worker {
  const now = options.now ?? (() => Date.now());
  let queue: Promise<unknown> = Promise.resolve();

  const reject = (reason: RejectCode): WorkerReply => ({ ok: false, reason });
  const result = (id: string, status: BrowserCommandResult['status'], reason?: RejectCode): WorkerReply => ({
    ok: true, result: { version: 1, id, status, ...(reason ? { reason } : {}) },
  });
  const readBinding = async (): Promise<Binding | null> => ((await api.storage.session.get(BINDING_KEY))[BINDING_KEY] as Binding | undefined) ?? null;
  const clearBinding = () => api.storage.session.remove(BINDING_KEY);

  async function bind(message: BindMessage, sender: MessageSender): Promise<WorkerReply> {
    const deadline = now() + BIND_BUDGET_MS;
    if (exactOrigin(message.origin) !== message.origin) return reject('unsupported-page');
    if (sender.tab?.id === message.tabId) return reject('sender-rejected');
    let tab;
    try { tab = await api.tabs.get(message.tabId); } catch { return reject('tab-closed'); }
    if (now() >= deadline) return reject('expired');
    if (tab.windowId !== message.windowId) return reject('page-changed');
    const activeTabs = await api.tabs.query({ active: true, windowId: message.windowId });
    if (now() >= deadline) return reject('expired');
    if (!activeTabs.some((candidate) => candidate.id === message.tabId)) return reject('page-changed');
    if (!tab.url) return reject('unsupported-page');
    if (tab.status !== 'complete') return reject('page-loading');
    if (!sameOrigin(tab.url, message.origin)) return reject('page-changed');
    const granted = await api.permissions.contains({ origins: [`${message.origin}/*`] });
    if (now() >= deadline) return reject('expired');
    if (!granted) return reject('permission-missing');
    const binding: Binding = { panelId: message.panelId, identityKey: message.identityKey, accessEpoch: message.accessEpoch,
      tabId: message.tabId, windowId: message.windowId, origin: message.origin, maxInputEpoch: null };
    await api.storage.session.set({ [BINDING_KEY]: binding });
    return { ok: true };
  }

  async function release(message: ReleaseMessage): Promise<WorkerReply> {
    const binding = await readBinding();
    if (binding && binding.panelId === message.panelId) await clearBinding();
    return { ok: true };
  }

  async function command(message: CommandMessage, sender: MessageSender, deadline: number): Promise<WorkerReply> {
    const { command: cmd } = message;
    const stored = await readBinding();
    if (now() >= deadline) return result(cmd.id, 'rejected', 'expired');
    if (!stored || stored.panelId !== message.panelId) return result(cmd.id, 'rejected', 'not-bound');
    const maxInput = stored.maxInputEpoch ?? -Infinity;
    if (cmd.accessEpoch !== stored.accessEpoch) return result(cmd.id, 'rejected', 'stale-access-epoch');
    if (cmd.inputEpoch < maxInput) return result(cmd.id, 'rejected', 'stale-input-epoch');
    if (sender.tab?.id === stored.tabId) return result(cmd.id, 'rejected', 'sender-rejected');

    const seen = ((await api.storage.session.get(SEEN_KEY))[SEEN_KEY] as string[] | undefined) ?? [];
    if (now() >= deadline) return result(cmd.id, 'rejected', 'expired');
    if (seen.includes(cmd.id)) return result(cmd.id, 'rejected', 'duplicate');
    // Record before running: a failed command is never replayed under the same id.
    await api.storage.session.set({ [SEEN_KEY]: [...seen, cmd.id].slice(-SEEN_ID_LIMIT), [BINDING_KEY]: { ...stored, maxInputEpoch: Math.max(maxInput, cmd.inputEpoch) } satisfies Binding });
    if (now() >= deadline) return result(cmd.id, 'rejected', 'expired');

    const drop = async (reason: RejectCode): Promise<WorkerReply> => { await clearBinding(); return result(cmd.id, 'rejected', reason); };
    let tab;
    try { tab = await api.tabs.get(stored.tabId); } catch { return drop('tab-closed'); }
    if (now() >= deadline) return result(cmd.id, 'rejected', 'expired');
    const activeTabs = await api.tabs.query({ active: true, windowId: tab.windowId ?? stored.windowId });
    if (now() >= deadline) return result(cmd.id, 'rejected', 'expired');
    if (tab.status !== 'complete' || !tab.url || !sameOrigin(tab.url, stored.origin) || !activeTabs.some((candidate) => candidate.id === stored.tabId)) return drop('page-changed');
    const granted = await api.permissions.contains({ origins: [`${stored.origin}/*`] });
    if (now() >= deadline) return result(cmd.id, 'rejected', 'expired');
    if (!granted) return drop('permission-missing');

    try {
      if (cmd.action === 'back') {
        await api.tabs.goBack(stored.tabId);
        return result(cmd.id, 'executed');
      }
      const direction = cmd.action === 'scroll-down' ? 1 : -1;
      const injected = await api.scripting.executeScript({
        target: { tabId: stored.tabId, frameIds: [0] }, func: scrollPage, args: [direction * SCROLL_FRACTION], world: 'ISOLATED',
      });
      const value = injected[0]?.result;
      if (!validScrollResult(value)) return drop('execution-failed');
      return value.after === value.before ? result(cmd.id, 'rejected', 'cannot-scroll') : result(cmd.id, 'executed');
    } catch (error) {
      const code = classifyChromeError(error instanceof Error ? error.message : String(error));
      return code === 'no-history' || code === 'cannot-scroll' ? result(cmd.id, 'rejected', code) : drop(code);
    }
  }

  const listener: MessageListener = (raw, sender, sendResponse) => {
    // Deadline starts at receipt so queueing behind other messages cannot extend a command's life.
    const receivedAt = now();
    if (!isTrustedSender(sender, api.runtime)) { sendResponse(reject('sender-rejected')); return false; }
    const parsed = parseWorkerMessage(raw);
    if (!parsed.ok) { sendResponse(reject(parsed.reason)); return false; }
    const message = parsed.message;
    queue = queue.then(async (): Promise<WorkerReply> => {
      switch (message.type) {
        case 'motif/bind': return bind(message, sender);
        case 'motif/release': return release(message);
        case 'motif/command': return command(message, sender, receivedAt + message.ttlMs);
      }
    }).catch((): WorkerReply => reject('execution-failed')).then((reply) => { sendResponse(reply); });
    return true;
  };

  // Registered synchronously at top level so a woken worker never misses the message that woke it.
  api.runtime.onMessage.addListener(listener);
  void api.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true })?.catch(() => {});
  return { dispose: () => api.runtime.onMessage.removeListener(listener) };
}
