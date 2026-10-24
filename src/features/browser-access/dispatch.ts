import type { HostScope } from './host';

export type TargetKind = 'browser' | 'care' | 'local';

/** Ids the scan lists use: `browser:*` and `browse` act on the page, `request:*` send care requests, everything else is local. */
export function classifyTarget(id: string): TargetKind {
  if (id === 'browse' || id.startsWith('browser:')) return 'browser';
  if (id.startsWith('request:')) return 'care';
  return 'local';
}

export interface DispatchHandlers {
  browser(id: string): void;
  care(id: string): void;
  local(id: string): void;
}

/**
 * The single path from one selected tile to one effect. A browser tile never sends a care request and a care tile
 * never touches the browser; a tile that does not belong to the active scope does nothing at all.
 */
export function dispatchTarget(id: string, scope: HostScope, handlers: DispatchHandlers): TargetKind | 'ignored' {
  const kind = classifyTarget(id);
  if (kind === 'browser') {
    const allowed = id === 'browse' ? scope === 'communication' : scope === 'browser';
    if (!allowed) return 'ignored';
    handlers.browser(id);
    return 'browser';
  }
  if (scope === 'browser' && kind === 'care') return 'ignored';
  handlers[kind](id);
  return kind;
}
