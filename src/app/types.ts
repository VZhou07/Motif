import type { Baseline, FeatureFrame, FeatureId, GestureModel, RuntimePhase, TrackingState } from '../domain/types';
import type { Mapping, MappingProposal, ScanMode } from './mapping';
import type { DiscoveryResult } from './discovery';
import type { MovementEvidence } from './scoring';
import type { TrainingDiagnostics } from '../engine/calibration';

export type Stage =
  | 'welcome' | 'baseline' | 'choose' | 'training' | 'verify' | 'negative'
  | 'setup-failed' | 'comfort' | 'mapping' | 'mapping-confirm' | 'practice' | 'communication' | 'recalibrate-confirm' | 'tiring'
  | 'discover' | 'discover-results';

export type CameraStatus = 'off' | 'loading' | 'running' | 'error';
/** `assisted` is the clearly labeled Space/mouse path; it never produces calibration evidence. */
export type InputMode = 'gesture' | 'assisted';
export type CapturePrompt = 'Rest' | 'Action' | 'Everyday activity' | 'Explore freely';

export interface CaptureStatus {
  kind: 'baseline' | 'training' | 'verification' | 'negative' | 'discovery';
  /** 1-based trial or attempt number. */
  index: number;
  total: number;
  prompt: CapturePrompt;
  phaseProgress: number;
  overallProgress: number;
  /** Remaining valid-frame time; the recorder owns the displayed countdown. */
  remainingMs: number;
  /** Preview only: the user acts on `prompt`, never this upcoming cue. */
  nextPrompt: CapturePrompt | null;
  /** Valid recorded milliseconds in the current recording or armed negative span. */
  validMs: number;
  interruptions: number;
  notice: string | null;
  /** The movement to perform in this training/check attempt, if any. */
  movement: string | null;
  feature: FeatureId | null;
  direction: 1 | -1 | null;
  modelId: string | null;
  /** Preparation only. Does not change the current recording's evidence/index. */
  nextMovement?: string | null;
  nextModelId?: string | null;
}

export interface AttemptEvidence {
  attempt: number; passed: boolean; eventCount: number; validDurationMs: number; reasons: string[];
  /** Movement expected in this attempt; cross-checks confirm an existing movement still works with the new one. */
  expected: string; kind: 'held-out' | 'cross-check' | 'recheck';
  /** Model id of the expected movement (labels can repeat). */
  expectedId: string;
}
export interface NegativeEvidence { passed: boolean; eventCount: number; validDurationMs: number; restarts: number; reasons: string[] }
export interface CycleEvidence {
  cycle: number;
  movement: string;
  training: { ok: boolean; reasons: string[] } | null;
  heldOut: AttemptEvidence[];
  negative: NegativeEvidence | null;
  outcome: 'in-progress' | 'verified' | 'failed' | 'approved' | 'rejected' | 'cancelled';
  /** `restored`: frozen models from a saved profile, re-checked without any fitting (R7). */
  source: 'trained' | 'restored';
  /** Ids of every model the held-out/re-check attempts and negative window were run on, once verified. */
  verifiedIds: string[];
  profile?: string;
  /** Restored without movement re-checks: only today's rest was compared with the saved thresholds. */
  quick?: boolean;
}

export type FailureKind = 'baseline' | 'training' | 'verification' | 'negative' | 'rejected' | 'cancelled' | 'profile-mismatch' | 'discovery';
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
  /** Compact evidence from actual fitting; retained after failure, never persisted. */
  calibrationReport: TrainingDiagnostics | null;
  /** Frozen expected model for overlay after failure; never used for control or storage. */
  diagnosticModel: GestureModel | null;
  candidate: GestureModel | null;
  /** The select gesture of the approved set (or the first approved gesture). */
  approvedModel: GestureModel | null;
  /** Every approved, verified gesture; all are observed for ambiguity, only mapped ones act. */
  approvedModels: GestureModel[];
  mapping: Mapping | null;
  mappingLabel: string | null;
  /** Mapping waiting for explicit approval in `mapping-confirm`. */
  pendingMapping: MappingProposal | null;
  scanMode: ScanMode;
  /** True after the step-mode idle fail-safe switched to automatic scanning. */
  stepFallback: boolean;
  adding: boolean;
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
  profiles: ProfilesView;
  /** Per-movement observations (counts with denominators) for approved movements and any in setup (R8). */
  evidence: MovementEvidence[];
  /** Free-exploration results in `discover-results`: candidates only, never models (R9). */
  discovery: DiscoveryResult | null;
  /** Movements the mapping stages choose controls for (approved set, a candidate being added, or a restored set). */
  setupModels: GestureModel[];
  /** The recommended proposal in `mapping`, with plain reasons. */
  recommendation: { id: string; reasons: string[] } | null;
  /** On the first-movement comfort screen: what Approve will turn on (null elsewhere). */
  comfortPreview: { label: string; mode: 'auto' | 'step' } | null;
  /** Name of the saved profile being re-checked; nothing is armed until its controls are approved. */
  restoring: string | null;
}

export interface ProfilesView {
  names: string[];
  rejected: number;
  available: boolean;
  readable: boolean;
  /** The saved profile the approved setup came from or was last saved as. */
  active: string | null;
  /** True when the approved setup differs from what was last saved (or was never saved). */
  unsaved: boolean;
  /** True when the saved setup includes resting numbers (legacy saves may not). */
  hasBaseline: boolean;
}

export interface SpeechPort {
  status(): { available: boolean; voiceName: string | null };
  /** Returns false when no local voice is available; never falls back to a remote voice. */
  speak(text: string): boolean;
  cancel(): void;
}

export const STARTER_PHRASES = ['Yes', 'No', 'I need water', 'Please help me', 'I am uncomfortable', 'Thank you'];
