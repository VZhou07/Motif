import type { Baseline, FeatureFrame, GestureModel, Result, TrackingState, TrainingTrial } from '../domain/types';
import { fitGesture, type TrainingDiagnostics } from '../engine/calibration';
import type { CueAudio } from './audio';
import { FeatureProcessor, MAX_FRAME_GAP_MS } from '../engine/features';
import { GestureRuntime } from '../engine/recognition';
import { ScanController } from '../engine/scanner';
import { evaluatePositiveAttempt, type ActionWindow } from '../engine/verification';
import { BaselineRecorder, CAPTURE_TIMING, NegativeMonitor, TrialRecorder } from './capture';
import { describeMapping, MAX_GESTURES, proposeMappings, sameMapping, validateMapping, type Mapping, type MappingProposal, type ScanMode } from './mapping';
import { discoverCandidates, DISCOVERY, type Channel, type DiscoveryResult } from './discovery';
import { movementEvidence, recommendMapping, type Effort, type MovementNotes, type MovementUse } from './scoring';
import { applyEdit, defaultVocabulary, type Vocabulary, type VocabularyEdit } from './vocabulary';
import { buildProfile, createMemoryProfileStore, type ProfileList, type ProfileStore, type StoredProfile, type StoreResult, sameName } from './profiles';
import {
  type CameraStatus, type CapturePrompt, type CaptureStatus, type CycleEvidence, type Failure, type FailureKind,
  type InputMode, type MovementChoice, type ProfilesView, type ScanTarget, type SessionSnapshot, type SpeechPort, type Stage,
} from './types';

export const SESSION_LIMITS = {
  trainingTrials: 3,
  heldOutAttempts: 2,
  /** The fifth tracking interruption in one capture stage fails it honestly (R5). */
  maxInterruptions: 5,
  baselineCapMs: 60_000,
  negativeCapMs: 60_000,
  scanDefaultMs: 2_000,
  scanMinMs: 1_000,
  scanMaxMs: 6_000,
  scanStepMs: 500,
  /** Step mode with no gesture event for this much valid tracking reverts to automatic scanning (R6 B2). */
  stepIdleMs: 60_000,
} as const;

export const DECISION_LABELS = {
  comfortable: 'Yes, comfortable and easy',
  'comfortable-effort': 'Comfortable, but it takes effort',
  'record-again': 'Record this movement again',
  'another-movement': 'Choose another movement',
  'keep-current': 'Keep current setup',
  reject: 'Do not use this movement',
  'choose-different': 'Choose different controls',
  'approve-mapping': 'Approve these controls',
  'use-previous': 'Use previous controls',
  'start-recalibration': 'Start recalibration',
  'same-movement': 'Use the same movement again',
  'restart-recalibration': 'Restart recalibration',
  'reject-profile': 'Do not use this profile',
  'never-mind': 'Never mind',
  discover: 'Find my movements',
  'discover-again': 'Look again',
  'full-list': 'Choose from the full list',
} as const;
export type DecisionId = keyof typeof DECISION_LABELS;

const CONTROL_LABELS: Record<string, string> = {
  speak: 'Speak message', clear: 'Clear message', pause: 'Pause', slower: 'Slower scanning', faster: 'Faster scanning',
  practice: 'Practice', recalibrate: 'Recalibrate', 'finish-practice': 'Finish practice',
  'setup-gesture': 'Set up a movement', 'use-gesture': 'Use my movement',
  'change-controls': 'Change controls', 'add-movement': 'Add a movement', tiring: 'A movement is tiring',
};

const silentSpeech: SpeechPort = { status: () => ({ available: false, voiceName: null }), speak: () => false, cancel: () => {} };
const CAPTURE_STAGES: readonly Stage[] = ['baseline', 'training', 'verify', 'negative', 'discover'];

/** Live captures always pass a window so shared Rest is not judged by the first frame. */
function actionWindowOf(trial: TrainingTrial): ActionWindow {
  return { startMs: trial.movement[0]?.timestampMs ?? Number.NaN, endMs: trial.restAfter[0]?.timestampMs ?? Number.NaN };
}

export interface SessionOptions { speech?: SpeechPort; clock?: () => number; profiles?: ProfileStore; cues?: Pick<CueAudio, 'play' | 'stop'> }

/**
 * Browser-independent orchestrator (R5). React renders `getSnapshot()` and forwards input.
 * All recognition flows through one FeatureProcessor; every stage change resets it,
 * drops the gesture runtime and scanner latch, and therefore requires fresh neutral.
 */
export class MotifSession {
  private readonly speech: SpeechPort;
  private readonly clock: () => number;
  private readonly store: ProfileStore;
  private cues: Pick<CueAudio, 'play' | 'stop'> | null = null;
  private profileList: ProfileList = { profiles: [], rejected: 0, available: true, readable: true };
  private activeProfile: string | null = null;
  private activeSignature: string | null = null;
  /** A saved profile being re-checked (R7). Its models never act until its controls are approved. */
  private restoring: { profile: StoredProfile; models: GestureModel[] } | null = null;
  private readonly processor = new FeatureProcessor();
  private readonly listeners = new Set<() => void>();
  private snap!: SessionSnapshot;

  private stage: Stage = 'welcome';
  private camera: CameraStatus = 'off';
  private cameraMessage: string | null = null;
  private tracking: TrackingState | 'none' = 'none';
  private frame: FeatureFrame | null = null;
  private frameIntervalMs: number | null = null;
  private lastRawTimestamp: number | undefined;
  private lastValidNow: number | undefined;
  private stalled = false;
  private hidden = false;

  private baseline: Baseline | null = null;
  private approvedBaseline: Baseline | null = null;
  private choice: MovementChoice | null = null;
  private calibrationReport: TrainingDiagnostics | null = null;
  /** Overlay-only copy; never enters mappingSet, runtime, approval, or profiles. */
  private diagnosticModel: GestureModel | null = null;
  private candidate: GestureModel | null = null;
  private approvedModels: GestureModel[] = [];
  private mapping: Mapping | null = null;
  private previousMapping: Mapping | null = null;
  private pendingMapping: MappingProposal | null = null;
  /** Proposals offered in the current `mapping` stage, computed once on entry (R8). */
  private proposals: MappingProposal[] = [];
  private recommendation: { id: string; reasons: string[] } | null = null;
  /** Self-reported effort and tiring reports, and observed use, per model id (R8). */
  private notes: Record<string, MovementNotes> = {};
  /** Free-exploration frames, held only until analysed (R9); then only candidate summaries remain. */
  private discoverSegments: FeatureFrame[][] = [];
  private discoverValidMs = 0;
  private discovery: DiscoveryResult | null = null;
  private use: Record<string, MovementUse> = {};
  /** True while a new movement is being added to an existing approved set. */
  private adding = false;
  private stepFallback = false;
  /** Expected gesture id for each verification attempt: held-out attempts, then cross-checks. */
  private verifyPlan: string[] = [];
  private idleValidMs = 0;
  private lastScanFrameTimestamp: number | undefined;
  private inputMode: InputMode = 'gesture';
  private recalibrating = false;
  private cycles: CycleEvidence[] = [];
  private failure: Failure | null = null;
  private vocabulary: Vocabulary = defaultVocabulary();
  private message: string[] = [];
  private lastSpoken: string | null = null;
  private spokenPrompts = false;
  private practice = { selections: 0, last: null as string | null };
  private announcement = '';

  private baselineRecorder: BaselineRecorder | null = null;
  private trialRecorder: TrialRecorder | null = null;
  private negativeMonitor: NegativeMonitor | null = null;
  private trials: TrainingTrial[] = [];
  private stageInterruptions = 0;
  private stageValidMs = 0;
  private lastValidTimestamp: number | undefined;
  private notice: string | null = null;
  private lastPrompt: CapturePrompt | null = null;

  private scanner: ScanController | null = null;
  private scanTargets: ScanTarget[] = [];
  private runtime: GestureRuntime | null = null;
  private scanDriver: 'gesture' | 'assisted' | 'none' = 'none';
  private intervalMs: number = SESSION_LIMITS.scanDefaultMs;

  constructor(options: SessionOptions = {}) {
    this.speech = options.speech ?? silentSpeech;
    this.clock = options.clock ?? (() => performance.now());
    this.store = options.profiles ?? createMemoryProfileStore();
    this.cues = options.cues ?? null;
    this.refreshProfiles();
    this.publish();
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  readonly getSnapshot = (): SessionSnapshot => this.snap;

  /** Republish after an external status change (for example, voices finished loading). */
  refresh(): void { this.publish(); }

  /** Connect local tones without tying numerical/session logic to Web Audio. */
  setCueAudio(cues: Pick<CueAudio, 'play' | 'stop'> | null): void {
    if (this.cues !== cues) this.cues?.stop();
    this.cues = cues;
  }

  // ── Gesture set helpers (R6) ─────────────────────────────────────────────

  private get hasApproved(): boolean { return this.approvedModels.length > 0 && this.mapping !== null; }

  /** Models being verified or mapped: approved + candidate when adding, the candidate alone otherwise. */
  private mappingSet(): GestureModel[] {
    if (this.restoring) return this.restoring.models;
    if (!this.candidate) return this.approvedModels;
    return this.adding ? [...this.approvedModels, this.candidate] : [this.candidate];
  }

  private selectModel(): GestureModel | null {
    return this.approvedModels.find((model) => this.mapping?.assignments[model.id] === 'select') ?? this.approvedModels[0] ?? null;
  }

  private scanMode(): ScanMode {
    return this.mapping?.mode === 'step' && !this.stepFallback ? 'step' : 'auto';
  }

  private labelOf(id: string): string {
    return [...this.mappingSet(), ...this.approvedModels].find((model) => model.id === id)?.label ?? 'your movement';
  }

  // ── Inputs ────────────────────────────────────────────────────────────────

  /** Tracker frames. Stale, hidden-tab, or invalid input is converted to a fail-closed frame. */
  ingest(raw: FeatureFrame, nowMs: number = this.clock()): void {
    if (raw.tracking === 'tracked' && this.lastRawTimestamp !== undefined && raw.timestampMs > this.lastRawTimestamp) {
      this.frameIntervalMs = raw.timestampMs - this.lastRawTimestamp;
    }
    this.lastRawTimestamp = raw.timestampMs;
    const stale = !Number.isFinite(raw.timestampMs) || nowMs - raw.timestampMs > MAX_FRAME_GAP_MS || raw.timestampMs > nowMs;
    const input: FeatureFrame = this.hidden || stale || this.camera !== 'running'
      ? { timestampMs: raw.timestampMs, tracking: 'stale', values: {} } : raw;
    const frame = this.processor.process(input);
    this.tracking = frame.tracking;
    this.frame = frame;
    if (frame.tracking === 'tracked') {
      this.lastValidNow = nowMs;
      this.stalled = false;
    }
    this.route(frame, nowMs);
    this.publish();
  }

  /** Scan timing and the stalled-input watchdog. Never applies catch-up selections. */
  tick(nowMs: number = this.clock()): void {
    let changed = false;
    if (this.camera === 'running' && !this.stalled && this.lastValidNow !== undefined && nowMs - this.lastValidNow > MAX_FRAME_GAP_MS) {
      this.stalled = true;
      this.failClosed(nowMs, 'stale');
      changed = true;
    }
    if (this.scanner && !this.isStepping()) {
      const before = this.scanner.snapshot.index;
      this.scanner.tick(nowMs);
      changed ||= this.scanner.snapshot.index !== before;
    }
    if (changed) this.publish();
  }

  setHidden(hidden: boolean, nowMs: number = this.clock()): void {
    if (this.hidden === hidden) return;
    this.hidden = hidden;
    if (hidden) { this.cues?.stop(); this.failClosed(nowMs, 'stale'); }
    if (this.scanner && this.scanDriver === 'assisted') this.scanner.setSuspended(hidden, nowMs);
    this.publish();
  }

  setCamera(status: CameraStatus, message: string | null = null): void {
    const nowMs = this.clock();
    this.camera = status;
    this.cameraMessage = message;
    if (status !== 'running') {
      this.cues?.stop();
      this.lastValidNow = undefined;
      this.failClosed(nowMs, 'invalid');
    }
    this.publish();
  }

  private failClosed(nowMs: number, tracking: TrackingState): void {
    const frame = this.processor.process({ timestampMs: nowMs, tracking, values: {} });
    this.tracking = frame.tracking;
    this.frame = frame;
    this.route(frame, nowMs);
  }

  private route(frame: FeatureFrame, nowMs: number): void {
    switch (this.stage) {
      case 'baseline': this.captureBaseline(frame); break;
      case 'training':
      case 'verify': this.captureTrial(frame); break;
      case 'negative': this.captureNegative(frame); break;
      case 'discover': this.captureDiscovery(frame); break;
      default: this.driveScanner(frame, nowMs);
    }
  }

  // ── Timed capture (valid-frame time only; no communication is possible here) ─────────

  private accumulateValid(frame: FeatureFrame): void {
    if (frame.tracking !== 'tracked') { this.lastValidTimestamp = undefined; return; }
    if (this.lastValidTimestamp !== undefined) this.stageValidMs += frame.timestampMs - this.lastValidTimestamp;
    this.lastValidTimestamp = frame.timestampMs;
  }

  private interrupted(reason: string, kind: FailureKind): boolean {
    this.stageInterruptions += 1;
    this.notice = reason;
    this.announce(reason);
    if (this.stageInterruptions < SESSION_LIMITS.maxInterruptions) return false;
    this.fail(kind, 'Tracking was interrupted too often', [reason, 'Check lighting and that only one face is in view, then try again.']);
    return true;
  }

  private captureBaseline(frame: FeatureFrame): void {
    const recorder = this.baselineRecorder;
    if (!recorder) return;
    this.accumulateValid(frame);
    const update = recorder.push(frame);
    if (update.kind === 'interrupted') { this.interrupted(update.reason, 'baseline'); return; }
    if (update.kind === 'complete') {
      if (!update.value.ok) { this.fail('baseline', 'The rest check could not be used', update.value.reasons); return; }
      this.baseline = update.value.value;
      this.announce('Rest check complete.');
      if (this.restoring) this.beginRecheck(); else this.enterChoose();
      return;
    }
    if (this.stageValidMs > SESSION_LIMITS.baselineCapMs) {
      this.fail('baseline', 'The rest check could not finish', ['Ten uninterrupted seconds of rest were not recorded within one minute.']);
    }
  }

  private captureTrial(frame: FeatureFrame): void {
    const recorder = this.trialRecorder;
    const cycle = this.cycles[this.cycles.length - 1];
    if (!recorder || !cycle || !this.baseline) return;
    const update = recorder.push(frame);
    if (update.kind === 'interrupted') {
      this.speech.cancel();
      this.lastPrompt = null;
      this.cues?.stop();
      if (!this.interrupted(update.reason, this.stage === 'training' ? 'training' : 'verification')) this.cue('Rest');
      return;
    }
    if (update.kind !== 'complete') {
      this.cue(recorder.status().prompt);
      return;
    }
    // The recorder carries only the completed Rest into the next Action. Keep
    // filtering continuous and cue only after deciding whether another attempt exists.
    if (this.stage === 'training') {
      if (!this.choice) return;
      this.trials.push(update.value.trial);
      if (this.trials.length < SESSION_LIMITS.trainingTrials) {
        this.announce(`Training attempt ${this.trials.length} recorded.`);
        this.cue(recorder.status().prompt);
        return;
      }
      const fitted = fitGesture({ baseline: this.baseline, trials: this.trials, feature: this.choice.feature,
        direction: this.choice.direction, id: `${this.choice.feature}:${this.choice.direction}:${cycle.cycle}`, label: this.choice.label });
      this.calibrationReport = fitted.diagnostics ?? null;
      cycle.training = { ok: fitted.ok, reasons: fitted.ok ? [] : fitted.reasons };
      if (!fitted.ok) { this.fail('training', 'This movement could not be learned yet', fitted.reasons); return; }
      this.candidate = fitted.value;
      this.diagnosticModel = fitted.value;
      this.verifyPlan = [fitted.value.id, fitted.value.id, ...(this.adding ? this.approvedModels.map((model) => model.id) : [])];
      this.setStage('verify');
      this.trialRecorder = recorder;
      this.announce(`Movement learned. Now ${this.verifyPlan.length} new check attempts; they do not change what was learned.`);
      this.cue(recorder.status().prompt);
      return;
    }
    const expectedId = this.verifyPlan[cycle.heldOut.length];
    const set = this.mappingSet();
    if (!expectedId || !set.length) return;
    const kind = this.restoring ? 'recheck' : expectedId === this.candidate?.id ? 'held-out' : 'cross-check';
    const result = evaluatePositiveAttempt(set, update.value.frames, expectedId, actionWindowOf(update.value.trial));
    cycle.heldOut.push({ attempt: cycle.heldOut.length + 1, passed: result.passed, eventCount: result.eventCount,
      validDurationMs: result.validDurationMs, reasons: result.reasons, expected: this.labelOf(expectedId), expectedId, kind });
    if (!result.passed) {
      this.fail('verification', kind === 'cross-check' ? `The new movement interfered with “${this.labelOf(expectedId)}”`
        : kind === 'recheck' ? `“${this.labelOf(expectedId)}” did not pass its re-check` : 'A check attempt did not pass', result.reasons);
      return;
    }
    const next = this.verifyPlan[cycle.heldOut.length];
    if (next) {
      this.announce(`Check attempt ${cycle.heldOut.length} passed. Next: ${this.labelOf(next)}.`);
      this.cue(recorder.status().prompt);
      return;
    }
    this.setStage('negative');
    this.negativeMonitor = new NegativeMonitor(set);
    this.announce('All checks passed. Now move naturally for ten seconds without making any of your movements.');
    this.cue('Everyday activity');
  }

  private captureNegative(frame: FeatureFrame): void {
    const monitor = this.negativeMonitor;
    const cycle = this.cycles[this.cycles.length - 1];
    if (!monitor || !cycle) return;
    this.accumulateValid(frame);
    const update = monitor.push(frame);
    if (update.kind === 'interrupted') {
      if (frame.tracking !== 'tracked') this.interrupted(update.reason, 'negative');
      else { this.notice = update.reason; this.announce(update.reason); }
      return;
    }
    if (update.kind === 'complete') {
      const result = update.value;
      cycle.negative = { passed: result.passed, eventCount: result.eventCount, validDurationMs: result.validDurationMs,
        restarts: monitor.restarts, reasons: result.reasons };
      if (!result.passed) { this.fail('negative', 'An accidental activation was observed', result.reasons); return; }
      cycle.outcome = 'verified';
      cycle.verifiedIds = this.mappingSet().map((model) => model.id);
      this.enterComfort();
      return;
    }
    if (this.stageValidMs > SESSION_LIMITS.negativeCapMs) {
      cycle.negative = { passed: false, eventCount: 0, validDurationMs: monitor.armedMs, restarts: monitor.restarts,
        reasons: [...monitor.lastReasons, 'Ten armed seconds were not observed within one minute.'] };
      this.fail('negative', 'The everyday-activity check could not finish', cycle.negative.reasons);
    }
  }

  private cue(prompt: CapturePrompt): void {
    if (prompt === this.lastPrompt) return;
    this.lastPrompt = prompt;
    this.announce(prompt);
    if (this.spokenPrompts) this.speech.speak(prompt);
    if (!this.hidden && this.camera === 'running' && (prompt === 'Rest' || prompt === 'Action')) this.cues?.play(prompt === 'Rest' ? 'rest' : 'action');
  }
  // ── Stages and restricted setup scanners ─────────────────────────────────

  private setStage(stage: Stage): void {
    this.stage = stage;
    this.processor.reset();
    this.runtime = null;
    this.scanner = null;
    this.scanTargets = [];
    this.scanDriver = 'none';
    this.baselineRecorder = null;
    this.trialRecorder = null;
    this.negativeMonitor = null;
    this.stageInterruptions = 0;
    this.stageValidMs = 0;
    this.lastValidTimestamp = undefined;
    this.notice = null;
    this.lastPrompt = null;
    this.failure = null;
    this.discoverSegments = [];
    this.discoverValidMs = 0;
    this.discovery = null;
  }

  private startScanner(targets: ScanTarget[], driver: 'gesture' | 'assisted', models: readonly GestureModel[]): void {
    const nowMs = this.clock();
    this.scanTargets = targets;
    this.scanner = new ScanController(targets.map((target) => target.id), this.intervalMs, nowMs);
    this.scanDriver = driver;
    this.runtime = driver === 'gesture' && models.length ? new GestureRuntime(models) : null;
    this.idleValidMs = 0;
    this.lastScanFrameTimestamp = undefined;
    // A gesture-driven scanner waits for valid tracking; selections additionally need fresh neutral.
    if (driver === 'gesture' && (!this.runtime || this.tracking !== 'tracked' || this.camera !== 'running')) this.scanner.setSuspended(true, nowMs);
    if (driver === 'assisted' && this.hidden) this.scanner.setSuspended(true, nowMs);
  }

  private decisionTargets(ids: readonly DecisionId[]): ScanTarget[] {
    return ids.map((id) => ({ id, label: DECISION_LABELS[id], kind: 'decision' as const }));
  }

  private allowedDecisions(): DecisionId[] {
    const keep = (this.recalibrating || this.adding) && this.hasApproved;
    switch (this.stage) {
      case 'comfort': return this.restoring ? ['comfortable', 'another-movement', 'reject-profile']
        : ['comfortable', 'comfortable-effort', 'record-again', 'another-movement', ...(keep ? ['keep-current' as const] : [])];
      case 'tiring': return ['never-mind'];
      case 'mapping': return [...(this.hasApproved ? ['keep-current' as const] : []), ...(this.candidate ? ['reject' as const] : []),
        ...(this.restoring ? ['reject-profile' as const] : [])];
      case 'mapping-confirm': return ['choose-different', 'approve-mapping', ...(this.restoring ? ['reject-profile' as const] : [])];
      case 'recalibrate-confirm': return ['start-recalibration', 'keep-current'];
      case 'practice': return this.previousMapping && validateMapping(this.approvedModels, this.previousMapping.assignments).ok ? ['use-previous'] : [];
      case 'choose': return keep ? [...(this.recalibrating ? ['same-movement' as const] : []), 'discover', 'keep-current'] : [];
      case 'discover-results': return ['discover-again', 'full-list', ...(keep ? ['keep-current' as const] : [])];
      case 'setup-failed': {
        const kind = this.failure?.kind;
        const list: DecisionId[] = [];
        if (kind === 'cancelled' && keep && this.recalibrating) list.push('restart-recalibration');
        if (this.baseline && this.choice && kind !== 'baseline' && kind !== 'cancelled') list.push('record-again');
        if (this.baseline) list.push('another-movement');
        if (keep) list.push('keep-current');
        return list;
      }
      default: return [];
    }
  }

  /** Setup choices in scan order. The mapping stage lists Keep current first, then proposals, then Reject. */
  private setupTargets(): ScanTarget[] {
    const decisions = this.decisionTargets(this.allowedDecisions());
    if (this.stage === 'discover-results') {
      const found = (this.discovery?.candidates ?? []).flatMap((candidate, index) => [
        { id: `discovered:${index}`, label: candidate.label, kind: 'decision' as const },
        ...candidate.companions.map((companion, member) => ({ id: `discovered:${index}:${member}`, label: `Use “${companion.label}” instead`, kind: 'decision' as const })),
      ]);
      return [...found, ...decisions];
    }
    if (this.stage === 'tiring') {
      return [...this.approvedModels.map((model) => ({ id: `tiring:${model.id}`, label: `“${model.label}” is tiring`, kind: 'decision' as const })), ...decisions];
    }
    if (this.stage !== 'mapping') return decisions;
    const proposals = this.proposals.map((proposal) => ({ id: proposal.id, label: proposal.label, kind: 'decision' as const }));
    const keep = decisions.filter((target) => target.id === 'keep-current');
    return [...keep, ...proposals, ...decisions.filter((target) => target.id !== 'keep-current')];
  }

  /** Setup scanners: any verified movement in play selects the highlighted choice (R6). */
  private restrictedScanner(models: readonly GestureModel[]): void {
    const targets = this.setupTargets();
    if (models.length && targets.length) this.startScanner(targets, 'gesture', models);
  }

  private enterChoose(): void {
    this.setStage('choose');
    if (this.recalibrating || this.adding) this.restrictedScanner(this.approvedModels);
  }

  private enterComfort(): void {
    this.setStage('comfort');
    this.restrictedScanner(this.mappingSet());
    this.announce(this.restoring ? 'Re-checked. Are these movements still comfortable to repeat?' : 'Verified. Is this movement comfortable to repeat?');
  }

  private enterMapping(): void {
    this.setStage('mapping');
    this.pendingMapping = null;
    this.computeProposals();
    this.restrictedScanner(this.mappingSet());
    this.announce('Choose your controls. Nothing changes until you approve.');
  }

  private enterMappingConfirm(proposal: MappingProposal): void {
    this.setStage('mapping-confirm');
    this.pendingMapping = proposal;
    this.restrictedScanner(this.mappingSet());
    this.announce(`Review: ${proposal.label}.`);
  }

  private enterRecalibrateConfirm(): void {
    this.setStage('recalibrate-confirm');
    this.restrictedScanner(this.approvedModels);
  }

  private fail(kind: FailureKind, title: string, reasons: string[]): void {
    this.cues?.stop();
    const cycle = this.cycles[this.cycles.length - 1];
    if (cycle?.outcome === 'in-progress') cycle.outcome = kind === 'cancelled' ? 'cancelled' : 'failed';
    const expectedId = cycle?.heldOut.at(-1)?.expectedId ?? this.verifyPlan[cycle?.heldOut.length ?? 0];
    const fromSet = [...this.mappingSet(), ...this.approvedModels, ...(this.diagnosticModel ? [this.diagnosticModel] : [])];
    this.diagnosticModel = (expectedId ? fromSet.find((model) => model.id === expectedId) : undefined)
      ?? this.candidate ?? this.diagnosticModel;
    this.candidate = null;
    this.restoring = null;
    this.setStage('setup-failed');
    this.failure = { kind, title, reasons };
    if (this.recalibrating || this.adding) this.restrictedScanner(this.approvedModels);
    this.announce(`${title}. ${reasons[0] ?? ''}`.trim());
  }

  private closeOpenCycle(): void {
    const cycle = this.cycles[this.cycles.length - 1];
    if (cycle && (cycle.outcome === 'in-progress' || cycle.outcome === 'verified')) cycle.outcome = 'cancelled';
  }

  private startTraining(choice: MovementChoice): void {
    if (!this.baseline) return;
    this.closeOpenCycle();
    this.choice = { ...choice };
    this.calibrationReport = null;
    this.diagnosticModel = null;
    this.candidate = null;
    this.trials = [];
    this.cycles.push({ cycle: this.cycles.length + 1, movement: choice.label, training: null, heldOut: [], negative: null, outcome: 'in-progress',
      source: 'trained', verifiedIds: [] });
    this.setStage('training');
    this.trialRecorder = new TrialRecorder();
    this.announce(`Training "${choice.label}": three actions. Rest for five seconds, then hold your movement during Action.`);
    this.cue('Rest');
  }

  /** Choosing a proposal never arms it; it opens an explicit confirmation step. */
  private chooseProposal(id: string): void {
    if (this.stage !== 'mapping') return;
    const proposal = this.proposals.find((candidate) => candidate.id === id);
    if (proposal) this.enterMappingConfirm(proposal);
  }

  private approveMapping(): void {
    const pending = this.pendingMapping;
    const set = this.mappingSet();
    const cycle = this.cycles[this.cycles.length - 1];
    if (!pending) return;
    const valid = validateMapping(set, pending.assignments);
    if (!valid.ok) { this.enterMapping(); this.announce(valid.reasons[0] ?? 'Those controls are not valid.'); return; }
    const restored = this.restoring;
    if (restored) {
      // R7 B1: only a fully re-checked restore of exactly this set can arm.
      const ids = set.map((model) => model.id).sort();
      if (!cycle || cycle.source !== 'restored' || cycle.outcome !== 'verified'
        || cycle.verifiedIds.length !== ids.length || [...cycle.verifiedIds].sort().some((id, index) => id !== ids[index])) return;
      cycle.outcome = 'approved';
      this.approvedBaseline = this.baseline;
      this.vocabulary = restored.profile.vocabulary;
      this.intervalMs = restored.profile.scanIntervalMs;
    } else if (this.candidate) {
      if (!cycle || cycle.outcome !== 'verified') return;
      cycle.outcome = 'approved';
      this.approvedBaseline = this.baseline;
    }
    if (!sameMapping(this.mapping, valid.value)) this.previousMapping = this.mapping;
    this.approvedModels = [...set];
    this.mapping = valid.value;
    this.candidate = null;
    this.pendingMapping = null;
    this.recalibrating = false;
    this.adding = false;
    this.stepFallback = false;
    this.inputMode = 'gesture';
    if (restored) {
      this.previousMapping = null;
      this.restoring = null;
      this.choice = null;
      const { profile } = restored;
      this.activeProfile = profile.name;
      // Compared with what was saved, so approving different controls marks the setup unsaved.
      this.activeSignature = this.signature(profile.models, profile.mapping.assignments, profile.vocabulary, profile.scanIntervalMs);
      this.refreshProfiles();
    }
    this.enterPractice();
    this.announce(`Approved: ${describeMapping(this.approvedModels, valid.value)}. Practice first: nothing here is spoken.`);
  }

  private usePrevious(): void {
    const previous = this.previousMapping;
    if (!previous || this.candidate) return;
    const valid = validateMapping(this.approvedModels, previous.assignments);
    if (!valid.ok) { this.announce('Your previous controls no longer match your movements.'); return; }
    this.enterMappingConfirm({ ...valid.value, id: 'previous', label: describeMapping(this.approvedModels, valid.value) });
  }

  private keepCurrent(): void {
    const select = this.selectModel();
    if (!this.hasApproved || !select) return;
    this.closeOpenCycle();
    this.candidate = null;
    this.calibrationReport = null;
    this.diagnosticModel = null;
    this.trials = [];
    this.pendingMapping = null;
    this.baseline = this.approvedBaseline;
    this.choice = { feature: select.feature, direction: select.direction, label: select.label };
    this.recalibrating = false;
    this.adding = false;
    this.enterCommunication();
    this.announce('Kept your current setup. Return to rest before selecting.');
  }

  /** A scanned or clicked setup choice: a decision id or a mapping proposal id. */
  chooseSetupTarget(id: string): void {
    if (Object.hasOwn(DECISION_LABELS, id)) { this.decide(id as DecisionId); return; }
    if (id.startsWith('map:')) { this.chooseProposal(id); this.publish(); }
    if (id.startsWith('tiring:')) { this.reportTiring(id.slice('tiring:'.length)); this.publish(); }
    if (id.startsWith('discovered:')) { this.chooseDiscovered(id); this.publish(); }
  }

  /** Setup decision from a scanned gesture or a conventional button; ignored if not offered now. */
  decide(id: DecisionId): void {
    if (!this.allowedDecisions().includes(id)) return;
    switch (id) {
      case 'comfortable': this.noteEffort('easy'); if (this.restoring) this.offerSavedControls(); else this.enterMapping(); break;
      case 'comfortable-effort': this.noteEffort('effort'); this.enterMapping(); break;
      case 'never-mind': this.enterCommunication(); this.announce('Nothing changed. Return to rest before selecting.'); break;
      case 'discover': case 'discover-again': this.beginDiscovery(); break;
      case 'full-list': this.enterChoose(); break;
      case 'record-again': if (this.choice) this.startTraining(this.choice); break;
      case 'another-movement': this.closeOpenCycle(); this.candidate = null; this.restoring = null; this.enterChoose(); break;
      case 'choose-different': this.enterMapping(); break;
      case 'approve-mapping': this.approveMapping(); break;
      case 'use-previous': this.usePrevious(); break;
      case 'reject': {
        const cycle = this.cycles[this.cycles.length - 1];
        if (cycle) cycle.outcome = 'rejected';
        this.fail('rejected', 'Movement not approved', ['You chose not to use this movement. Nothing was changed.']);
        break;
      }
      case 'reject-profile': {
        const cycle = this.cycles[this.cycles.length - 1];
        if (cycle) cycle.outcome = 'rejected';
        this.fail('rejected', 'Profile not used', ['You chose not to use this saved profile. Nothing was changed.']);
        break;
      }
      case 'start-recalibration': this.recalibrating = true; this.adding = false; this.beginBaseline(); break;
      case 'restart-recalibration': this.beginBaseline(); break;
      case 'keep-current': this.keepCurrent(); break;
      case 'same-movement': {
        const select = this.selectModel();
        if (select) this.startTraining({ feature: select.feature, direction: select.direction, label: select.label });
        break;
      }
    }
    this.publish();
  }

  // ── Conventional/assisted setup commands ─────────────────────────────────

  startBaseline(): void {
    if (!['welcome', 'setup-failed', 'choose'].includes(this.stage)) return;
    this.beginBaseline();
    this.publish();
  }

  private beginBaseline(): void {
    if (this.camera !== 'running') { this.announce('Start the camera first.'); return; }
    this.closeOpenCycle();
    this.candidate = null;
    this.restoring = null;
    this.diagnosticModel = null;
    this.calibrationReport = null;
    this.setStage('baseline');
    this.baselineRecorder = new BaselineRecorder(CAPTURE_TIMING.baselineMs);
    this.announce('Rest comfortably for ten seconds.');
  }

  chooseMovement(choice: MovementChoice): void {
    if (!['choose', 'setup-failed', 'discover-results'].includes(this.stage) || !this.baseline) return;
    if (this.adding && this.approvedModels.some((model) => model.feature === choice.feature && model.direction === choice.direction)) {
      this.announce('That movement is already one of your controls. Choose a different movement.');
      this.publish();
      return;
    }
    this.startTraining(choice);
    this.publish();
  }

  cancel(): void {
    if (!CAPTURE_STAGES.includes(this.stage) && this.stage !== 'choose') return;
    this.fail('cancelled', 'Setup paused', ['You stopped. Nothing from the unfinished recording was used.']);
    this.publish();
  }

  useAssisted(): void {
    this.closeOpenCycle();
    this.candidate = null;
    this.restoring = null;
    this.pendingMapping = null;
    if (this.recalibrating || this.adding) this.baseline = this.approvedBaseline;
    this.recalibrating = false;
    this.adding = false;
    this.inputMode = 'assisted';
    this.enterCommunication();
    this.announce('Assisted input: press Space to select the highlighted item.');
    this.publish();
  }

  useGesture(): void {
    if (!this.hasApproved) return;
    this.inputMode = 'gesture';
    this.enterCommunication();
    this.announce('Using your movement. Return to rest to begin.');
    this.publish();
  }

  /** Conventional helper edit of the phrase vocabulary during setup; returns the plain reason when refused. */
  editVocabulary(edit: VocabularyEdit): Result<Vocabulary> {
    if (!['welcome', 'choose', 'setup-failed'].includes(this.stage)) return { ok: false, reasons: ['Phrases can be edited during setup.'] };
    const result = applyEdit(this.vocabulary, edit);
    if (result.ok) this.vocabulary = result.value;
    this.publish();
    return result;
  }

  setSpokenPrompts(enabled: boolean): void {
    this.spokenPrompts = enabled;
    this.publish();
  }

  // ── Free movement discovery (R9) ─────────────────────────────────────────

  /** Helper button or scanned decision: explore freely so candidates can be proposed. Never creates a model. */
  startDiscovery(): void {
    if (!['choose', 'discover-results'].includes(this.stage) && !(this.stage === 'setup-failed' && this.failure?.kind === 'discovery')) return;
    this.beginDiscovery();
    this.publish();
  }

  private beginDiscovery(): void {
    if (!this.baseline) return;
    if (this.camera !== 'running') { this.announce('Start the camera first.'); return; }
    this.closeOpenCycle();
    this.candidate = null;
    this.choice = null;
    this.setStage('discover');
    this.announce('Try any movements you can comfortably make, a few times each, resting in between.');
    this.cue('Explore freely');
  }

  private captureDiscovery(frame: FeatureFrame): void {
    const segment = this.discoverSegments[this.discoverSegments.length - 1];
    if (frame.tracking !== 'tracked') {
      if (segment?.length) {
        this.discoverSegments.push([]);
        this.interrupted('Tracking was interrupted. Exploring continues when your face is clear again.', 'discovery');
      }
      return;
    }
    const last = segment?.[segment.length - 1];
    if (!segment || (last && frame.timestampMs - last.timestampMs > MAX_FRAME_GAP_MS)) this.discoverSegments.push([frame]);
    else {
      if (last) this.discoverValidMs += frame.timestampMs - last.timestampMs;
      segment.push(frame);
    }
    if (this.discoverValidMs < DISCOVERY.captureMs || !this.baseline) return;
    const approved: Channel[] = this.adding ? this.approvedModels.map((model) => ({ feature: model.feature, direction: model.direction, label: model.label })) : [];
    const result = discoverCandidates(this.baseline, this.discoverSegments.filter((part) => part.length > 1), approved);
    this.setStage('discover-results');
    this.discovery = result;
    if ((this.recalibrating || this.adding) && this.hasApproved) this.restrictedScanner(this.approvedModels);
    this.announce(result.candidates.length
      ? `Noticed ${result.candidates.length} movement${result.candidates.length === 1 ? '' : 's'}. Choosing one starts the usual practice and checks.`
      : result.reason ?? 'No movement was found.');
  }

  private chooseDiscovered(id: string): void {
    const match = /^discovered:(\d+)(?::(\d+))?$/.exec(id);
    const candidate = match ? this.discovery?.candidates[Number(match[1])] : undefined;
    if (this.stage !== 'discover-results' || !candidate || !match) return;
    const channel = match[2] === undefined ? candidate : candidate.companions[Number(match[2])];
    if (!channel) return;
    this.chooseMovement({ feature: channel.feature, direction: channel.direction, label: channel.label });
  }

  // ── Evidence, effort and recommendations (R8) ────────────────────────────

  private noteEffort(effort: Effort): void {
    const id = this.restoring ? undefined : this.candidate?.id;
    if (id) this.notes[id] = { ...this.notes[id], effort };
  }

  private reportTiring(id: string): void {
    const model = this.approvedModels.find((candidate) => candidate.id === id);
    if (this.stage !== 'tiring' || !model) return;
    this.notes[id] = { ...this.notes[id], tiringReports: (this.notes[id]?.tiringReports ?? 0) + 1 };
    this.enterMapping();
    this.announce(`Noted: “${model.label}” is tiring. The recommended controls use it less; nothing changes until you approve.`);
  }

  /** Completed holds and holds released before completion, in practice and communication only. */
  private countUse(completedId: string | undefined, unfinishedId: string | undefined): void {
    const bump = (id: string, key: keyof MovementUse) => {
      const current = this.use[id] ?? { completed: 0, unfinished: 0 };
      this.use[id] = { ...current, [key]: current[key] + 1 };
    };
    if (completedId) bump(completedId, 'completed');
    if (unfinishedId) bump(unfinishedId, 'unfinished');
  }

  private evidenceModels(): GestureModel[] {
    const set = this.mappingSet();
    return [...this.approvedModels, ...set.filter((model) => !this.approvedModels.includes(model))];
  }

  /** The recommendation leads the proposals (after Keep current); a matching proposal is relabelled, not duplicated. */
  private computeProposals(): void {
    const set = this.mappingSet();
    const base = proposeMappings(set);
    this.proposals = base;
    this.recommendation = null;
    const recommended = recommendMapping(set, movementEvidence(set, this.cycles, this.notes, this.use));
    if (!recommended) return;
    const valid = validateMapping(set, recommended.assignments);
    if (!valid.ok) return;
    const match = base.find((proposal) => sameMapping(proposal, valid.value));
    const proposal = { ...valid.value, id: match?.id ?? 'map:recommended', label: `Recommended: ${describeMapping(set, valid.value)}` };
    this.proposals = [proposal, ...base.filter((candidate) => candidate !== match)];
    this.recommendation = { id: proposal.id, reasons: recommended.reasons };
  }

  /** Caregiver form: any valid assignment for the movements in play; still needs approval. */
  proposeCustom(assignments: Record<string, string>): boolean {
    if (this.stage !== 'mapping') return false;
    const set = this.mappingSet();
    const valid = validateMapping(set, assignments as Mapping['assignments']);
    if (!valid.ok) { this.announce(valid.reasons.join(' ')); this.publish(); return false; }
    this.enterMappingConfirm({ ...valid.value, id: 'custom', label: `Custom: ${describeMapping(set, valid.value)}` });
    this.publish();
    return true;
  }

  // ── Saved profiles (R7) ──────────────────────────────────────────────────

  private refreshProfiles(): void { this.profileList = this.store.list(); }

  /** Everything a profile stores, to tell whether the approved setup still matches the saved one. */
  private signature(models: readonly GestureModel[] = this.approvedModels, assignments: Mapping['assignments'] | null = this.mapping?.assignments ?? null,
    vocabulary: Vocabulary = this.vocabulary, intervalMs: number = this.intervalMs): string {
    // Assignment order does not matter: the same controls picked again must not read as a change.
    return JSON.stringify([models, assignments ? Object.entries(assignments).sort() : null, vocabulary, intervalMs]);
  }

  /** Explicit, caregiver-assisted Save of the approved setup. Never reachable from the scanner. */
  saveProfile(name: string, replace = false): StoreResult {
    const refuse = (reason: string): StoreResult => { this.announce(reason); this.publish(); return { ok: false, code: 'invalid', reason }; };
    if (!this.isRoutedStage() || !this.hasApproved || !this.mapping) return refuse('Save is available once your controls are approved, from practice or communication.');
    const built = buildProfile({ name, models: this.approvedModels, mapping: this.mapping, vocabulary: this.vocabulary, scanIntervalMs: this.intervalMs });
    if (!built.ok) return refuse(built.reasons[0] ?? 'This setup cannot be saved.');
    const result = this.store.save(built.value, replace);
    this.refreshProfiles();
    if (result.ok) {
      this.activeProfile = built.value.name;
      this.activeSignature = this.signature();
      this.announce(`Saved “${built.value.name}” on this device. Only movement settings, controls, phrases and scan speed were saved.`);
    } else this.announce(result.reason);
    this.publish();
    return result;
  }

  deleteProfile(name: string): StoreResult {
    const result = this.store.remove(name);
    this.refreshProfiles();
    if (result.ok && this.activeProfile && sameName(this.activeProfile, name)) this.activeProfile = null;
    this.announce(result.ok ? `Deleted “${name}” from this device.` : result.reason);
    this.publish();
    return result;
  }

  deleteAllProfiles(): StoreResult {
    const result = this.store.removeAll();
    this.refreshProfiles();
    if (result.ok) this.activeProfile = null;
    this.announce(result.ok ? 'All saved profiles were deleted from this device.' : result.reason);
    this.publish();
    return result;
  }

  /** Disarmed restore: fresh rest check → rest fit → re-checks → everyday activity → comfort → approval (R7). */
  restoreProfile(name: string): boolean {
    const refuse = (reason: string) => { this.announce(reason); this.publish(); return false; };
    if (!['welcome', 'setup-failed'].includes(this.stage) || this.hasApproved) return refuse('A saved profile can be restored from the start screen before any setup is approved.');
    if (this.camera !== 'running') return refuse('Start the camera first.');
    this.refreshProfiles();
    if (!this.profileList.available) return refuse('Saved profiles are not available in this browser.');
    const profile = this.store.get(name);
    if (!profile) return refuse(`The saved profile “${name}” could not be found or read.`);
    this.choice = null;
    this.beginBaseline();
    this.restoring = { profile, models: profile.models.map((model) => ({ ...model })) };
    this.announce(`Restoring “${profile.name}”: rest comfortably for ten seconds. Nothing is turned on until you approve.`);
    this.publish();
    return true;
  }

  /** After today's rest: saved thresholds are never re-centred, so rest must fit every saved model. */
  private beginRecheck(): void {
    const restoring = this.restoring;
    const baseline = this.baseline;
    if (!restoring || !baseline) return;
    const misfits = restoring.models.filter((model) => {
      const rest = baseline.statistics[model.feature];
      return [rest.low, rest.center, rest.high].some((value) => !(Math.abs(value - model.baselineCenter) < model.releaseThreshold));
    });
    if (misfits.length) {
      this.fail('profile-mismatch', 'This saved profile does not fit today\'s rest', [
        ...misfits.map((model) => `“${model.label}” reads differently at rest than when the profile was saved.`),
        'Today\'s rest check can still be used to set up a movement again, or use assisted input.',
      ]);
      return;
    }
    const { profile, models } = restoring;
    const assignments = profile.mapping.assignments;
    const ordered = [...models].sort((a, b) => Number(assignments[b.id] === 'select') - Number(assignments[a.id] === 'select'));
    this.cycles.push({ cycle: this.cycles.length + 1, movement: `Saved profile “${profile.name}”`, training: null, heldOut: [], negative: null,
      outcome: 'in-progress', source: 'restored', verifiedIds: [], profile: profile.name });
    this.verifyPlan = ordered.flatMap((model) => (assignments[model.id] ? [model.id, model.id] : [model.id]));
    this.diagnosticModel = ordered[0] ?? null;
    this.setStage('verify');
    this.trialRecorder = new TrialRecorder();
    this.announce(`Rest fits. Now ${this.verifyPlan.length} re-check attempts with your saved movements; nothing is adjusted.`);
    this.cue('Rest');
  }

  private offerSavedControls(): void {
    const restoring = this.restoring;
    if (!restoring) return;
    const valid = validateMapping(restoring.models, restoring.profile.mapping.assignments);
    if (!valid.ok) { this.enterMapping(); return; }
    this.enterMappingConfirm({ ...valid.value, id: 'saved', label: `Saved controls: ${describeMapping(restoring.models, valid.value)}` });
  }

  private profilesView(): ProfilesView {
    return {
      names: this.profileList.profiles.map((profile) => profile.name), rejected: this.profileList.rejected,
      available: this.profileList.available, readable: this.profileList.readable, active: this.activeProfile,
      unsaved: this.hasApproved && (this.activeProfile === null || this.signature() !== this.activeSignature),
    };
  }

  // ── Scanning and communication ───────────────────────────────────────────

  /** Resolves `phrase:<groupId>:<index>` against the current vocabulary; stale ids resolve to nothing. */
  private phraseFor(id: string): string | undefined {
    const match = /^phrase:([^:]+):(\d+)$/.exec(id);
    return match ? this.vocabulary.groups.find((group) => group.id === match[1])?.phrases[Number(match[2])] : undefined;
  }

  private phraseTargets(): ScanTarget[] {
    return this.vocabulary.groups.flatMap((group) => group.phrases.map((label, index) =>
      ({ id: `phrase:${group.id}:${index}`, label, kind: 'phrase' as const })));
  }

  private enterPractice(): void {
    this.setStage('practice');
    this.practice = { selections: 0, last: null };
    const targets: ScanTarget[] = [
      ...this.phraseTargets(),
      { id: 'finish-practice', label: CONTROL_LABELS['finish-practice']!, kind: 'control' },
      ...this.decisionTargets(this.allowedDecisions()),
    ];
    this.startScanner(targets, this.inputMode === 'assisted' ? 'assisted' : 'gesture', this.approvedModels);
  }

  private enterCommunication(): void {
    this.setStage('communication');
    const speed = this.inputMode === 'assisted' || this.scanMode() === 'auto' ? ['slower', 'faster'] : [];
    const controls = this.inputMode === 'assisted'
      ? ['speak', 'clear', 'pause', ...speed, 'practice', this.hasApproved ? 'use-gesture' : 'setup-gesture']
      : ['speak', 'clear', 'pause', ...speed, 'practice', 'change-controls', ...(this.approvedModels.length > 1 ? ['tiring'] : []),
        ...(this.approvedModels.length < MAX_GESTURES ? ['add-movement'] : []), 'recalibrate'];
    const targets: ScanTarget[] = [
      ...this.phraseTargets(),
      ...controls.map((id) => ({ id, label: CONTROL_LABELS[id]!, kind: 'control' as const })),
    ];
    this.startScanner(targets, this.inputMode === 'assisted' ? 'assisted' : 'gesture', this.approvedModels);
  }

  private isRoutedStage(): boolean { return this.stage === 'communication' || this.stage === 'practice'; }

  private isStepping(): boolean { return this.scanDriver === 'gesture' && this.isRoutedStage() && this.scanMode() === 'step'; }

  private driveScanner(frame: FeatureFrame, nowMs: number): void {
    const scanner = this.scanner;
    if (!scanner || this.scanDriver !== 'gesture') return;
    if (!this.runtime || frame.tracking !== 'tracked') {
      // Fail closed: discard any pending dwell and latch, freeze timing, and require fresh neutral later.
      this.runtime?.invalidate();
      scanner.cancelSelection(nowMs);
      scanner.setSuspended(true, nowMs);
      this.lastScanFrameTimestamp = undefined;
      return;
    }
    scanner.setSuspended(false, nowMs);
    // A paused scan never counts toward the step fallback, which would otherwise rebuild an unpaused scanner.
    if (this.lastScanFrameTimestamp !== undefined && !scanner.snapshot.paused) this.idleValidMs += frame.timestampMs - this.lastScanFrameTimestamp;
    this.lastScanFrameTimestamp = frame.timestampMs;
    const update = this.runtime.step(frame, nowMs);
    if (this.isRoutedStage()) this.countUse(update.event?.gestureId, update.cancelCause === 'released' || update.cancelCause === 'band' ? update.cancelledId : undefined);
    // Setup scanners: any verified movement selects. Communication: route by the approved mapping (R6 B1).
    const actionOf = (id: string) => (this.isRoutedStage() ? this.mapping?.assignments[id] : 'select');
    if (update.started) {
      this.idleValidMs = 0;
      if (actionOf(update.started) === 'select') scanner.beginSelection(nowMs);
    }
    if (update.cancelled && scanner.snapshot.latchedTarget !== undefined) scanner.cancelSelection(nowMs);
    if (update.event) {
      this.idleValidMs = 0;
      const action = actionOf(update.event.gestureId);
      if (scanner.snapshot.paused) {
        if (action === 'select' || action === 'pause') this.resumeScan(nowMs);
        return;
      }
      switch (action) {
        case 'select': { const target = scanner.commitSelection(nowMs); if (target) this.activate(target, nowMs); return; }
        case 'next': scanner.move(1, nowMs); return;
        case 'previous': scanner.move(-1, nowMs); return;
        case 'pause': this.pauseScan(nowMs); return;
        default: return; // Unmapped movement: its hold is consumed and discarded.
      }
    }
    if (this.isStepping()) {
      if (this.idleValidMs >= SESSION_LIMITS.stepIdleMs) this.fallBackToAutomatic();
      return;
    }
    scanner.tick(nowMs);
  }

  /** R6 B2: step mode with no movement for a minute of valid tracking becomes automatic scanning. */
  private fallBackToAutomatic(): void {
    this.stepFallback = true;
    if (this.stage === 'practice') this.enterPractice(); else this.enterCommunication();
    this.announce('No movement for a minute, so scanning is now automatic. Your select movement still selects; helpers can use the buttons.');
  }

  private pauseScan(nowMs: number): void {
    this.idleValidMs = 0;
    this.scanner?.setPaused(true, nowMs);
    this.announce(this.inputMode === 'assisted' ? 'Paused. Press Space to resume.' : 'Paused. Rest, then use your select or pause movement to resume.');
  }

  private resumeScan(nowMs: number): void {
    this.idleValidMs = 0;
    this.scanner?.setPaused(false, nowMs);
    this.announce('Resumed.');
  }

  private activate(id: string, nowMs: number): void {
    if (Object.hasOwn(DECISION_LABELS, id) || id.startsWith('map:') || id.startsWith('tiring:') || id.startsWith('discovered:')) { this.chooseSetupTarget(id); return; }
    const phrase = this.phraseFor(id);
    if (this.stage === 'practice') {
      if (id === 'finish-practice') { this.enterCommunication(); this.announce('Practice finished. Your selections now build a message.'); return; }
      if (phrase) {
        this.practice = { selections: this.practice.selections + 1, last: phrase };
        this.announce(`Practice: selected "${phrase}".`);
      }
      return;
    }
    if (this.stage !== 'communication') return;
    if (phrase) { this.message = [...this.message, phrase]; this.announce(`Added "${phrase}".`); return; }
    switch (id) {
      case 'speak': this.speakMessage(); break;
      case 'clear': this.message = []; this.announce('Message cleared.'); break;
      case 'pause': this.pauseScan(nowMs); break;
      case 'slower': this.changeInterval(SESSION_LIMITS.scanStepMs, nowMs); break;
      case 'faster': this.changeInterval(-SESSION_LIMITS.scanStepMs, nowMs); break;
      case 'practice': this.enterPractice(); this.announce('Practice: selections are not spoken.'); break;
      case 'change-controls': if (this.hasApproved && this.inputMode === 'gesture') this.enterMapping(); break;
      case 'tiring':
        if (this.hasApproved && this.inputMode === 'gesture' && this.approvedModels.length > 1) {
          this.setStage('tiring');
          this.restrictedScanner(this.approvedModels);
          this.announce('Which movement is tiring? Nothing changes until you approve new controls.');
        }
        break;
      case 'add-movement':
        if (this.hasApproved && this.inputMode === 'gesture' && this.approvedModels.length < MAX_GESTURES) {
          this.adding = true;
          this.enterChoose();
          this.announce('Add a movement: a helper chooses it on screen, or keep your current setup.');
        }
        break;
      case 'recalibrate': if (this.hasApproved && this.inputMode === 'gesture') this.enterRecalibrateConfirm(); break;
      case 'use-gesture': this.useGesture(); break;
      case 'setup-gesture': this.setStage('welcome'); this.announce('Set up a movement: start the camera, then the rest check.'); break;
    }
  }

  private changeInterval(delta: number, nowMs: number): void {
    this.intervalMs = Math.max(SESSION_LIMITS.scanMinMs, Math.min(SESSION_LIMITS.scanMaxMs, this.intervalMs + delta));
    this.scanner?.setInterval(this.intervalMs, nowMs);
    this.announce(`Scanning every ${(this.intervalMs / 1_000).toFixed(1)} seconds.`);
  }

  private speakMessage(): void {
    if (!this.message.length) { this.announce('Nothing to speak yet. Add a phrase first.'); return; }
    const text = this.message.join('. ');
    const spoken = this.speech.speak(text);
    this.lastSpoken = text;
    this.announce(spoken ? `Speaking: ${text}` : `Local speech is not available on this device. Your message is shown on screen: ${text}`);
  }

  /** Assisted Space switch: only in the clearly labeled assisted mode, never during capture. */
  switchPress(nowMs: number = this.clock()): void {
    const scanner = this.scanner;
    if (this.inputMode !== 'assisted' || this.scanDriver !== 'assisted' || !scanner || this.hidden) return;
    if (scanner.snapshot.paused) { this.resumeScan(nowMs); this.publish(); return; }
    scanner.beginSelection(nowMs);
    const target = scanner.commitSelection(nowMs);
    if (target) this.activate(target, nowMs);
    this.publish();
  }

  /** Conventional pointer/keyboard activation of a visible tile (caregiver use). Disabled while paused. */
  selectTarget(id: string): void {
    if (!this.scanner || this.scanner.snapshot.paused || !this.scanTargets.some((target) => target.id === id)) return;
    this.activate(id, this.clock());
    this.publish();
  }

  resume(): void {
    if (!this.scanner?.snapshot.paused) return;
    this.resumeScan(this.clock());
    this.publish();
  }

  // ── Snapshot ─────────────────────────────────────────────────────────────

  private announce(text: string): void { this.announcement = text; }

  private captureStatus(): CaptureStatus | null {
    const base = { interruptions: this.stageInterruptions, notice: this.notice, movement: null as string | null,
      nextPrompt: null as CapturePrompt | null, feature: null as MovementChoice['feature'] | null,
      direction: null as 1 | -1 | null, modelId: null as string | null };
    if (this.stage === 'baseline' && this.baselineRecorder) {
      const progress = this.baselineRecorder.progress;
      return { ...base, kind: 'baseline', index: 1, total: 1, prompt: 'Rest', phaseProgress: progress, overallProgress: progress,
        remainingMs: Math.max(0, CAPTURE_TIMING.baselineMs - this.baselineRecorder.elapsedMs), validMs: this.baselineRecorder.elapsedMs };
    }
    if ((this.stage === 'training' || this.stage === 'verify') && this.trialRecorder) {
      const status = this.trialRecorder.status();
      const cycle = this.cycles[this.cycles.length - 1];
      const training = this.stage === 'training';
      const done = training ? this.trials.length : cycle?.heldOut.length ?? 0;
      const expected = training ? this.choice?.label ?? null : this.labelOf(this.verifyPlan[done] ?? '');
      const modelId = training ? null : this.verifyPlan[done] ?? null;
      const selected = training ? this.choice : this.mappingSet().find((model) => model.id === modelId);
      return { ...base, movement: expected, feature: selected?.feature ?? null, direction: selected?.direction ?? null,
        modelId, kind: training ? 'training' : 'verification', index: done + 1,
        total: training ? SESSION_LIMITS.trainingTrials : this.verifyPlan.length,
        prompt: status.prompt, phaseProgress: status.phaseProgress, overallProgress: status.overallProgress, validMs: status.elapsedMs,
        remainingMs: status.remainingMs, nextPrompt: !training && done === this.verifyPlan.length - 1 && status.elapsedMs >= CAPTURE_TIMING.restMs + CAPTURE_TIMING.moveMs ? null : status.nextPrompt };
    }
    if (this.stage === 'discover') {
      const progress = Math.min(1, this.discoverValidMs / DISCOVERY.captureMs);
      return { ...base, kind: 'discovery', index: 1, total: 1, prompt: 'Explore freely', phaseProgress: progress, overallProgress: progress,
        remainingMs: Math.max(0, DISCOVERY.captureMs - this.discoverValidMs), validMs: this.discoverValidMs };
    }
    if (this.stage === 'negative' && this.negativeMonitor) {
      const progress = Math.min(1, this.negativeMonitor.armedMs / CAPTURE_TIMING.negativeMs);
      return { ...base, kind: 'negative', index: 1, total: 1, prompt: 'Everyday activity', phaseProgress: progress,
        overallProgress: progress, validMs: this.negativeMonitor.armedMs, interruptions: this.negativeMonitor.restarts,
        remainingMs: Math.max(0, CAPTURE_TIMING.negativeMs - this.negativeMonitor.armedMs) };
    }
    return null;
  }

  private publish(): void {
    const scanner = this.scanner?.snapshot;
    const runtime = this.runtime?.snapshot;
    this.snap = {
      stage: this.stage, camera: this.camera, cameraMessage: this.cameraMessage, tracking: this.tracking,
      frame: this.frame, frameIntervalMs: this.frameIntervalMs, hidden: this.hidden, baseline: this.baseline,
      choice: this.choice, calibrationReport: this.calibrationReport, diagnosticModel: this.diagnosticModel,
      candidate: this.candidate, approvedModel: this.selectModel(), approvedModels: [...this.approvedModels],
      mapping: this.mapping, mappingLabel: this.mapping ? describeMapping(this.approvedModels, this.mapping) : null,
      pendingMapping: this.pendingMapping, scanMode: this.scanMode(), stepFallback: this.stepFallback, adding: this.adding,
      inputMode: this.inputMode,
      recalibrating: this.recalibrating, capture: this.captureStatus(),
      cycles: this.cycles.map((cycle) => ({ ...cycle, heldOut: [...cycle.heldOut] })),
      failure: this.failure, decisions: this.setupTargets(),
      scan: scanner ? { targets: this.scanTargets, index: scanner.index, latched: scanner.latchedTarget ?? null, paused: scanner.paused,
        suspended: scanner.suspended, intervalMs: scanner.intervalMs, driver: this.scanDriver } : null,
      runtime: runtime ? { phase: runtime.phase, armed: runtime.armed, neutral: runtime.neutral } : null,
      vocabulary: this.vocabulary, message: [...this.message], lastSpoken: this.lastSpoken, speech: this.speech.status(),
      spokenPrompts: this.spokenPrompts, practice: { ...this.practice }, announcement: this.announcement,
      profiles: this.profilesView(), restoring: this.restoring?.profile.name ?? null,
      evidence: movementEvidence(this.evidenceModels(), this.cycles, this.notes, this.use), setupModels: [...this.mappingSet()],
      discovery: this.discovery,
      recommendation: this.stage === 'mapping' ? this.recommendation : null,
    };
    for (const listener of this.listeners) listener();
  }
}
