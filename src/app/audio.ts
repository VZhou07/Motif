export type CueTone = 'rest' | 'action';

export interface CueAudioStatus {
  available: boolean;
  enabled: boolean;
  /** The local audio context is running; this does not establish audible output. */
  ready: boolean;
}

export interface CueAudio {
  status(): CueAudioStatus;
  /** Call from an explicit user interaction, never a detected movement. */
  unlock(): Promise<void>;
  /** An unavailable or suspended cue is dropped, never queued for later. */
  play(tone: CueTone): boolean;
  setEnabled(enabled: boolean): void;
  stop(): void;
  /** Releases resources; a later explicit unlock may create a new context. */
  close(): void;
}

type ContextFactory = () => AudioContext;
interface ActiveTone { oscillator: OscillatorNode; gain: GainNode }

/** Local oscillator cues; no audio assets, speech voices or network are needed. */
export function createCueAudio(factory?: ContextFactory | null): CueAudio {
  const createContext = factory === undefined
    ? typeof globalThis.AudioContext === 'function' ? () => new globalThis.AudioContext() : null
    : factory;
  let available = createContext !== null;
  let enabled = true;
  let context: AudioContext | null = null;
  let unlocking: { context: AudioContext; promise: Promise<void> } | null = null;
  const active = new Set<ActiveTone>();

  const release = (tone: ActiveTone): void => {
    if (!active.delete(tone)) return;
    tone.oscillator.onended = null;
    try { tone.oscillator.disconnect(); } catch { /* Resource already released. */ }
    try { tone.gain.disconnect(); } catch { /* Resource already released. */ }
  };

  const stop = (): void => {
    for (const tone of active) {
      try {
        const now = context?.currentTime ?? 0;
        tone.gain.gain.cancelScheduledValues(now);
        tone.gain.gain.setValueAtTime(0, now);
      } catch { /* An unavailable gain must not prevent stopping its oscillator. */ }
      try { tone.oscillator.stop(); } catch { /* Already ended. */ }
      release(tone);
    }
  };

  const unlock = (): Promise<void> => {
    if (!enabled || !createContext) return Promise.resolve();
    if (!context || context.state === 'closed') {
      try {
        context = createContext();
        available = true;
      } catch {
        available = false;
        return Promise.resolve();
      }
    }
    const target = context;
    if (target.state === 'running') {
      available = true;
      return Promise.resolve();
    }
    if (unlocking?.context === target) return unlocking.promise;
    // resume() is invoked in the user event stack. Completion never plays a cue,
    // including when mute, close or unmount happened while permission was pending.
    let resume: Promise<void>;
    try { resume = target.resume(); }
    catch { return Promise.resolve(); }
    const promise = Promise.resolve(resume).catch(() => {}).then(() => {
      if (unlocking?.context === target) unlocking = null;
    });
    unlocking = { context: target, promise };
    return promise;
  };

  return {
    status: () => ({ available, enabled, ready: available && context?.state === 'running' }),
    unlock,
    play(tone: CueTone): boolean {
      if (!enabled || context?.state !== 'running') return false;
      stop();
      let oscillator: OscillatorNode | null = null;
      let gain: GainNode | null = null;
      let node: ActiveTone | null = null;
      try {
        oscillator = context.createOscillator();
        gain = context.createGain();
        node = { oscillator, gain };
        const activeNode = node;
        active.add(node);
        oscillator.onended = () => release(activeNode);
        oscillator.type = 'sine';
        const now = context.currentTime;
        oscillator.frequency.setValueAtTime(tone === 'action' ? 660 : 330, now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 0.012);
        gain.gain.linearRampToValueAtTime(0, now + 0.16);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + 0.18);
        available = true;
        return true;
      } catch {
        available = false;
        if (oscillator) {
          try { oscillator.stop(); } catch { /* A failed start has nothing to stop. */ }
          if (node) release(node);
          else {
            try { oscillator.disconnect(); } catch { /* Resource already released. */ }
          }
        }
        // A partial browser audio failure must not fail calibration.
        stop();
        return false;
      }
    },
    setEnabled(value: boolean): void {
      enabled = value;
      if (!enabled) stop();
    },
    stop,
    close(): void {
      stop();
      const previous = context;
      context = null;
      unlocking = null;
      if (previous && previous.state !== 'closed') {
        try { void previous.close().catch(() => {}); } catch { /* Closing is best effort. */ }
      }
    },
  };
}
