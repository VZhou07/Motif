import type { Baseline, FeatureFrame, FeatureId, GestureModel, RuntimePhase, TrackingState } from '../domain/types';

export type Stage =
  | 'welcome' | 'baseline' | 'choose' | 'training' | 'verify' | 'negative'
  | 'setup-failed' | 'comfort' | 'mapping' | 'practice' | 'communication' | 'recalibrate-confirm';

export type CameraStatus = 'off' | 'loading' | 'running' | 'error';
/** `assisted` is the clearly labeled Space/mouse path; it never produces calibration evidence. */
export type InputMode = 'gesture' | 'assisted';
export type CapturePrompt = 'Rest' | 'Move' | 'Return to rest' | 'Everyday activity';

export interface CaptureStatus {
  kind: 'baseline' | 'training' | 'verification' | 'negative';
  /** 1-based trial or attempt number. */
  index: number;
  total: number;
  prompt: CapturePrompt;
  phaseProgress: number;
  overallProgress: number;
  /** Valid recorded milliseconds in the current recording or armed negative span. */
  validMs: number;
  interruptions: number;
  notice: string | null;
}

export interface AttemptEvidence { attempt: number; passed: boolean; eventCount: number; validDurationMs: number; reasons: string[] }
export interface NegativeEvidence { passed: boolean; eventCount: number; validDurationMs: number; restarts: number; reasons: string[] }
export interface CycleEvidence {
  cycle: number;
  movement: string;
  training: { ok: boolean; reasons: string[] } | null;
  heldOut: AttemptEvidence[];
  negative: NegativeEvidence | null;
  outcome: 'in-progress' | 'verified' | 'failed' | 'approved' | 'rejected' | 'cancelled';
}

export type FailureKind = 'baseline' | 'training' | 'verification' | 'negative' | 'rejected' | 'cancelled';
export interface Failure { kind: FailureKind; title: string; reasons: string[] }

export interface ScanTarget { id: string; label: string; kind: 'phrase' | 'control' | 'decision' }
export interface ScanView {
  targets: ScanTarget[];
  index: number;
  latched: string | null;
  paused: boolean;
  suspended: boolean;
  intervalMs: number;
  /** Which input drives this scanner: a verified gesture model, assisted Space, or nothing yet. */
  driver: 'gesture' | 'assisted' | 'none';
}

export interface MovementChoice { feature: FeatureId; direction: 1 | -1; label: string }

export interface SessionSnapshot {
  stage: Stage;
  camera: CameraStatus;
  cameraMessage: string | null;
  tracking: TrackingState | 'none';
  /** Latest processed numeric frame for the dashboard; never images. */
  frame: FeatureFrame | null;
  frameIntervalMs: number | null;
  hidden: boolean;
  baseline: Baseline | null;
  choice: MovementChoice | null;
  candidate: GestureModel | null;
  approvedModel: GestureModel | null;
  inputMode: InputMode;
  recalibrating: boolean;
  capture: CaptureStatus | null;
  cycles: CycleEvidence[];
  failure: Failure | null;
  /** Setup decisions currently offered; each is both scanned (when a model exists) and a button. */
  decisions: ScanTarget[];
  scan: ScanView | null;
  runtime: { phase: RuntimePhase; armed: boolean; neutral: boolean } | null;
  phrases: string[];
  message: string[];
  lastSpoken: string | null;
  speech: { available: boolean; voiceName: string | null };
  spokenPrompts: boolean;
  practice: { selections: number; last: string | null };
  /** Text for the polite live region: prompts, notices, and selections only. */
  announcement: string;
}

export interface SpeechPort {
  status(): { available: boolean; voiceName: string | null };
  /** Returns false when no local voice is available; never falls back to a remote voice. */
  speak(text: string): boolean;
  cancel(): void;
}

export const STARTER_PHRASES = ['Yes', 'No', 'I need water', 'Please help me', 'I am uncomfortable', 'Thank you'];
