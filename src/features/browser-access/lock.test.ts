import { describe, expect, it } from 'vitest';
import { acquireRuntimeLock, RUNTIME_LOCK_NAME, type LockManagerLike } from './lock';

/** In-memory Web Locks with ifAvailable semantics. */
function fakeLocks(): LockManagerLike & { held: Set<string> } {
  const held = new Set<string>();
  return {
    held,
    async request(name, _options, callback) {
      if (held.has(name)) { await callback(null); return; }
      held.add(name);
      try { await callback({}); } finally { held.delete(name); }
    },
  };
}

describe('single visible runtime', () => {
  it('the first copy holds the lock and a second copy does not', async () => {
    const locks = fakeLocks();
    const first = await acquireRuntimeLock(locks);
    const second = await acquireRuntimeLock(locks);
    expect(first.held).toBe(true);
    expect(second.held).toBe(false);
    expect(locks.held.has(RUNTIME_LOCK_NAME)).toBe(true);
  });
  it('releasing lets the next copy take over', async () => {
    const locks = fakeLocks();
    const first = await acquireRuntimeLock(locks);
    first.release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await acquireRuntimeLock(locks)).held).toBe(true);
  });
  it('without Web Locks nothing is held, so no tracker may start', async () => {
    expect((await acquireRuntimeLock(undefined)).held).toBe(false);
  });
});
