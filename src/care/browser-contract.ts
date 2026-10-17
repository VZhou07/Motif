/** Type-only port. Agent 4 must implement permission, identity and runtime validation. */
export const BROWSER_COMMAND_VERSION = 1 as const;
export type BrowserAction = 'scroll-up' | 'scroll-down' | 'back' | 'return-to-communication';
export interface BrowserCommand {
  version: 1;
  id: string;
  action: BrowserAction;
  inputEpoch: number;
  accessEpoch: number;
  /** Both timestamps belong to the visible controller's monotonic clock. */
  issuedAtMs: number;
  expiresAtMs: number;
}
export interface BrowserCommandResult { version: 1; id: string; status: 'executed' | 'rejected'; reason?: string }
/** Bind to one controller/tab. Invalidate cancels pending work; never replay late. */
export interface BrowserCommandPort {
  execute(command: BrowserCommand): Promise<BrowserCommandResult>;
  invalidate(): void;
}
