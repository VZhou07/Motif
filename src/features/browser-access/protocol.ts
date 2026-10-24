import { BROWSER_COMMAND_VERSION } from '../../care/browser-contract';
import type { BrowserAction, BrowserCommand } from '../../care/browser-contract';

/** Actions that touch a tab and therefore cross to the service worker. `return-to-communication` never does. */
export const TAB_ACTIONS = ['scroll-up', 'scroll-down', 'back'] as const;
export type TabAction = typeof TAB_ACTIONS[number];
export const ALL_ACTIONS: readonly BrowserAction[] = [...TAB_ACTIONS, 'return-to-communication'];

export const REJECT_CODES = [
  'bad-version', 'bad-id', 'unknown-action', 'invalid-times', 'expired', 'not-yet-valid',
  'stale-input-epoch', 'stale-access-epoch', 'identity-changed', 'wrong-scope', 'not-bound', 'busy',
  'duplicate', 'sender-rejected', 'invalidated', 'timeout', 'page-loading', 'page-changed', 'tab-closed',
  'permission-missing', 'unsupported-page', 'no-history', 'cannot-scroll', 'worker-unavailable', 'execution-failed',
  'bad-message',
] as const;
export type RejectCode = typeof REJECT_CODES[number];

export const DEFAULT_TTL_MS = 600;
export const MAX_TTL_MS = 1_000;
export const FUTURE_SKEW_MS = 50;
export const SEEN_ID_LIMIT = 256;
export const MAX_ID_LENGTH = 64;
export const IDLE_RETURN_MS = 180_000;
/** Fraction of the viewport height moved by one Scroll command. */
export const SCROLL_FRACTION = 0.75;

export const PROTOCOL_VERSION = 1 as const;

export interface BindMessage {
  type: 'motif/bind'; v: 1; panelId: string; identityKey: string; accessEpoch: number;
  tabId: number; windowId: number; origin: string;
}
export interface CommandMessage { type: 'motif/command'; v: 1; panelId: string; command: BrowserCommand; ttlMs: number }
export interface ReleaseMessage { type: 'motif/release'; v: 1; panelId: string }
export type WorkerMessage = BindMessage | CommandMessage | ReleaseMessage;

export type WorkerReply =
  | { ok: true; result?: { version: 1; id: string; status: 'executed' | 'rejected'; reason?: string } }
  | { ok: false; reason: RejectCode };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const text = (value: unknown, max = 200): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;

export function isTabAction(action: unknown): action is TabAction {
  return typeof action === 'string' && (TAB_ACTIONS as readonly string[]).includes(action);
}
export function isKnownAction(action: unknown): action is BrowserAction {
  return typeof action === 'string' && (ALL_ACTIONS as readonly string[]).includes(action);
}

/** Shape and static checks only (no clock, epochs or state). */
export function parseCommand(raw: unknown): { ok: true; command: BrowserCommand } | { ok: false; reason: RejectCode } {
  if (!isObject(raw)) return { ok: false, reason: 'bad-message' };
  if (raw.version !== BROWSER_COMMAND_VERSION) return { ok: false, reason: 'bad-version' };
  if (!text(raw.id, MAX_ID_LENGTH)) return { ok: false, reason: 'bad-id' };
  if (!isKnownAction(raw.action)) return { ok: false, reason: 'unknown-action' };
  if (![raw.inputEpoch, raw.accessEpoch, raw.issuedAtMs, raw.expiresAtMs].every(finite)) return { ok: false, reason: 'invalid-times' };
  return { ok: true, command: {
    version: 1, id: raw.id, action: raw.action, inputEpoch: raw.inputEpoch as number, accessEpoch: raw.accessEpoch as number,
    issuedAtMs: raw.issuedAtMs as number, expiresAtMs: raw.expiresAtMs as number,
  } };
}

/** Time-window check on the controller monotonic clock. */
export function checkWindow(command: BrowserCommand, nowMs: number): RejectCode | null {
  const span = command.expiresAtMs - command.issuedAtMs;
  if (!(span > 0) || span > MAX_TTL_MS) return 'invalid-times';
  if (command.issuedAtMs > nowMs + FUTURE_SKEW_MS) return 'not-yet-valid';
  if (command.expiresAtMs <= nowMs) return 'expired';
  return null;
}

export function parseWorkerMessage(raw: unknown): { ok: true; message: WorkerMessage } | { ok: false; reason: RejectCode } {
  if (!isObject(raw) || raw.v !== PROTOCOL_VERSION) return { ok: false, reason: isObject(raw) && raw.v !== undefined ? 'bad-version' : 'bad-message' };
  if (!text(raw.panelId, 64)) return { ok: false, reason: 'bad-message' };
  switch (raw.type) {
    case 'motif/release': return { ok: true, message: { type: raw.type, v: 1, panelId: raw.panelId } };
    case 'motif/bind':
      if (!text(raw.identityKey, 100) || !finite(raw.accessEpoch) || !Number.isInteger(raw.tabId) || !Number.isInteger(raw.windowId) || !text(raw.origin, 300)) return { ok: false, reason: 'bad-message' };
      return { ok: true, message: { type: raw.type, v: 1, panelId: raw.panelId, identityKey: raw.identityKey, accessEpoch: raw.accessEpoch,
        tabId: raw.tabId as number, windowId: raw.windowId as number, origin: raw.origin } };
    case 'motif/command': {
      const parsed = parseCommand(raw.command);
      if (!parsed.ok) return parsed;
      if (!isTabAction(parsed.command.action)) return { ok: false, reason: 'unknown-action' };
      if (!finite(raw.ttlMs) || raw.ttlMs <= 0 || raw.ttlMs > MAX_TTL_MS) return { ok: false, reason: 'invalid-times' };
      return { ok: true, message: { type: raw.type, v: 1, panelId: raw.panelId, command: parsed.command, ttlMs: raw.ttlMs } };
    }
    default: return { ok: false, reason: 'bad-message' };
  }
}

/** One plain-language line per code, shown in the card and announced. */
export const REJECT_TEXT: Record<RejectCode, string> = {
  'bad-version': 'Motif could not understand that browser request. You are still on your messages.',
  'bad-id': 'Motif could not understand that browser request. You are still on your messages.',
  'unknown-action': 'Motif does not offer that browser action.',
  'invalid-times': 'That browser action arrived at the wrong time and was not run.',
  expired: 'That browser action took too long and was not run. Select it again.',
  'not-yet-valid': 'That browser action arrived at the wrong time and was not run.',
  'stale-input-epoch': 'Your movement was interrupted, so that browser action was not run. Rest, then try again.',
  'stale-access-epoch': 'The person using Motif changed, so browser control stopped. You are back on your messages.',
  'identity-changed': 'The person using Motif changed, so browser control stopped. You are back on your messages.',
  'wrong-scope': 'Browser controls are not active. Choose Browse a web page first.',
  'not-bound': 'No web page is selected. Choose Browse a web page first.',
  busy: 'Motif is still finishing the last browser action.',
  duplicate: 'That browser action was already used and was not run again.',
  'sender-rejected': 'Motif refused a browser request from an unknown source.',
  invalidated: 'Browser control was interrupted, so that action may not have completed.',
  timeout: 'The page did not respond in time. You are back on your messages.',
  'page-loading': 'The page is still loading. Try again when it has finished.',
  'page-changed': 'The page changed, so browser control stopped. You are back on your messages.',
  'tab-closed': 'The page was closed, so browser control stopped. You are back on your messages.',
  'permission-missing': 'Motif does not have permission for this site. A helper can allow it. You are back on your messages.',
  'unsupported-page': 'Motif cannot control this page. Chrome\'s own pages, the Web Store, the PDF viewer and local files cannot be controlled, and other sites need a helper to allow them first. You are back on your messages.',
  'no-history': 'There is no earlier page to go back to.',
  'cannot-scroll': 'This page cannot be scrolled with Motif.',
  'worker-unavailable': 'The Motif browser helper is not running. Ask a helper to reload the extension. You are back on your messages.',
  'execution-failed': 'The browser did not do that action. You are back on your messages.',
  'bad-message': 'Motif could not understand that browser request.',
};

/** Codes after which the binding is dropped and the person returns to messages. */
export const DROPS_SCOPE: ReadonlySet<RejectCode> = new Set<RejectCode>([
  'stale-access-epoch', 'identity-changed', 'page-changed', 'tab-closed', 'permission-missing', 'unsupported-page',
  'worker-unavailable', 'execution-failed', 'timeout', 'sender-rejected', 'not-bound',
]);
