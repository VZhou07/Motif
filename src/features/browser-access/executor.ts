import type { TabAction } from './protocol';
import type { RejectCode } from './protocol';

/**
 * The seam between the command pipeline and whatever moves a page. ChromeTabExecutor lives in worker.ts (primary).
 * The in-app reader (fallback 2) would implement this interface; it is deliberately NOT built unless both real
 * browser loops fail, and then it is described as reading inside Motif, never as browser control.
 */
export interface CommandExecutor {
  run(action: TabAction): Promise<{ status: 'executed' } | { status: 'rejected'; reason: RejectCode }>;
}

export const unavailableReader: CommandExecutor = {
  async run() { return { status: 'rejected', reason: 'unsupported-page' }; },
};
