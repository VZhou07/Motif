import { describe, expect, it, vi } from 'vitest';
import { createWebAudioSound } from './sound';

function fakeAudio() {
  const created: FakeContext[] = [];
  class FakeContext {
    currentTime = 10;
    destination = {};
    state = 'suspended';
    oscillators = 0;
    closed = false;
    constructor() { created.push(this); }
    resume = vi.fn(async () => { this.state = 'running'; });
    close = vi.fn(async () => { this.closed = true; });
    createOscillator() {
      this.oscillators += 1;
      return { type: '', frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    }
    createGain() { return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() }; }
  }
  return { FakeContext, created };
}

describe('web audio sound', () => {
  it('creates no audio context and plays nothing until enable() is called', () => {
    const { FakeContext, created } = fakeAudio();
    const sound = createWebAudioSound(FakeContext);
    sound.chime();
    expect(created).toHaveLength(0);
    expect(sound.state).toBe('off');
  });

  it('enable() resumes the context, confirms with one tone, and chime() then plays two tones', async () => {
    const { FakeContext, created } = fakeAudio();
    const sound = createWebAudioSound(FakeContext);
    await expect(sound.enable()).resolves.toBe(true);
    expect(sound.state).toBe('on');
    expect(created[0]!.resume).toHaveBeenCalled();
    expect(created[0]!.oscillators).toBe(1);
    sound.chime();
    expect(created[0]!.oscillators).toBe(3);
  });

  it('disable() closes the context and silences chimes', async () => {
    const { FakeContext, created } = fakeAudio();
    const sound = createWebAudioSound(FakeContext);
    await sound.enable();
    sound.disable();
    expect(created[0]!.closed).toBe(true);
    expect(sound.state).toBe('off');
    sound.chime();
    expect(created[0]!.oscillators).toBe(1);
  });

  it('reports unavailable when the browser has no audio or it fails to start', async () => {
    const none = createWebAudioSound(undefined);
    expect(await none.enable()).toBe(false);
    expect(none.state).toBe('unavailable');
    class Broken { constructor() { throw new Error('blocked'); } }
    const broken = createWebAudioSound(Broken as never);
    expect(await broken.enable()).toBe(false);
    expect(broken.state).toBe('unavailable');
    broken.chime();
  });

  it('a throwing speaker never propagates from chime()', async () => {
    const { FakeContext } = fakeAudio();
    const sound = createWebAudioSound(FakeContext);
    await sound.enable();
    vi.spyOn(FakeContext.prototype, 'createOscillator').mockImplementation(() => { throw new Error('boom'); });
    expect(() => sound.chime()).not.toThrow();
  });
});
