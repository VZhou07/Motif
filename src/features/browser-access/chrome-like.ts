/**
 * The minimal Chrome surface Motif uses. Logic takes this interface instead of the global `chrome`,
 * so it is typechecked and tested under the root tsconfig with no @types/chrome.
 */
export interface ChromeEvent<F extends (...args: never[]) => unknown> {
  addListener(listener: F): void;
  removeListener(listener: F): void;
}
export interface ChromeTab { id?: number; windowId?: number; url?: string; status?: 'loading' | 'complete' | 'unloaded'; active?: boolean }
export interface MessageSender { id?: string; url?: string; origin?: string; tab?: ChromeTab; frameId?: number }
export interface InjectionResult { result?: unknown; frameId?: number }
export interface ScriptInjection {
  target: { tabId: number; frameIds?: number[] };
  func: (...args: never[]) => unknown;
  args?: unknown[];
  world?: 'ISOLATED' | 'MAIN';
}
export interface SessionStorageArea {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}
export type MessageListener = (message: unknown, sender: MessageSender, sendResponse: (response: unknown) => void) => boolean | void;

export interface ChromeLike {
  runtime: {
    id: string;
    getURL(path: string): string;
    sendMessage(message: unknown): Promise<unknown>;
    onMessage: ChromeEvent<MessageListener>;
  };
  tabs: {
    query(info: { active?: boolean; lastFocusedWindow?: boolean; windowId?: number }): Promise<ChromeTab[]>;
    get(tabId: number): Promise<ChromeTab>;
    goBack(tabId: number): Promise<void>;
    onActivated: ChromeEvent<(info: { tabId: number; windowId: number }) => void>;
    onUpdated: ChromeEvent<(tabId: number, change: { url?: string; status?: string }, tab: ChromeTab) => void>;
    onRemoved: ChromeEvent<(tabId: number) => void>;
    onReplaced: ChromeEvent<(addedTabId: number, removedTabId: number) => void>;
  };
  scripting: { executeScript(injection: ScriptInjection): Promise<InjectionResult[]> };
  permissions: {
    contains(query: { origins: string[] }): Promise<boolean>;
    request(query: { origins: string[] }): Promise<boolean>;
    remove(query: { origins: string[] }): Promise<boolean>;
    onRemoved: ChromeEvent<(permissions: { origins?: string[] }) => void>;
  };
  storage: { session: SessionStorageArea };
  sidePanel?: { setPanelBehavior(behavior: { openPanelOnActionClick: boolean }): Promise<void> };
}
