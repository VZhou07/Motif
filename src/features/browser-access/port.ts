import type { BrowserCommand, BrowserCommandPort, BrowserCommandResult } from '../../care/browser-contract';
import { exactOrigin } from './origins';
import {
  checkWindow, DROPS_SCOPE, parseCommand, parseWorkerMessage, SEEN_ID_LIMIT, isTabAction, type RejectCode, type WorkerReply,
} from './protocol';

/** What the port needs to know about the visible controller, read at the moment of use. */
export interface PortHost {
  /** The controller's monotonic clock (performance.now). */
  now(): number;
  inputEpoch(): number;
  accessEpoch(): number;
  /** `participant:<id>` or `local`. Never a credential. */
  identityKey(): string;
  scope(): 'communication' | 'browser';
  /** Switch to the communication view; true when it is (now) active. */
  returnToCommunication(): boolean;
}

export interface PortTransport { send(message: unknown): Promise<unknown> }
export interface PortBinding { tabId: number; windowId: number; origin: string; identityKey: string; accessEpoch: number }
export type BindResult = { ok: true } | { ok: false; reason: RejectCode };

export interface BrowserPort extends BrowserCommandPort {
  readonly panelId: string;
  readonly binding: PortBinding | null;
  bind(target: { tabId: number; windowId: number; origin: string }): Promise<BindResult>;
  /** Cancels pending work AND forgets the binding (also tells the worker). */
  release(): void;
}

const rejected = (id: string, reason: RejectCode): BrowserCommandResult => ({ version: 1, id, status: 'rejected', reason });
const executed = (id: string): BrowserCommandResult => ({ version: 1, id, status: 'executed' });

/**
 * Panel-side BrowserCommandPort. Validates everything before anything is sent, allows one command in flight,
 * records ids before acting (so a failed command is never replayed) and never queues.
 */
export function createBrowserCommandPort(host: PortHost, rawTransport: PortTransport, options: { panelId?: string } = {}): BrowserPort {
  // chrome.runtime.sendMessage can throw synchronously ("Extension context invalidated."): always turn that into a rejected promise.
  const transport: PortTransport = { send: (message) => { try { return Promise.resolve(rawTransport.send(message)); } catch (error) { return Promise.reject(error); } } };
  const panelId = options.panelId ?? crypto.randomUUID();
  const seen: string[] = [];
  let binding: PortBinding | null = null;
  let generation = 0;
  let inFlight = false;
  let bindPending = false;
  let cancelInFlight: (() => void) | null = null;

  const remember = (id: string) => { seen.push(id); if (seen.length > SEEN_ID_LIMIT) seen.shift(); };

  function guard(command: BrowserCommand): RejectCode | null {
    const window = checkWindow(command, host.now());
    if (window) return window;
    if (command.accessEpoch !== host.accessEpoch()) return 'stale-access-epoch';
    if (command.inputEpoch !== host.inputEpoch()) return 'stale-input-epoch';
    if (binding && binding.identityKey !== host.identityKey()) return 'identity-changed';
    if (seen.includes(command.id)) return 'duplicate';
    return null;
  }

  async function execute(raw: BrowserCommand): Promise<BrowserCommandResult> {
    const parsed = parseCommand(raw);
    if (!parsed.ok) return rejected(typeof (raw as { id?: unknown })?.id === 'string' ? (raw as { id: string }).id : '', parsed.reason);
    const command = parsed.command;
    const early = guard(command);
    if (early) return rejected(command.id, early);

    if (command.action === 'return-to-communication') {
      // Local only: never crosses to the worker, needs no binding, tab or permission.
      remember(command.id);
      return host.returnToCommunication() ? executed(command.id) : rejected(command.id, 'wrong-scope');
    }
    if (!isTabAction(command.action)) return rejected(command.id, 'unknown-action');
    if (host.scope() !== 'browser') return rejected(command.id, 'wrong-scope');
    if (!binding) return rejected(command.id, 'not-bound');
    if (inFlight) return rejected(command.id, 'busy');

    inFlight = true;
    remember(command.id);
    const startedGeneration = generation;
    const cancelled = new Promise<'cancelled'>((resolve) => { cancelInFlight = () => resolve('cancelled'); });
    try {
      const message = { type: 'motif/command', v: 1, panelId, command, ttlMs: command.expiresAtMs - host.now() };
      if (!parseWorkerMessage(message).ok) return rejected(command.id, 'invalid-times');
      const outcome = await Promise.race([transport.send(message).then((value) => ({ value }), () => ({ failed: true as const })), cancelled]);
      if (outcome === 'cancelled' || generation !== startedGeneration) return rejected(command.id, 'invalidated');
      if ('failed' in outcome) { binding = null; return rejected(command.id, 'worker-unavailable'); }
      // Late reply under changed epochs: the page may have moved, but nothing may treat it as a success.
      if (host.inputEpoch() !== command.inputEpoch || host.accessEpoch() !== command.accessEpoch) return rejected(command.id, 'invalidated');
      const reply = outcome.value as WorkerReply | undefined;
      if (!reply || typeof reply !== 'object') { binding = null; return rejected(command.id, 'execution-failed'); }
      if (!reply.ok) { if (DROPS_SCOPE.has(reply.reason)) binding = null; return rejected(command.id, reply.reason); }
      const result = reply.result;
      if (!result || result.id !== command.id || (result.status !== 'executed' && result.status !== 'rejected')) { binding = null; return rejected(command.id, 'execution-failed'); }
      if (result.status === 'executed') return executed(command.id);
      const reason = (result.reason ?? 'execution-failed') as RejectCode;
      if (DROPS_SCOPE.has(reason)) binding = null;
      return rejected(command.id, reason);
    } finally {
      inFlight = false;
      cancelInFlight = null;
    }
  }

  function invalidate(): void {
    generation += 1;
    cancelInFlight?.();
  }

  return {
    panelId,
    get binding() { return binding ? { ...binding } : null; },
    execute,
    invalidate,
    release() {
      invalidate();
      const had = binding;
      binding = null;
      if (had) void transport.send({ type: 'motif/release', v: 1, panelId }).catch(() => {});
    },
    async bind(target) {
      if (bindPending) return { ok: false, reason: 'busy' };
      if (exactOrigin(target.origin) !== target.origin) return { ok: false, reason: 'unsupported-page' };
      bindPending = true;
      const startedGeneration = generation;
      const identityKey = host.identityKey();
      const accessEpoch = host.accessEpoch();
      try {
        let reply: unknown;
        try { reply = await transport.send({ type: 'motif/bind', v: 1, panelId, identityKey, accessEpoch, ...target }); }
        catch { return { ok: false, reason: 'worker-unavailable' }; }
        const answer = reply as WorkerReply | undefined;
        if (!answer || typeof answer !== 'object' || !('ok' in answer)) return { ok: false, reason: 'execution-failed' };
        if (!answer.ok) return { ok: false, reason: answer.reason };
        // The person, access or input may have changed while the worker was checking the tab.
        if (generation !== startedGeneration || host.identityKey() !== identityKey || host.accessEpoch() !== accessEpoch) {
          void transport.send({ type: 'motif/release', v: 1, panelId }).catch(() => {});
          return { ok: false, reason: 'stale-access-epoch' };
        }
        binding = { ...target, identityKey, accessEpoch };
        return { ok: true };
      } finally { bindPending = false; }
    },
  };
}
