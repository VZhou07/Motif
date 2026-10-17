import { FEATURE_DEFINITIONS, type FeatureId, type GestureModel } from '../domain/types';
import { observeGestures } from '../engine/recognition';
import type { SessionSnapshot } from '../app/types';
import './diagnostics.css';

const runtimeLabels = {
  unarmed: 'Waiting for fresh rest', neutral: 'Resting; rearming', armed: 'Ready',
  pending: 'Confirming movement', held: 'Movement held; relax before another action',
} as const;

function format(value: number | null | undefined, feature?: FeatureId | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${value.toFixed(feature?.startsWith('head') ? 2 : 3)}${feature?.startsWith('head') ? '°' : ''}`;
}

/** Select the actual expected model, including old-movement cross-checks and saved-profile rechecks. */
function currentModel(snapshot: SessionSnapshot): GestureModel | null {
  const failedAttempt = snapshot.failure?.kind === 'verification' ? snapshot.cycles.at(-1)?.heldOut.at(-1) : undefined;
  const id = snapshot.capture?.modelId ?? failedAttempt?.expectedId;
  const models = [...snapshot.setupModels, ...snapshot.approvedModels,
    ...(snapshot.candidate ? [snapshot.candidate] : []), ...(snapshot.diagnosticModel ? [snapshot.diagnosticModel] : [])];
  if (id) return models.find((model) => model.id === id) ?? null;
  if (snapshot.capture?.kind === 'training' || snapshot.failure?.kind === 'training' || snapshot.stage === 'choose') return null;
  return snapshot.candidate ?? snapshot.approvedModel ?? snapshot.diagnosticModel;
}

function trackingBlocker(snapshot: SessionSnapshot): string | null {
  if (snapshot.camera === 'loading') return 'Waiting for the camera to start.';
  if (snapshot.camera === 'error') return snapshot.cameraMessage ?? 'The camera could not start. Retry the camera or use assisted input.';
  if (snapshot.camera !== 'running') return 'Camera is off. Start it to see live measurements.';
  if (snapshot.hidden) return 'This tab is hidden. Recording and controls wait.';
  if (snapshot.tracking === 'multiple') return 'More than one face is visible. Recording and controls wait.';
  if (snapshot.tracking === 'stale') return 'Camera frames are too old or too far apart. Waiting for fresh input.';
  if (snapshot.tracking === 'invalid') return 'A facial measurement was missing or invalid. This input does not count.';
  if (snapshot.tracking !== 'tracked' || snapshot.frame?.tracking !== 'tracked') return 'No clear face is tracked. Check that your face is in view and well lit.';
  return null;
}

export function CameraDiagnostics({ snapshot }: { snapshot: SessionSnapshot }) {
  const capture = snapshot.capture;
  const model = currentModel(snapshot);
  const failedTraining = snapshot.failure?.kind === 'training';
  const report = snapshot.calibrationReport;
  const feature = capture?.feature ?? (failedTraining ? report?.feature : null) ?? model?.feature ?? snapshot.choice?.feature ?? null;
  const direction = capture?.direction ?? (failedTraining ? report?.direction : null) ?? model?.direction ?? snapshot.choice?.direction ?? 1;
  const definition = FEATURE_DEFINITIONS.find((item) => item.id === feature);
  const statistics = feature ? snapshot.baseline?.statistics[feature] : null;
  const center = model?.baselineCenter ?? (failedTraining ? report?.baselineCenter : undefined) ?? statistics?.center;
  const noise = (failedTraining ? report?.noise : undefined) ?? statistics?.noise;
  const blocker = trackingBlocker(snapshot);
  const frame = !blocker ? snapshot.frame : null;
  const value = feature && frame?.tracking === 'tracked' ? frame.values[feature] : undefined;
  const distance = typeof value === 'number' && Number.isFinite(value) && typeof center === 'number'
    ? direction * (value - center) : null;
  const interval = !blocker && snapshot.frameIntervalMs && Number.isFinite(snapshot.frameIntervalMs) && snapshot.frameIntervalMs > 0 ? snapshot.frameIntervalMs : null;
  const observedModels = snapshot.setupModels.length ? snapshot.setupModels : snapshot.approvedModels.length ? snapshot.approvedModels : model ? [model] : [];
  const observation = model && frame?.tracking === 'tracked' ? observeGestures(observedModels, frame) : null;
  let explanation = blocker;
  if (!explanation && feature && (typeof value !== 'number' || !Number.isFinite(value))) explanation = 'The selected signal is unavailable. This input does not count.';
  if (!explanation && !feature) explanation = snapshot.stage === 'baseline' ? 'Recording your resting variation. Keep a comfortable, relaxed position.' : 'Choose a movement after the rest check to see its signal here.';
  if (!explanation && snapshot.failure) explanation = 'Setup is stopped. The recorded reason is shown below.';
  if (!explanation && !model) explanation = 'Recording only. Activation and release thresholds are not learned yet.';
  if (!explanation && observation?.kind === 'uncertain') {
    const anotherMovement = frame && observedModels.some((other) => other.id !== model?.id
      && other.direction * (frame.values[other.feature]! - other.baselineCenter) > other.releaseThreshold);
    explanation = model && distance !== null && distance > 0 && distance < model.activationThreshold && !anotherMovement
      ? 'Below activation. The chosen signal is between rest and action thresholds. No action is confirmed.'
      : 'The signals are between thresholds, moving in the opposite direction, or conflicting. No action is confirmed.';
  }
  if (!explanation && observation?.kind === 'invalid') explanation = 'A signal needed by the recognizer is invalid. No action is confirmed.';
  if (!explanation && model && distance !== null) {
    explanation = Math.abs(distance) <= model.releaseThreshold ? 'Inside the learned rest range. Fresh rest is needed before each action.'
      : distance < model.activationThreshold ? 'Below activation. The chosen signal has not reached its learned action threshold.'
        : `Above activation. A steady ${model.activationMs} ms hold is required; this reading alone does not confirm an action.`;
  }
  const failedAttempt = snapshot.failure?.kind === 'verification' ? snapshot.cycles.at(-1)?.heldOut.at(-1) : null;
  const negative = snapshot.failure?.kind === 'negative' ? snapshot.cycles.at(-1)?.negative : null;
  const failedPhases = report?.phases.filter((phase) => phase.restDistance > report.restLimit) ?? [];
  const largestRest = [...(report?.phases ?? [])].sort((a, b) => b.restDistance - a.restDistance)[0];

  return (
    <section className="camera-diagnostics" aria-label="Live camera diagnostics">
      <div className="diagnostics-heading"><strong>{capture?.prompt ?? (snapshot.failure ? 'Calibration stopped' : 'Camera diagnostics')}</strong>
        {capture && <span aria-hidden="true">{Math.max(0, Math.ceil(capture.remainingMs / 1_000))} s · {capture.index}/{capture.total}</span>}
      </div>
      <p className="diagnostics-tracking">Tracking: {snapshot.tracking}{interval ? ` · ${Math.round(interval)} ms · ${(1_000 / interval).toFixed(1)} fps` : ' · frame rate unavailable'}</p>
      {snapshot.failure && <div className="diagnostics-failure">
        <strong>Why this attempt stopped</strong>
        <ul>{snapshot.failure.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>
        {failedTraining && report && <>
          <p>Recorded measurements, not the live reading:</p>
          {(failedPhases.length ? failedPhases : largestRest ? [largestRest] : []).map((phase) => <p key={`${phase.attempt}:${phase.phase}`}>
            Attempt {phase.attempt} · {phase.phase === 'after' ? 'Rest after Action' : 'Rest before Action'}: {format(phase.restDistance, report.feature)} / rest limit {format(report.restLimit, report.feature)} (90th percentile).
          </p>)}
          <p>Weakest Action: {format(report.weakestMovement, report.feature)} · rest ceiling: {format(report.restCeiling, report.feature)}.</p>
          <p>Separation: {format(report.margin, report.feature)} · needed: {format(report.minimumMargin, report.feature)}.</p>
        </>}
        {failedAttempt && <p>Check {failedAttempt.attempt}: {failedAttempt.eventCount} recognition events; exactly 1 intended event is required.</p>}
        {negative && <p>Everyday check: {negative.eventCount} activation events in {(negative.validDurationMs / 1_000).toFixed(1)} armed seconds.</p>}
      </div>}
      {feature && <>
        <p className="diagnostics-feature"><strong>{capture?.movement ?? model?.label ?? snapshot.choice?.label ?? definition?.label}</strong> · {direction === 1 ? 'increase' : 'decrease'}<span>{definition?.label}</span></p>
        <dl className="diagnostics-values">
          <div><dt>Live, smoothed</dt><dd>{format(value, feature)}</dd></div>
          <div><dt>Resting baseline</dt><dd>{format(center, feature)}</dd></div>
          <div><dt>Resting noise</dt><dd>{format(noise, feature)}</dd></div>
          <div><dt>Toward Action</dt><dd>{format(distance, feature)}</dd></div>
          {model ? <>
            <div><dt>Activate at</dt><dd>{format(model.activationThreshold, feature)}</dd></div>
            <div><dt>Release within ±</dt><dd>{format(model.releaseThreshold, feature)}</dd></div>
          </> : <div className="diagnostics-wide"><dt>Action thresholds</dt><dd>Not learned yet</dd></div>}
        </dl>
      </>}
      <p className="diagnostics-explanation">{explanation}</p>
      {model && snapshot.runtime && <p>Recognizer: {runtimeLabels[snapshot.runtime.phase]}</p>}
      {model && capture && <p>Recording only; the frozen recognizer checks this attempt afterward.</p>}
      {capture?.notice && <p className="diagnostics-warning">{capture.notice}</p>}
      <p className="diagnostics-footnote">Measurements explain the signal; they do not prove an intended movement.</p>
    </section>
  );
}
