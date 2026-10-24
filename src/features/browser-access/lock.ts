/** Just the part of navigator.locks Motif uses (injectable for tests). */
export interface LockManagerLike {
  request(name: string, options: { ifAvailable: true }, callback: (lock: object | null) => Promise<void>): Promise<void>;
}
export interface RuntimeLock { readonly held: boolean; release(): void }

export const RUNTIME_LOCK_NAME = 'motif-runtime-v1';

/**
 * One visible Motif runtime per browser profile in the extension origin. The lock lives as long as the page, or
 * until release(). A second copy gets held=false, shows a notice and must start no tracker.
 */
export async function acquireRuntimeLock(locks: LockManagerLike | undefined): Promise<RuntimeLock> {
  if (!locks) return { held: false, release() {} };
  let release: () => void = () => {};
  const done = new Promise<void>((resolve) => { release = resolve; });
  let held = false;
  await new Promise<void>((started) => {
    void locks.request(RUNTIME_LOCK_NAME, { ifAvailable: true }, (lock) => {
      held = lock !== null;
      started();
      return held ? done : Promise.resolve();
    });
  });
  return { held, release };
}
