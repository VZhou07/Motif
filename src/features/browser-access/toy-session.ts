import { dispatchTarget, type DispatchHandlers } from './dispatch';
import type { BrowserHostSession, BrowserRequest, HostScope, HostState } from './host';

/**
 * NOT the real MotifSession. A small stand-in with the same hook semantics as session-hooks.patch (epoch bumps on
 * every non-tracked frame, hidden change, pause/resume and scanner rebuild; Pause survives scope switches; a
 * five-tile browser list; one sink call per selection). Used by unit tests and the machine probe, and labelled as
 * such in all evidence. Real-session proof is chunk 8.
 */
export const COMMUNICATION_TILES = ['phrase:0', 'request:water', 'pause', 'browse'] as const;
export const BROWSER_TILES = ['browser:scroll-down', 'browser:scroll-up', 'browser:back', 'pause', 'browser:return'] as const;

export class ToySession implements BrowserHostSession {
  scope: HostScope = 'communication';
  tracking = 'tracked';
  hidden = false;
  camera = 'running';
  paused = false;
  index = 0;
  inputEpoch = 0;
  stage = 'communication';
  /** Every effect, in order, for assertions: `care:<id>`, `browser:<request>`, `local:<id>`. */
  readonly effects: string[] = [];
  private sink: ((request: BrowserRequest) => void) | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly failListeners = new Set<() => void>();

  getHostState(): HostState {
    return { scope: this.scope, tracking: this.tracking, hidden: this.hidden, camera: this.camera, paused: this.paused, stage: this.stage };
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  getInputEpoch(): number { return this.inputEpoch; }
  onFailClosed(listener: () => void): () => void { this.failListeners.add(listener); return () => { this.failListeners.delete(listener); }; }

  tiles(): readonly string[] {
    return this.scope === 'browser' ? BROWSER_TILES : COMMUNICATION_TILES.filter((id) => id !== 'browse' || this.sink !== null);
  }
  highlighted(): string | undefined { return this.tiles()[this.index]; }

  private bump(): void {
    this.inputEpoch += 1;
    for (const listener of this.failListeners) { try { listener(); } catch { /* A consumer cannot break fail-closed handling. */ } }
  }
  private publish(): void { for (const listener of [...this.listeners]) listener(); }
  private rebuild(): void { this.bump(); this.index = 0; }

  setBrowserSink(sink: ((request: BrowserRequest) => void) | null): void {
    if (this.sink === sink) return;
    this.sink = sink;
    if (!sink && this.scope === 'browser') this.scope = 'communication';
    this.rebuild();
    this.publish();
  }
  enterBrowserScope(): boolean {
    if (!this.sink || this.scope !== 'communication' || this.hidden || this.paused) return false;
    this.scope = 'browser';
    this.rebuild();
    this.publish();
    return true;
  }
  returnToCommunication(): boolean {
    if (this.scope === 'communication') return true;
    this.scope = 'communication';
    this.rebuild();
    this.publish();
    return true;
  }

  /** A tracker frame. Anything but `tracked` bumps the epoch, exactly like the patched session. */
  frame(tracking: string): void {
    this.tracking = tracking;
    if (tracking !== 'tracked') this.bump();
    this.publish();
  }
  setHidden(hidden: boolean): void { this.hidden = hidden; this.bump(); this.publish(); }
  setPaused(paused: boolean): void { if (this.paused === paused) return; this.bump(); this.paused = paused; this.publish(); }
  advance(): void { this.index = (this.index + 1) % this.tiles().length; }
  /** Moves the highlight to a tile (tests do not simulate the timer). */
  highlight(id: string): void {
    const found = this.tiles().indexOf(id);
    if (found < 0) throw new Error(`no tile ${id} in ${this.scope} scope`);
    this.index = found;
  }

  /** One deliberate selection of the highlighted tile. While paused it resumes instead of acting. */
  select(handlers: Partial<DispatchHandlers> = {}): void {
    if (this.tracking !== 'tracked' || this.hidden) return;
    if (this.paused) { this.setPaused(false); return; }
    const id = this.highlighted();
    if (!id) return;
    if (id === 'pause') { this.setPaused(true); return; }
    const kind = dispatchTarget(id, this.scope, {
      browser: (target) => {
        if (target === 'browse') { this.effects.push('browser:browse'); this.sink?.('browse'); return; }
        const request = target.slice('browser:'.length);
        if (target === 'browser:return') { this.returnToCommunication(); return; }
        this.effects.push(`browser:${request}`);
        this.sink?.(request as BrowserRequest);
      },
      care: (target) => { this.effects.push(`care:${target}`); handlers.care?.(target); },
      local: (target) => { this.effects.push(`local:${target}`); handlers.local?.(target); },
    });
    void kind;
  }
}
