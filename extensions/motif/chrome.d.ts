import type { ChromeLike } from '../../src/features/browser-access/chrome-like';

declare global {
  const chrome: ChromeLike;
}
