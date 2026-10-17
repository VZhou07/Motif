import { FEATURE_IDS, type FeatureFrame, type FeatureId } from '../domain/types';
import type { ProfileStore } from './profiles';
import { MotifSession } from './session';
import type { MovementChoice, SessionSnapshot, SpeechPort } from './types';

export type Values = Partial<Record<FeatureId, number>>;
export const REST: Values = {};
export const BROW: Values = { browOuterUpLeft: 0.7 };
export const MOUTH: Values = { jawOpen: 0.7 };
export const PUCKER: Values = { mouthPucker: 0.7 };
export const CHEEK: Values = { cheekPuff: 0.7 };
/** Everyday activity that avoids every test movement: small head turns only. */
export const HEAD_WOBBLE = (t: number): Values => ({ headYaw: 6 * Math.sin(t / 900) });

export function frameAt(timestampMs: number, overrides: Values = {}): FeatureFrame {
  return { timestampMs, tracking: 'tracked', values: {
    ...Object.fromEntries(FEATURE_IDS.map((id) => [id, id.startsWith('head') ? 0 : 0.1])), ...overrides,
  } };
}

/** Test-only driver: a fake clock plus a simulated person producing numeric frames. */
export class Harness {
  now = 1_000;
  readonly spoken: string[] = [];
  speechAvailable = true;
  readonly speech: SpeechPort = {
    status: () => ({ available: this.speechAvailable, voiceName: this.speechAvailable ? 'Local test voice' : null }),
    speak: (text) => { if (!this.speechAvailable) return false; this.spoken.push(text); return true; },
    cancel: () => {},
  };
  readonly session: MotifSession;
  stepMs = 50;

  constructor(options: { profiles?: ProfileStore } = {}) {
    this.session = new MotifSession({ speech: this.speech, clock: () => this.now, profiles: options.profiles });
  }

  get snap(): SessionSnapshot { return this.session.getSnapshot(); }

  step(values: Values = REST, tracking: FeatureFrame['tracking'] = 'tracked'): void {
    this.now += this.stepMs;
    this.session.ingest(tracking === 'tracked' ? frameAt(this.now, values) : { timestampMs: this.now, tracking, values: {} }, this.now);
    this.session.tick(this.now);
  }

  run(durationMs: number, values: Values | ((t: number) => Values) = REST): void {
    const end = this.now + durationMs;
    while (this.now < end) this.step(typeof values === 'function' ? values(this.now) : values);
  }

  /** Advance time with no frames at all (stalled camera), ticking the watchdog. */
  stall(durationMs: number): void {
    const end = this.now + durationMs;
    while (this.now < end) { this.now += this.stepMs; this.session.tick(this.now); }
  }

  /** Follows on-screen capture prompts with a human reaction delay until `done` or a time cap. */
  followPrompts(done: (snap: SessionSnapshot) => boolean, movement: Values | ((snap: SessionSnapshot) => Values) = BROW, reactionMs = 400, capMs = 120_000): void {
    const start = this.now;
    let prompt = this.snap.capture?.prompt;
    let since = this.now;
    while (!done(this.snap)) {
      if (this.now - start > capMs) throw new Error(`followPrompts timed out in stage ${this.snap.stage}`);
      const current = this.snap.capture?.prompt;
      if (current !== prompt) { prompt = current; since = this.now; }
      const elapsed = this.now - since;
      const moving = (current === 'Move' && elapsed >= reactionMs) || (current === 'Return to rest' && elapsed < reactionMs);
      this.step(moving ? (typeof movement === 'function' ? movement(this.snap) : movement) : REST);
    }
  }

  /**
   * Rests until the scan highlight has freshly reached `id` and the recognizer is armed,
   * then performs one held movement and returns to rest.
   */
  selectByGesture(id: string, movement: Values = BROW, capMs = 60_000, holdMs = 600, restMs = 600): void {
    const start = this.now;
    let highlighted = this.highlightedId();
    let since = this.now;
    for (;;) {
      if (this.now - start > capMs) throw new Error(`could not select ${id} in stage ${this.snap.stage}`);
      const current = this.highlightedId();
      if (current !== highlighted) { highlighted = current; since = this.now; }
      if (current === id && this.snap.runtime?.armed && this.now - since < 1_000) break;
      this.step(REST);
    }
    this.run(holdMs, movement);
    this.run(restMs, REST);
  }

  highlightedId(): string | undefined {
    const scan = this.snap.scan;
    return scan ? scan.targets[scan.index]?.id : undefined;
  }

  /** Step mode: rest to arm, use `next` until `id` is highlighted, then `select`. */
  stepTo(id: string, next: Values = MOUTH, select: Values = BROW): void {
    this.run(600);
    for (let guard = 0; this.highlightedId() !== id; guard += 1) {
      if (guard > 30) throw new Error(`could not step to ${id}`);
      this.run(600, next);
      this.run(600);
    }
    this.run(600, select);
    this.run(600);
  }

  /** From communication: add a movement via the scanned control and verify it (held-out, cross-checks, negative). */
  addMovement(choice: MovementChoice, movementFor: (label: string | null) => Values, everyday: (t: number) => Values = HEAD_WOBBLE): void {
    if (this.snap.scanMode === 'step') this.stepTo('add-movement'); else this.selectByGesture('add-movement');
    this.session.chooseMovement(choice);
    this.followPrompts((snap) => snap.stage === 'negative' || snap.stage === 'setup-failed', (snap) => movementFor(snap.capture?.movement ?? null));
    if (this.snap.stage === 'negative') this.run(11_000, everyday);
  }

  /** Camera on, rest check, chosen movement, training, held-out checks and negative window. */
  calibrate(movement: Values = BROW): void {
    this.session.setCamera('running');
    this.session.startBaseline();
    this.run(10_500);
    this.session.chooseMovement({ feature: 'browOuterUpLeft', direction: 1, label: 'Raise left outer eyebrow' });
    this.followPrompts((snap) => snap.stage === 'negative', movement);
    this.run(11_000, (t) => ({ jawOpen: 0.1 + 0.3 * Math.abs(Math.sin(t / 300)), headYaw: 6 * Math.sin(t / 900) }));
  }

  /** Full setup through comfort, mapping choice + approval and practice, all by gesture. */
  setUpToCommunication(): void {
    this.calibrate();
    this.selectByGesture('comfortable');
    this.selectByGesture('map:0');
    this.selectByGesture('approve-mapping');
    this.selectByGesture('finish-practice');
  }
}
