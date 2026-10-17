import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCueAudio } from './audio';

class FakeParam {
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
  cancelScheduledValues = vi.fn();
}

class FakeOscillator {
  type = '';
  frequency = new FakeParam();
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeGain {
  gain = new FakeParam();
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeContext {
  state: AudioContextState = 'suspended';
  currentTime = 4;
  destination = {};
  oscillators: FakeOscillator[] = [];
  gains: FakeGain[] = [];
  resume = vi.fn(async () => { this.state = 'running'; });
  close = vi.fn(async () => { this.state = 'closed'; });
  createOscillator = vi.fn(() => {
    const node = new FakeOscillator();
    this.oscillators.push(node);
    return node;
  });
  createGain = vi.fn(() => {
    const node = new FakeGain();
    this.gains.push(node);
    return node;
  });
}

const asContext = (context: FakeContext): AudioContext => context as unknown as AudioContext;
const create = (context = new FakeContext()) => {
  const factory = vi.fn(() => asContext(context));
  return { context, factory, audio: createCueAudio(factory) };
};
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('local calibration cue audio (R13)', () => {
  it('creates no audio context until explicitly unlocked and never replays dropped cues', async () => {
    const { context, factory, audio } = create();
    expect(audio.status()).toEqual({ available: true, enabled: true, ready: false });
    expect(audio.play('action')).toBe(false);
    expect(factory).not.toHaveBeenCalled();
    await audio.unlock();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(audio.status().ready).toBe(true);
    expect(context.oscillators).toHaveLength(0);
    await audio.unlock();
    expect(context.resume).toHaveBeenCalledTimes(1);
  });

  it('generates distinct Rest and Action tones locally with a short smooth envelope', async () => {
    const { context, audio } = create();
    await audio.unlock();
    expect(audio.play('rest')).toBe(true);
    const rest = context.oscillators[0]!;
    const gain = context.gains[0]!;
    expect(rest.type).toBe('sine');
    expect(rest.frequency.setValueAtTime).toHaveBeenCalledWith(330, 4);
    expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0, 4);
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(1, 0.08, 4.012);
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenNthCalledWith(2, 0, 4.16);
    expect(rest.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith(context.destination);
    expect(rest.start).toHaveBeenCalledWith(4);
    expect(rest.stop).toHaveBeenCalledWith(4.18);

    expect(audio.play('action')).toBe(true);
    expect(context.oscillators[1]!.frequency.setValueAtTime).toHaveBeenCalledWith(660, 4);
    // A replacement cue cannot leave the previous tone sounding underneath it.
    expect(rest.disconnect).toHaveBeenCalledOnce();
    expect(gain.disconnect).toHaveBeenCalledOnce();
  });

  it('disconnects completed tones without retaining them until another phase', async () => {
    const { context, audio } = create();
    await audio.unlock();
    audio.play('action');
    const oscillator = context.oscillators[0]!;
    const gain = context.gains[0]!;
    oscillator.onended?.();
    expect(oscillator.onended).toBeNull();
    expect(oscillator.disconnect).toHaveBeenCalledOnce();
    expect(gain.disconnect).toHaveBeenCalledOnce();
    audio.stop();
    expect(oscillator.disconnect).toHaveBeenCalledOnce();
  });

  it('mute immediately cancels a tone and prevents audio unlock or later replay', async () => {
    const { context, audio } = create();
    audio.setEnabled(false);
    await audio.unlock();
    expect(context.resume).not.toHaveBeenCalled();
    expect(audio.play('rest')).toBe(false);
    audio.setEnabled(true);
    await audio.unlock();
    audio.play('action');
    audio.setEnabled(false);
    expect(audio.status().enabled).toBe(false);
    expect(context.gains[0]!.gain.cancelScheduledValues).toHaveBeenCalledWith(4);
    expect(context.gains[0]!.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 4);
    expect(context.oscillators[0]!.stop).toHaveBeenLastCalledWith();
    expect(context.oscillators[0]!.disconnect).toHaveBeenCalledOnce();
    expect(audio.play('rest')).toBe(false);
    audio.setEnabled(true);
    expect(context.oscillators).toHaveLength(1);
    expect(audio.play('rest')).toBe(true);
  });

  it('drops suspended cues without resuming from an automatic phase change', async () => {
    const { context, audio } = create();
    await audio.unlock();
    context.state = 'suspended';
    expect(audio.status().ready).toBe(false);
    expect(audio.play('action')).toBe(false);
    expect(context.resume).toHaveBeenCalledTimes(1);
    await audio.unlock();
    expect(context.resume).toHaveBeenCalledTimes(2);
    expect(context.oscillators).toHaveLength(0);
    expect(audio.play('rest')).toBe(true);
  });

  it('contains rejected or synchronous resume failures and allows an explicit retry', async () => {
    const { context, audio } = create();
    context.resume.mockRejectedValueOnce(new Error('Autoplay refused'));
    await expect(audio.unlock()).resolves.toBeUndefined();
    expect(audio.status().ready).toBe(false);
    expect(audio.play('action')).toBe(false);
    context.resume.mockImplementationOnce(() => { throw new Error('Unavailable device'); });
    await expect(audio.unlock()).resolves.toBeUndefined();
    await audio.unlock();
    expect(audio.status().ready).toBe(true);
    expect(context.oscillators).toHaveLength(0);
  });

  it('shares a pending unlock and never plays a cue when permission finishes later', async () => {
    const { context, audio } = create();
    const permission = deferred();
    context.resume.mockImplementation(() => permission.promise.then(() => { context.state = 'running'; }));
    const first = audio.unlock();
    expect(audio.unlock()).toBe(first);
    expect(audio.play('action')).toBe(false);
    permission.resolve();
    await first;
    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.oscillators).toHaveLength(0);
  });

  it('stop cancels and disconnects a sounding cue without scheduling another one', async () => {
    const { context, audio } = create();
    await audio.unlock();
    audio.play('rest');
    audio.stop();
    audio.stop();
    expect(context.oscillators).toHaveLength(1);
    expect(context.oscillators[0]!.disconnect).toHaveBeenCalledOnce();
    expect(context.gains[0]!.disconnect).toHaveBeenCalledOnce();
    expect(context.close).not.toHaveBeenCalled();
  });

  it('close releases a pending context and supports a fresh user unlock after remount', async () => {
    const oldContext = new FakeContext();
    const freshContext = new FakeContext();
    const oldPermission = deferred();
    const freshPermission = deferred();
    oldContext.resume.mockImplementation(() => oldPermission.promise);
    freshContext.resume.mockImplementation(() => freshPermission.promise.then(() => { freshContext.state = 'running'; }));
    const factory = vi.fn().mockReturnValueOnce(asContext(oldContext)).mockReturnValueOnce(asContext(freshContext));
    const audio = createCueAudio(factory);
    const oldUnlock = audio.unlock();
    audio.close();
    audio.close();
    expect(oldContext.close).toHaveBeenCalledOnce();
    expect(audio.status().ready).toBe(false);
    const freshUnlock = audio.unlock();
    oldPermission.resolve();
    await oldUnlock;
    expect(audio.unlock()).toBe(freshUnlock);
    expect(audio.play('action')).toBe(false);
    freshPermission.resolve();
    await freshUnlock;
    expect(oldContext.oscillators).toHaveLength(0);
    expect(freshContext.oscillators).toHaveLength(0);
    expect(audio.play('rest')).toBe(true);
    audio.close();
    expect(freshContext.close).toHaveBeenCalledOnce();
    expect(freshContext.oscillators[0]!.disconnect).toHaveBeenCalledOnce();
  });

  it('does not play when a pending unlock resolves after muting', async () => {
    const { context, audio } = create();
    const permission = deferred();
    context.resume.mockImplementation(() => permission.promise.then(() => { context.state = 'running'; }));
    const unlock = audio.unlock();
    audio.setEnabled(false);
    permission.resolve();
    await unlock;
    expect(audio.play('action')).toBe(false);
    audio.setEnabled(true);
    expect(context.oscillators).toHaveLength(0);
  });

  it('gracefully handles unsupported browsers and constructor failure without remote fallback', async () => {
    vi.stubGlobal('AudioContext', undefined);
    const missing = createCueAudio();
    expect(missing.status()).toEqual({ available: false, enabled: true, ready: false });
    await missing.unlock();
    expect(missing.play('rest')).toBe(false);
    missing.close();

    const factory = vi.fn(() => { throw new Error('Audio device unavailable'); });
    const failed = createCueAudio(factory);
    await expect(failed.unlock()).resolves.toBeUndefined();
    expect(failed.status().available).toBe(false);
    expect(failed.play('action')).toBe(false);
    failed.close();
  });

  it('contains node-creation and scheduling failures and releases partial resources', async () => {
    const { context, audio } = create();
    await audio.unlock();
    context.createGain.mockImplementationOnce(() => { throw new Error('Device disconnected'); });
    expect(audio.play('action')).toBe(false);
    expect(audio.status()).toEqual({ available: false, enabled: true, ready: false });
    expect(context.oscillators[0]!.disconnect).toHaveBeenCalledOnce();
    await audio.unlock();
    expect(audio.status().ready).toBe(true);

    const broken = new FakeOscillator();
    broken.start.mockImplementation(() => { throw new Error('Cannot start'); });
    context.createOscillator.mockReturnValueOnce(broken);
    expect(audio.play('rest')).toBe(false);
    expect(audio.status().ready).toBe(false);
    expect(broken.disconnect).toHaveBeenCalledOnce();
    expect(context.gains[0]!.disconnect).toHaveBeenCalledOnce();
    expect(audio.play('rest')).toBe(true);
    expect(audio.status().ready).toBe(true);
  });

  it('cleanup tolerates browser nodes and contexts that are already unavailable', async () => {
    const { context, audio } = create();
    await audio.unlock();
    audio.play('action');
    context.oscillators[0]!.stop.mockImplementation(() => { throw new Error('Ended'); });
    context.oscillators[0]!.disconnect.mockImplementation(() => { throw new Error('Disconnected'); });
    context.close.mockRejectedValueOnce(new Error('Already closed'));
    expect(() => audio.close()).not.toThrow();
    expect(context.gains[0]!.disconnect).toHaveBeenCalledOnce();
    expect(audio.status().ready).toBe(false);
    await Promise.resolve();
  });

  it('stops the oscillator even if its gain automation has already become invalid', async () => {
    const { context, audio } = create();
    await audio.unlock();
    audio.play('action');
    context.gains[0]!.gain.cancelScheduledValues.mockImplementation(() => { throw new Error('Disconnected'); });
    audio.stop();
    expect(context.oscillators[0]!.stop).toHaveBeenLastCalledWith();
    expect(context.oscillators[0]!.disconnect).toHaveBeenCalledOnce();
    expect(context.gains[0]!.disconnect).toHaveBeenCalledOnce();
  });
});
