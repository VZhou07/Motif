import type { Baseline, FeatureFrame, GestureModel, TrackingState, TrainingTrial } from '../domain/types';
import { fitGesture } from '../engine/calibration';
import { FeatureProcessor, MAX_FRAME_GAP_MS } from '../engine/features';
import { GestureRuntime } from '../engine/recognition';
import { ScanController } from '../engine/scanner';
import { evaluatePositiveAttempt } from '../engine/verification';
import { BaselineRecorder, CAPTURE_TIMING, NegativeMonitor, TrialRecorder } from './capture';
import {
  STARTER_PHRASES, type CameraStatus, type CapturePrompt, type CaptureStatus, type CycleEvidence, type Failure, type FailureKind,
  type InputMode, type MovementChoice, type ScanTarget, type SessionSnapshot, type SpeechPort, type Stage,
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
} as const;

export const DECISION_LABELS = {
  comfortable: 'Yes, this movement is comfortable',
  'record-again': 'Record this movement again',
  'another-movement': 'Choose another movement',
  approve: 'Approve: this movement selects the highlighted item',
  reject: 'Do not use this movement',
  'start-recalibration': 'Start recalibration',
  'keep-current': 'Keep current setup',
  'same-movement': 'Use the same movement again',
  'restart-recalibration': 'Restart recalibration',
} as const;
export type DecisionId = keyof typeof DECISION_LABELS;

const CONTROL_LABELS: Record<string, string> = {
  speak: 'Speak message', clear: 'Clear message', pause: 'Pause', slower: 'Slower scanning', faster: 'Faster scanning',
  practice: 'Practice', recalibrate: 'Recalibrate', 'finish-practice': 'Finish practice',
  'setup-gesture': 'Set up a movement', 'use-gesture': 'Use my movement',
};

const silentSpeech: SpeechPort = { status: () => ({ available: false, voiceName: null }), speak: () => false, cancel: () => {} };
const CAPTURE_STAGES: readonly Stage[] = ['baseline', 'training', 'verify', 'negative'];

export interface SessionOptions { speech?: SpeechPort; clock?: () => number }

/**
 * Browser-independent orchestrator (R5). React renders `getSnapshot()` and forwards input.
 * All recognition flows through one FeatureProcessor; every stage change resets it,
 * drops the gesture runtime and scanner latch, and therefore requires fresh neutral.
 */
export class MotifSession {
  private readonly speech: SpeechPort;
  private readonly clock: () => number;
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
  private candidate: GestureModel | null = null;
  private approvedModel: GestureModel | null = null;
  private inputMode: InputMode = 'gesture';
  private recalibrating = false;
  private cycles: CycleEvidence[] = [];
  private failure: Failure | null = null;
  private phrases = [...STARTER_PHRASES];
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
    this.publish();
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  readonly getSnapshot = (): SessionSnapshot => this.snap;

  /** Republish after an external status change (for example, voices finished loading). */
  refresh(): void { this.publish(); }

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
    if (this.scanner) {
      const before = this.scanner.snapshot.index;
      this.scanner.tick(nowMs);
      changed ||= this.scanner.snapshot.index !== before;
    }
    if (changed) this.publish();
  }

  setHidden(hidden: boolean, nowMs: number = this.clock()): void {
    if (this.hidden === hidden) return;
    this.hidden = hidden;
    if (hidden) this.failClosed(nowMs, 'stale');
    if (this.scanner && this.scanDriver === 'assisted') this.scanner.setSuspended(hidden, nowMs);
    this.publish();
  }

  setCamera(status: CameraStatus, message: string | null = null): void {
    const nowMs = this.clock();
    this.camera = status;
    this.cameraMessage = message;
    if (status !== 'running') {
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
      this.enterChoose();
      return;
    }
    if (this.stageValidMs > SESSION_LIMITS.baselineCapMs) {
      this.fail('baseline', 'The rest check could not finish', ['Ten uninterrupted seconds of rest were not recorded within one minute.']);
    }
  }

  private captureTrial(frame: FeatureFrame): void {
    const recorder = this.trialRecorder;
    const cycle = this.cycles[this.cycles.length - 1];
    if (!recorder || !cycle || !this.baseline || !this.choice) return;
    const update = recorder.push(frame);
    if (update.kind === 'interrupted') {
      this.interrupted(update.reason, this.stage === 'training' ? 'training' : 'verification');
      return;
    }
    this.cue(recorder.status().prompt);
    if (update.kind !== 'complete') return;
    this.processor.reset();
    this.lastPrompt = null;
    if (this.stage === 'training') {
      this.trials.push(update.value.trial);
      if (this.trials.length < SESSION_LIMITS.trainingTrials) {
        this.announce(`Training attempt ${this.trials.length} recorded.`);
        return;
      }
      const fitted = fitGesture({ baseline: this.baseline, trials: this.trials, feature: this.choice.feature,
        direction: this.choice.direction, id: `${this.choice.feature}:${this.choice.direction}:${cycle.cycle}`, label: this.choice.label });
      cycle.training = { ok: fitted.ok, reasons: fitted.ok ? [] : fitted.reasons };
      if (!fitted.ok) { this.fail('training', 'This movement could not be learned yet', fitted.reasons); return; }
      this.candidate = fitted.value;
      this.setStage('verify');
      this.trialRecorder = new TrialRecorder();
      this.announce('Movement learned. Now two new check attempts; they do not change what was learned.');
      return;
    }
    const model = this.candidate;
    if (!model) return;
    const result = evaluatePositiveAttempt(model, update.value.frames, model.id);
    cycle.heldOut.push({ attempt: cycle.heldOut.length + 1, passed: result.passed, eventCount: result.eventCount,
      validDurationMs: result.validDurationMs, reasons: result.reasons });
    if (!result.passed) { this.fail('verification', 'A check attempt did not pass', result.reasons); return; }
    if (cycle.heldOut.length < SESSION_LIMITS.heldOutAttempts) {
      this.announce(`Check attempt ${cycle.heldOut.length} passed.`);
      return;
    }
    this.setStage('negative');
    this.negativeMonitor = new NegativeMonitor([model]);
    this.announce('Both checks passed. Now move naturally for ten seconds without making your movement.');
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
  }

  private startScanner(targets: ScanTarget[], driver: 'gesture' | 'assisted', model: GestureModel | null): void {
    const nowMs = this.clock();
    this.scanTargets = targets;
    this.scanner = new ScanController(targets.map((target) => target.id), this.intervalMs, nowMs);
    this.scanDriver = driver;
    this.runtime = driver === 'gesture' && model ? new GestureRuntime(model) : null;
    // A gesture-driven scanner waits for valid tracking; selections additionally need fresh neutral.
    if (driver === 'gesture' && (!this.runtime || this.tracking !== 'tracked' || this.camera !== 'running')) this.scanner.setSuspended(true, nowMs);
    if (driver === 'assisted' && this.hidden) this.scanner.setSuspended(true, nowMs);
  }

  private decisionTargets(ids: readonly DecisionId[]): ScanTarget[] {
    return ids.map((id) => ({ id, label: DECISION_LABELS[id], kind: 'decision' as const }));
  }

  private allowedDecisions(): DecisionId[] {
    const keep = this.recalibrating && this.approvedModel !== null;
    switch (this.stage) {
      case 'comfort': return ['comfortable', 'record-again', 'another-movement'];
      case 'mapping': return ['approve', 'reject'];
      case 'recalibrate-confirm': return ['start-recalibration', 'keep-current'];
      case 'choose': return keep ? ['same-movement', 'keep-current'] : [];
      case 'setup-failed': {
        const kind = this.failure?.kind;
        const list: DecisionId[] = [];
        if (kind === 'cancelled' && keep) list.push('restart-recalibration');
        if (this.baseline && this.choice && kind !== 'baseline' && kind !== 'cancelled') list.push('record-again');
        if (this.baseline) list.push('another-movement');
        if (keep) list.push('keep-current');
        return list;
      }
      default: return [];
    }
  }

  private restrictedScanner(model: GestureModel | null): void {
    const decisions = this.allowedDecisions();
    if (model && decisions.length) this.startScanner(this.decisionTargets(decisions), 'gesture', model);
  }

  private enterChoose(): void {
    this.setStage('choose');
    if (this.recalibrating) this.restrictedScanner(this.approvedModel);
  }

  private enterComfort(): void {
    this.setStage('comfort');
    this.restrictedScanner(this.candidate);
    this.announce('Verified. Is this movement comfortable to repeat?');
  }

  private enterMapping(): void {
    this.setStage('mapping');
    this.restrictedScanner(this.candidate);
    this.announce('Review the mapping: your movement selects the highlighted item.');
  }

  private enterRecalibrateConfirm(): void {
    this.setStage('recalibrate-confirm');
    this.restrictedScanner(this.approvedModel);
  }

  private fail(kind: FailureKind, title: string, reasons: string[]): void {
    const cycle = this.cycles[this.cycles.length - 1];
    if (cycle?.outcome === 'in-progress') cycle.outcome = kind === 'cancelled' ? 'cancelled' : 'failed';
    this.candidate = null;
    this.setStage('setup-failed');
    this.failure = { kind, title, reasons };
    if (this.recalibrating) this.restrictedScanner(this.approvedModel);
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
    this.candidate = null;
    this.trials = [];
    this.cycles.push({ cycle: this.cycles.length + 1, movement: choice.label, training: null, heldOut: [], negative: null, outcome: 'in-progress' });
    this.setStage('training');
    this.trialRecorder = new TrialRecorder();
    this.announce(`Training "${choice.label}": three attempts. Rest, move when prompted and hold, then return to rest.`);
  }

  private approve(): void {
    const cycle = this.cycles[this.cycles.length - 1];
    if (!this.candidate || !cycle || cycle.outcome !== 'verified') return;
    this.approvedModel = this.candidate;
    this.approvedBaseline = this.baseline;
    this.candidate = null;
    cycle.outcome = 'approved';
    this.recalibrating = false;
    this.inputMode = 'gesture';
    this.enterPractice();
    this.announce('Approved. Practice first: selections here are not spoken.');
  }

  private keepCurrent(): void {
    if (!this.approvedModel) return;
    this.closeOpenCycle();
    this.candidate = null;
    this.trials = [];
    this.baseline = this.approvedBaseline;
    this.choice = { feature: this.approvedModel.feature, direction: this.approvedModel.direction, label: this.approvedModel.label };
    this.recalibrating = false;
    this.enterCommunication();
    this.announce('Kept your current setup. Return to rest before selecting.');
  }

  /** Setup decision from a scanned gesture or a conventional button; ignored if not offered now. */
  decide(id: DecisionId): void {
    if (!this.allowedDecisions().includes(id)) return;
    switch (id) {
      case 'comfortable': this.enterMapping(); break;
      case 'record-again': if (this.choice) this.startTraining(this.choice); break;
      case 'another-movement': this.closeOpenCycle(); this.candidate = null; this.enterChoose(); break;
      case 'approve': this.approve(); break;
      case 'reject': {
        const cycle = this.cycles[this.cycles.length - 1];
        if (cycle) cycle.outcome = 'rejected';
        this.fail('rejected', 'Movement not approved', ['You chose not to use this movement. Nothing was changed.']);
        break;
      }
      case 'start-recalibration': this.recalibrating = true; this.beginBaseline(); break;
      case 'restart-recalibration': this.beginBaseline(); break;
      case 'keep-current': this.keepCurrent(); break;
      case 'same-movement':
        if (this.approvedModel) this.startTraining({ feature: this.approvedModel.feature, direction: this.approvedModel.direction, label: this.approvedModel.label });
        break;
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
    this.setStage('baseline');
    this.baselineRecorder = new BaselineRecorder(CAPTURE_TIMING.baselineMs);
    this.announce('Rest comfortably for ten seconds.');
  }

  chooseMovement(choice: MovementChoice): void {
    if ((this.stage !== 'choose' && this.stage !== 'setup-failed') || !this.baseline) return;
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
    if (this.recalibrating) this.baseline = this.approvedBaseline;
    this.recalibrating = false;
    this.inputMode = 'assisted';
    this.enterCommunication();
    this.announce('Assisted input: press Space to select the highlighted item.');
    this.publish();
  }

  useGesture(): void {
    if (!this.approvedModel) return;
    this.inputMode = 'gesture';
    this.enterCommunication();
    this.announce('Using your movement. Return to rest to begin.');
    this.publish();
  }

  setPhrase(index: number, text: string): boolean {
    const phrase = text.trim();
    if (!['welcome', 'choose', 'setup-failed'].includes(this.stage) || !Number.isInteger(index)
      || index < 0 || index >= this.phrases.length || phrase.length < 1 || phrase.length > 60) return false;
    this.phrases[index] = phrase;
    this.publish();
    return true;
  }

  setSpokenPrompts(enabled: boolean): void {
    this.spokenPrompts = enabled;
    this.publish();
  }

  // ── Scanning and communication ───────────────────────────────────────────

  private phraseFor(id: string): string | undefined {
    const match = /^phrase:(\d+)$/.exec(id);
    return match ? this.phrases[Number(match[1])] : undefined;
  }

  private enterPractice(): void {
    this.setStage('practice');
    this.practice = { selections: 0, last: null };
    const targets: ScanTarget[] = [
      ...this.phrases.map((label, index) => ({ id: `phrase:${index}`, label, kind: 'phrase' as const })),
      { id: 'finish-practice', label: CONTROL_LABELS['finish-practice']!, kind: 'control' },
    ];
    this.startScanner(targets, this.inputMode === 'assisted' ? 'assisted' : 'gesture', this.approvedModel);
  }

  private enterCommunication(): void {
    this.setStage('communication');
    const controls = this.inputMode === 'assisted'
      ? ['speak', 'clear', 'pause', 'slower', 'faster', 'practice', this.approvedModel ? 'use-gesture' : 'setup-gesture']
      : ['speak', 'clear', 'pause', 'slower', 'faster', 'practice', 'recalibrate'];
    const targets: ScanTarget[] = [
      ...this.phrases.map((label, index) => ({ id: `phrase:${index}`, label, kind: 'phrase' as const })),
      ...controls.map((id) => ({ id, label: CONTROL_LABELS[id]!, kind: 'control' as const })),
    ];
    this.startScanner(targets, this.inputMode === 'assisted' ? 'assisted' : 'gesture', this.approvedModel);
  }

  private driveScanner(frame: FeatureFrame, nowMs: number): void {
    const scanner = this.scanner;
    if (!scanner || this.scanDriver !== 'gesture') return;
    if (!this.runtime || frame.tracking !== 'tracked') {
      // Fail closed: discard any pending dwell and latch, freeze timing, and require fresh neutral later.
      this.runtime?.invalidate();
      scanner.cancelSelection(nowMs);
      scanner.setSuspended(true, nowMs);
      return;
    }
    scanner.setSuspended(false, nowMs);
    const update = this.runtime.step(frame, nowMs);
    if (update.started) scanner.beginSelection(nowMs);
    if (update.cancelled) scanner.cancelSelection(nowMs);
    if (update.event) {
      if (scanner.snapshot.paused) { this.resumeScan(nowMs); return; }
      const target = scanner.commitSelection(nowMs);
      if (target) this.activate(target, nowMs);
      return;
    }
    scanner.tick(nowMs);
  }

  private resumeScan(nowMs: number): void {
    this.scanner?.setPaused(false, nowMs);
    this.announce('Resumed.');
  }

  private activate(id: string, nowMs: number): void {
    if (Object.hasOwn(DECISION_LABELS, id)) { this.decide(id as DecisionId); return; }
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
      case 'pause':
        this.scanner?.setPaused(true, nowMs);
        this.announce(this.inputMode === 'assisted' ? 'Paused. Press Space to resume.' : 'Paused. Make your movement to resume.');
        break;
      case 'slower': this.changeInterval(SESSION_LIMITS.scanStepMs, nowMs); break;
      case 'faster': this.changeInterval(-SESSION_LIMITS.scanStepMs, nowMs); break;
      case 'practice': this.enterPractice(); this.announce('Practice: selections are not spoken.'); break;
      case 'recalibrate': if (this.approvedModel && this.inputMode === 'gesture') this.enterRecalibrateConfirm(); break;
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
    const base = { interruptions: this.stageInterruptions, notice: this.notice };
    if (this.stage === 'baseline' && this.baselineRecorder) {
      const progress = this.baselineRecorder.progress;
      return { ...base, kind: 'baseline', index: 1, total: 1, prompt: 'Rest', phaseProgress: progress, overallProgress: progress, validMs: this.baselineRecorder.elapsedMs };
    }
    if ((this.stage === 'training' || this.stage === 'verify') && this.trialRecorder) {
      const status = this.trialRecorder.status();
      const cycle = this.cycles[this.cycles.length - 1];
      const training = this.stage === 'training';
      return { ...base, kind: training ? 'training' : 'verification',
        index: (training ? this.trials.length : cycle?.heldOut.length ?? 0) + 1,
        total: training ? SESSION_LIMITS.trainingTrials : SESSION_LIMITS.heldOutAttempts,
        prompt: status.prompt, phaseProgress: status.phaseProgress, overallProgress: status.overallProgress, validMs: status.elapsedMs };
    }
    if (this.stage === 'negative' && this.negativeMonitor) {
      const progress = Math.min(1, this.negativeMonitor.armedMs / CAPTURE_TIMING.negativeMs);
      return { ...base, kind: 'negative', index: 1, total: 1, prompt: 'Everyday activity', phaseProgress: progress,
        overallProgress: progress, validMs: this.negativeMonitor.armedMs, interruptions: this.negativeMonitor.restarts };
    }
    return null;
  }

  private publish(): void {
    const scanner = this.scanner?.snapshot;
    const runtime = this.runtime?.snapshot;
    this.snap = {
      stage: this.stage, camera: this.camera, cameraMessage: this.cameraMessage, tracking: this.tracking,
      frame: this.frame, frameIntervalMs: this.frameIntervalMs, hidden: this.hidden, baseline: this.baseline,
      choice: this.choice, candidate: this.candidate, approvedModel: this.approvedModel, inputMode: this.inputMode,
      recalibrating: this.recalibrating, capture: this.captureStatus(),
      cycles: this.cycles.map((cycle) => ({ ...cycle, heldOut: [...cycle.heldOut] })),
      failure: this.failure, decisions: this.decisionTargets(this.allowedDecisions()),
      scan: scanner ? { targets: this.scanTargets, index: scanner.index, latched: scanner.latchedTarget ?? null, paused: scanner.paused,
        suspended: scanner.suspended, intervalMs: scanner.intervalMs, driver: this.scanDriver } : null,
      runtime: runtime ? { phase: runtime.phase, armed: runtime.armed, neutral: runtime.neutral } : null,
      phrases: [...this.phrases], message: [...this.message], lastSpoken: this.lastSpoken, speech: this.speech.status(),
      spokenPrompts: this.spokenPrompts, practice: { ...this.practice }, announcement: this.announcement,
    };
    for (const listener of this.listeners) listener();
  }
}
