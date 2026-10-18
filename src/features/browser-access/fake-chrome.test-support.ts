import type { ChromeEvent, ChromeLike, ChromeTab, InjectionResult, MessageListener, MessageSender, ScriptInjection } from './chrome-like';

export class FakeEvent<F extends (...args: never[]) => unknown> implements ChromeEvent<F> {
  readonly listeners = new Set<F>();
  addListener(listener: F): void { this.listeners.add(listener); }
  removeListener(listener: F): void { this.listeners.delete(listener); }
  fire(...args: Parameters<F>): void { for (const listener of [...this.listeners]) (listener as (...a: Parameters<F>) => unknown)(...args); }
}

export const EXT_ID = 'abcdefghijklmnopabcdefghijklmnop';
export const EXT_ORIGIN = `chrome-extension://${EXT_ID}`;
export const PANEL_SENDER: MessageSender = { id: EXT_ID, url: `${EXT_ORIGIN}/sidepanel.html`, origin: EXT_ORIGIN, frameId: 0 };

/** A controllable stand-in for the Chrome APIs Motif uses. Tests only. */
export class FakeChrome implements ChromeLike {
  tabsById = new Map<number, ChromeTab>();
  /** Active tab id per window id. */
  active = new Map<number, number>();
  lastFocusedWindow = 1;
  grantedOrigins = new Set<string>();
  store = new Map<string, unknown>();
  executed: ScriptInjection[] = [];
  goBacks: number[] = [];
  sent: unknown[] = [];
  scriptResult: () => InjectionResult[] | Promise<InjectionResult[]> = () => [{ frameId: 0, result: { before: 0, after: 525, height: 700 } }];
  scriptError: Error | null = null;
  backError: Error | null = null;
  /** Called after every awaited fake so a test can advance a fake clock (slowness). */
  onAwait: () => void = () => {};
  panelBehavior: unknown[] = [];

  readonly messageEvent = new FakeEvent<MessageListener>();
  readonly onActivated = new FakeEvent<(info: { tabId: number; windowId: number }) => void>();
  readonly onUpdated = new FakeEvent<(tabId: number, change: { url?: string; status?: string }, tab: ChromeTab) => void>();
  readonly onRemoved = new FakeEvent<(tabId: number) => void>();
  readonly onReplaced = new FakeEvent<(added: number, removed: number) => void>();
  readonly onPermissionsRemoved = new FakeEvent<(permissions: { origins?: string[] }) => void>();

  readonly id = EXT_ID;

  private async tick(): Promise<void> { await Promise.resolve(); this.onAwait(); }

  addTab(tab: ChromeTab & { id: number }): void {
    this.tabsById.set(tab.id, { windowId: 1, status: 'complete', ...tab });
    if (tab.active) this.active.set(tab.windowId ?? 1, tab.id);
  }
  grant(origin: string): void { this.grantedOrigins.add(`${origin}/*`); }

  get runtime(): ChromeLike['runtime'] {
    return {
      id: this.id,
      getURL: (path: string) => `${EXT_ORIGIN}/${path}`,
      sendMessage: async (message: unknown) => {
        this.sent.push(message);
        return this.deliver(message, PANEL_SENDER);
      },
      onMessage: this.messageEvent,
    };
  }

  /** Delivers like Chrome: rejects when no listener exists, waits for sendResponse when the listener returns true. */
  deliver(message: unknown, sender: MessageSender): Promise<unknown> {
    if (!this.messageEvent.listeners.size) return Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'));
    return new Promise((resolve) => {
      let answered = false;
      const respond = (value: unknown) => { if (!answered) { answered = true; resolve(value); } };
      let keepOpen = false;
      for (const listener of this.messageEvent.listeners) keepOpen = listener(message, sender, respond) === true || keepOpen;
      if (!keepOpen && !answered) respond(undefined);
    });
  }

  get tabs(): ChromeLike['tabs'] {
    return {
      query: async (info) => {
        await this.tick();
        const windowId = info.windowId ?? (info.lastFocusedWindow ? this.lastFocusedWindow : undefined);
        return [...this.tabsById.values()].filter((tab) => (info.active === undefined || (this.active.get(tab.windowId ?? 1) === tab.id) === info.active)
          && (windowId === undefined || tab.windowId === windowId));
      },
      get: async (tabId) => {
        await this.tick();
        const tab = this.tabsById.get(tabId);
        if (!tab) throw new Error(`No tab with id: ${tabId}.`);
        return { ...tab };
      },
      goBack: async (tabId) => {
        await this.tick();
        this.goBacks.push(tabId);
        if (this.backError) throw this.backError;
      },
      onActivated: this.onActivated,
      onUpdated: this.onUpdated,
      onRemoved: this.onRemoved,
      onReplaced: this.onReplaced,
    };
  }

  get scripting(): ChromeLike['scripting'] {
    return {
      executeScript: async (injection) => {
        await this.tick();
        this.executed.push(injection);
        if (this.scriptError) throw this.scriptError;
        return this.scriptResult();
      },
    };
  }

  get permissions(): ChromeLike['permissions'] {
    return {
      contains: async ({ origins }) => { await this.tick(); return origins.every((origin) => this.grantedOrigins.has(origin)); },
      request: async ({ origins }) => { origins.forEach((origin) => this.grantedOrigins.add(origin)); return true; },
      remove: async ({ origins }) => { origins.forEach((origin) => this.grantedOrigins.delete(origin)); return true; },
      onRemoved: this.onPermissionsRemoved,
    };
  }

  get storage(): ChromeLike['storage'] {
    return {
      session: {
        get: async (keys) => {
          await this.tick();
          const list = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(list.filter((key) => this.store.has(key)).map((key) => [key, structuredClone(this.store.get(key))]));
        },
        set: async (items) => { await this.tick(); for (const [key, value] of Object.entries(items)) this.store.set(key, structuredClone(value)); },
        remove: async (keys) => { await this.tick(); for (const key of Array.isArray(keys) ? keys : [keys]) this.store.delete(key); },
      },
    };
  }

  get sidePanel(): NonNullable<ChromeLike['sidePanel']> {
    return { setPanelBehavior: async (behavior) => { this.panelBehavior.push(behavior); } };
  }
}
