import type { Baseline, FeatureFrame, GestureModel, Result, TrainingTrial, VerificationResult } from '../domain/types';
import { fitBaseline } from '../engine/calibration';
import { GestureRuntime } from '../engine/recognition';
import { evaluateNegativeWindow } from '../engine/verification';
import type { CapturePrompt } from './types';

/** Each visible Rest/Action lasts five valid-frame seconds. Adjacent attempts share only Rest. */
export const CAPTURE_TIMING = { baselineMs: 10_000, restMs: 5_000, moveMs: 5_000, returnMs: 5_000, negativeMs: 10_000 } as const;

export type RecorderUpdate<T> =
  | { kind: 'progress' }
  /** The current recording was discarded; it restarts at the next valid frame and never counts. */
  | { kind: 'interrupted'; reason: string }
  | { kind: 'complete'; value: T };

const TRACKING_LOST = 'Tracking was interrupted, so this recording does not count. It restarts from rest.';

/** Collects ten seconds of contiguous valid processed frames; any interruption restarts the window. */
export class BaselineRecorder {
  private frames: FeatureFrame[] = [];
  interruptions = 0;

  constructor(private readonly durationMs: number = CAPTURE_TIMING.baselineMs) {}

  get elapsedMs(): number {
    return this.frames.length ? this.frames[this.frames.length - 1]!.timestampMs - this.frames[0]!.timestampMs : 0;
  }

  get progress(): number { return Math.min(1, this.elapsedMs / this.durationMs); }

  push(frame: FeatureFrame): RecorderUpdate<Result<Baseline>> {
    if (frame.tracking !== 'tracked') {
      if (!this.frames.length) return { kind: 'progress' };
      this.frames = [];
      this.interruptions += 1;
      return { kind: 'interrupted', reason: TRACKING_LOST };
    }
    this.frames.push(frame);
    if (this.elapsedMs < this.durationMs) return { kind: 'progress' };
    const result = fitBaseline(this.frames, this.durationMs);
    this.frames = [];
    return { kind: 'complete', value: result };
  }
}

export interface TrialStatus {
  prompt: CapturePrompt;
  phaseProgress: number;
  overallProgress: number;
  elapsedMs: number;
  remainingMs: number;
  nextPrompt: CapturePrompt | null;
}

/**
 * Alternates Rest/Action. A completed trailing Rest is the next leading Rest,
 * so there is never an extra five-second rest between attempts.
 */
export class TrialRecorder {
  private frames: FeatureFrame[] = [];
  private startedAt: number | null = null;
  interruptions = 0;
  readonly totalMs = CAPTURE_TIMING.restMs + CAPTURE_TIMING.moveMs + CAPTURE_TIMING.returnMs;

  status(): TrialStatus {
    const { restMs, moveMs, returnMs } = CAPTURE_TIMING;
    const elapsedMs = this.frames.length && this.startedAt !== null ? this.frames[this.frames.length - 1]!.timestampMs - this.startedAt : 0;
    const overallProgress = Math.min(1, elapsedMs / this.totalMs);
    if (elapsedMs < restMs) return { prompt: 'Rest', phaseProgress: elapsedMs / restMs, overallProgress, elapsedMs,
      remainingMs: restMs - elapsedMs, nextPrompt: 'Action' };
    if (elapsedMs < restMs + moveMs) return { prompt: 'Action', phaseProgress: (elapsedMs - restMs) / moveMs, overallProgress, elapsedMs,
      remainingMs: restMs + moveMs - elapsedMs, nextPrompt: 'Rest' };
    return { prompt: 'Rest', phaseProgress: Math.min(1, (elapsedMs - restMs - moveMs) / returnMs), overallProgress, elapsedMs,
      remainingMs: Math.max(0, this.totalMs - elapsedMs), nextPrompt: 'Action' };
  }

  push(frame: FeatureFrame): RecorderUpdate<{ trial: TrainingTrial; frames: FeatureFrame[] }> {
    if (frame.tracking !== 'tracked') {
      if (!this.frames.length) return { kind: 'progress' };
      this.frames = [];
      this.startedAt = null;
      this.interruptions += 1;
      return { kind: 'interrupted', reason: TRACKING_LOST };
    }
    this.frames.push(frame);
    this.startedAt ??= frame.timestampMs;
    const start = this.startedAt;
    if (frame.timestampMs - start < this.totalMs) return { kind: 'progress' };
    const { restMs, moveMs } = CAPTURE_TIMING;
    // The boundary frame starts the next Action; exclude it from the finished
    // attempt. Carry only neutral evidence, never a previous movement window.
    const frames = this.frames.filter((item) => item.timestampMs - start < this.totalMs);
    const restAfter = frames.filter((item) => item.timestampMs - start >= restMs + moveMs);
    this.frames = [...restAfter, frame];
    // Keep the scheduled boundary, not the first sample after it. Otherwise
    // frame jitter gradually lengthens Rest and mislabels a boundary sample.
    this.startedAt = start + restMs + moveMs;
    return {
      kind: 'complete',
      value: {
        frames,
        trial: {
          restBefore: frames.filter((item) => item.timestampMs - start < restMs),
          movement: frames.filter((item) => item.timestampMs - start >= restMs && item.timestampMs - start < restMs + moveMs),
          restAfter,
        },
      },
    };
  }
}

/**
 * Live negative-window monitor. Its segment, arming rule and interruption rule mirror
 * `evaluateNegativeWindow`, which stays authoritative for a pass (R5 B1).
 */
export class NegativeMonitor {
  private runtime: GestureRuntime;
  private segment: FeatureFrame[] = [];
  private armedAt: number | undefined;
  restarts = 0;
  lastReasons: string[] = [];

  constructor(private readonly models: readonly GestureModel[], private readonly minimumMs: number = CAPTURE_TIMING.negativeMs) {
    this.runtime = new GestureRuntime(models);
  }

  get armed(): boolean { return this.armedAt !== undefined; }

  get armedMs(): number {
    if (this.armedAt === undefined || !this.segment.length) return 0;
    return this.segment[this.segment.length - 1]!.timestampMs - this.armedAt;
  }

  private restart(reason: string): RecorderUpdate<VerificationResult> {
    const hadEvidence = this.segment.length > 0;
    this.runtime = new GestureRuntime(this.models);
    this.segment = [];
    this.armedAt = undefined;
    if (!hadEvidence) return { kind: 'progress' };
    this.restarts += 1;
    this.lastReasons = [reason];
    return { kind: 'interrupted', reason };
  }

  push(frame: FeatureFrame): RecorderUpdate<VerificationResult> {
    if (frame.tracking !== 'tracked') return this.restart('Tracking was interrupted; the check restarts from rest.');
    const update = this.runtime.step(frame);
    if (update.event) {
      // An observed activation is a failure on its own; no duration can offset it.
      return { kind: 'complete', value: { passed: false, eventCount: 1, validDurationMs: this.armedMs, events: [update.event],
        reasons: ['An accidental activation occurred during ordinary activity.'] } };
    }
    if (this.armedAt !== undefined && (update.phase === 'unarmed' || update.phase === 'neutral')) {
      // Same condition the evaluator treats as an interruption. Drop this frame and restart.
      return this.restart(update.cancelled
        ? 'A brief movement began an activation but did not complete. Nothing was selected; the check restarted.'
        : 'Recognition paused after arming (for example an opposite or combined movement). Nothing was selected; the check restarted.');
    }
    this.segment.push(frame);
    if (this.armedAt === undefined && update.armed && update.neutral) this.armedAt = frame.timestampMs;
    if (this.armedAt !== undefined && frame.timestampMs - this.armedAt >= this.minimumMs) {
      const result = evaluateNegativeWindow(this.models, this.segment, this.minimumMs);
      if (result.passed) return { kind: 'complete', value: result };
      // Never pass on the live view alone; keep collecting and surface the evaluator's reasons.
      this.lastReasons = result.reasons;
    }
    return { kind: 'progress' };
  }
}
