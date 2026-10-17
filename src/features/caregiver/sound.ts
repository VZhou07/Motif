/** Optional alert sound. Nothing is created or played until the caregiver clicks Enable sound. */
export type SoundState = 'off' | 'on' | 'unavailable';

export interface SoundPort {
  readonly state: SoundState;
  /** Must be called from a click. Resolves true when sound is ready. */
  enable(): Promise<boolean>;
  disable(): void;
  chime(): void;
}

interface AudioContextLike {
  readonly currentTime: number;
  readonly destination: unknown;
  readonly state: string;
  resume(): Promise<void>;
  close(): Promise<void>;
  createOscillator(): { type: string; frequency: { value: number }; connect(node: unknown): void; start(at: number): void; stop(at: number): void };
  createGain(): { gain: { setValueAtTime(value: number, at: number): void; exponentialRampToValueAtTime(value: number, at: number): void }; connect(node: unknown): void };
}
type AudioContextFactory = new () => AudioContextLike;

export function createWebAudioSound(factory?: AudioContextFactory): SoundPort {
  const Factory = factory ?? (globalThis as unknown as { AudioContext?: AudioContextFactory }).AudioContext;
  let context: AudioContextLike | null = null;
  let state: SoundState = 'off';

  function tone(at: number, hertz: number): void {
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = hertz;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.12, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.25);
  }

  return {
    get state() { return state; },
    async enable() {
      if (!Factory) { state = 'unavailable'; return false; }
      try {
        context ??= new Factory();
        await context.resume();
        state = 'on';
        tone(context.currentTime, 660);
        return true;
      } catch {
        state = 'unavailable';
        context = null;
        return false;
      }
    },
    disable() {
      state = state === 'unavailable' ? state : 'off';
      const old = context;
      context = null;
      void old?.close().catch(() => {});
    },
    chime() {
      if (state !== 'on' || !context) return;
      try {
        const at = context.currentTime;
        tone(at, 880);
        tone(at + 0.28, 660);
      } catch { /* A failing speaker must never break the request list. */ }
    },
  };
}
