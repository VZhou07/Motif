import { useState } from 'react';
import type { ControlAction } from '../app/mapping';
import { describeEvidence } from '../app/scoring';
import type { CycleEvidence, SessionSnapshot } from '../app/types';
import { Icon } from './Icon';
import { SavedProfiles } from './ProfileViews';
import { DecisionList } from './ScanBoard';
import { Heading, type ViewProps } from './SetupViews';

const seconds = (ms: number) => `${(ms / 1_000).toFixed(1)} s`;

function cycleSummary(cycle: CycleEvidence): string[] {
  if (cycle.quick) return ['Saved setup: checks that passed within the last hour were not repeated. The movement was not re-checked.'];
  const lines = [cycle.source === 'restored'
    ? 'Training: none — saved movements are re-checked unchanged'
    : `Training: ${cycle.training === null ? 'not finished' : cycle.training.ok ? 'learned from 3 attempts' : `not learned — ${cycle.training.reasons[0] ?? ''}`}`];
  const kinds = { 'cross-check': (label: string) => `cross-check: “${label}” still works`, 'held-out': (label: string) => `new attempt: “${label}”`,
    recheck: (label: string) => `re-check of saved “${label}”` };
  cycle.heldOut.forEach((attempt) => lines.push(`Check ${attempt.attempt} (${kinds[attempt.kind](attempt.expected)}): ${attempt.passed ? 'passed' : 'did not pass'} — ${attempt.eventCount} recognition${attempt.eventCount === 1 ? '' : 's'}${attempt.passed ? '' : `; ${attempt.reasons[0] ?? ''}`}`));
  if (cycle.negative) {
    lines.push(`Everyday activity: ${cycle.negative.eventCount} accidental selection${cycle.negative.eventCount === 1 ? '' : 's'} in ${seconds(cycle.negative.validDurationMs)} armed; ${cycle.negative.restarts} restart${cycle.negative.restarts === 1 ? '' : 's'}`);
  }
  return lines;
}

/** Every setup cycle stays visible, including failed or cancelled ones (R5 B4). */
export function EvidencePanel({ snapshot }: { snapshot: SessionSnapshot }) {
  if (!snapshot.cycles.length) return null;
  return (
    <details className="settings-card">
      <summary className="field-label">Setup evidence from this session ({snapshot.cycles.length} attempt{snapshot.cycles.length === 1 ? '' : 's'})</summary>
      <p>Observations from this short session only — not a measure of future or general accuracy.</p>
      {snapshot.approvedModels.length > 0 && (
        <ul className="movement-evidence" aria-label="Your movements">
          {snapshot.evidence.filter((item) => snapshot.approvedModels.some((model) => model.id === item.id)).map((item) => (
            <li key={item.id}><strong>{item.label}</strong><ul>{describeEvidence(item).map((line) => <li key={line}>{line}</li>)}</ul></li>
          ))}
        </ul>
      )}
      <ol>
        {snapshot.cycles.map((cycle) => (
          <li key={cycle.cycle}>
            <strong>{cycle.movement}</strong> — {cycle.outcome.replace('-', ' ')}
            <ul>{cycleSummary(cycle).map((line) => <li key={line}>{line}</li>)}</ul>
          </li>
        ))}
      </ol>
    </details>
  );
}

export function FailedView({ snapshot, session }: ViewProps) {
  const failure = snapshot.failure;
  return (
    <>
      <Heading eyebrow="LET'S TAKE ANOTHER LOOK" title={<>No rush.<br /><em>{failure?.title ?? 'We can try again.'}</em></>}
        lead="Nothing was approved from this attempt. You can record again, try another comfortable movement, redo the rest check, or use assisted input." />
      {failure && <div className="error-banner" role="alert"><strong>What we observed</strong>{failure.reasons.map((reason) => <p key={reason}>{reason}</p>)}</div>}
      <DecisionList snapshot={snapshot} onChoose={(id) => session.chooseSetupTarget(id)} />
      <div className="button-row" style={{ marginTop: 16 }}>
        {failure?.kind === 'discovery' && <button type="button" className="button" onClick={() => session.startDiscovery()}>Look for movements again</button>}
        <button type="button" className="button" onClick={() => session.startBaseline()}><Icon name="refresh" />Redo the rest check</button>
        <button type="button" className="button button-quiet" onClick={() => session.useAssisted()}>Use assisted input (Space switch)</button>
      </div>
      {!snapshot.approvedModels.length && <SavedProfiles snapshot={snapshot} session={session} />}
      <EvidencePanel snapshot={snapshot} />
    </>
  );
}

export function ComfortView({ snapshot, session }: ViewProps) {
  const cycle = snapshot.cycles[snapshot.cycles.length - 1];
  return (
    <>
      <Heading eyebrow="CHECKING IN WITH YOU" title={<>How does<br /><em>that feel?</em></>}
        lead="The computer checked the signal. You decide whether this is a movement you are comfortable repeating." />
      <div className="result-card">
        <span className="result-icon"><Icon name="check" size={26} /></span>
        <h2>{snapshot.restoring ? `Saved profile “${snapshot.restoring}”` : snapshot.candidate?.label ?? 'Your movement'}</h2>
        <div className="evidence-grid">
          <div><strong>{cycle?.heldOut.filter((attempt) => attempt.passed).length ?? 0} / {cycle?.heldOut.length ?? 0}</strong><span>separate checks passed</span></div>
          <div><strong>{cycle?.negative?.eventCount ?? '—'}</strong><span>accidental selections in {cycle?.negative ? seconds(cycle.negative.validDurationMs) : '—'} of everyday activity</span></div>
        </div>
        <p>Observations from this short session, not a guarantee of future accuracy.</p>
      </div>
      <h2 className="question-heading">Comfortable enough to repeat?</h2>
      <DecisionList snapshot={snapshot} onChoose={(id) => session.chooseSetupTarget(id)} />
      <EvidencePanel snapshot={snapshot} />
    </>
  );
}

export function MappingView({ snapshot, session }: ViewProps) {
  const interval = ((snapshot.scan?.intervalMs ?? 2_000) / 1_000).toFixed(1);
  const label = snapshot.candidate?.label ?? snapshot.approvedModel?.label ?? 'Your movement';
  return (
    <>
      <Heading eyebrow="STEP 3 · MAKE IT YOURS" title={<>Your movements.<br /><em>Your controls.</em></>}
        lead="Pick how your movements control Motif. Choosing here turns nothing on: you approve on the next screen. Nothing is spoken during setup." />
      <div className="mapping-explainer"><Icon name="check" />
        <p>With one movement, choices highlight one at a time every {interval} seconds and <strong>{label}</strong>, held briefly, selects the highlighted choice. With a “moves next” movement the highlight moves only when you make it — there is no timer. Rest briefly between movements.</p>
      </div>
      {snapshot.mappingLabel && <p className="status-notice">Current controls: {snapshot.mappingLabel}</p>}
      {snapshot.recommendation && (
        <div className="result-card" aria-label="Why this is recommended">
          <h2>Why we recommend these controls</h2>
          <ul>{snapshot.recommendation.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
          <p>Based only on what you told us and what was observed in this session. You can pick any option.</p>
        </div>
      )}
      <DecisionList snapshot={snapshot} onChoose={(id) => session.chooseSetupTarget(id)} />
      <CustomControls snapshot={snapshot} session={session} />
    </>
  );
}

export function MappingConfirmView({ snapshot, session }: ViewProps) {
  const pending = snapshot.pendingMapping;
  return (
    <>
      <Heading eyebrow="STEP 3 · CHECK YOUR CONTROLS" title={<>Turn these<br /><em>controls on?</em></>}
        lead="Only Approve turns these controls on. You practice first; nothing is spoken in practice." />
      <div className="result-card">
        <h2>{pending?.label ?? 'No controls chosen yet'}</h2>
        <p>{pending?.mode === 'step'
          ? 'Step by step: no timer. The highlight moves only when you make your “moves next” movement. If no movement is seen for a minute, scanning becomes automatic again.'
          : 'Automatic scanning: choices highlight one at a time and your select movement picks the highlighted one.'}</p>
      </div>
      <DecisionList snapshot={snapshot} onChoose={(id) => session.chooseSetupTarget(id)} />
    </>
  );
}

export function RecalibrateView({ snapshot, session }: ViewProps) {
  return (
    <>
      <Heading eyebrow="RECALIBRATE" title={<>Fresh start,<br /><em>same you.</em></>}
        lead="Recording a new rest check and movement turns communication off until the new movement is verified and approved. You can keep your current setup at every decision point." />
      <DecisionList snapshot={snapshot} onChoose={(id) => session.chooseSetupTarget(id)} />
    </>
  );
}

const ACTION_OPTIONS: Array<[ControlAction | '', string]> = [['', 'Not used'], ['select', 'Selects'], ['next', 'Moves next'], ['previous', 'Moves back'], ['pause', 'Pauses or resumes']];

/** Helper form for any valid combination; it opens the same confirmation step and never arms anything itself. */
function CustomControls({ snapshot, session }: ViewProps) {
  const [choices, setChoices] = useState<Record<string, ControlAction | ''>>({});
  const models = snapshot.setupModels;
  if (models.length < 2) return null;
  const submit = () => session.proposeCustom(Object.fromEntries(Object.entries(choices).filter(([id, action]) => action && models.some((model) => model.id === id))));
  return (
    <details className="settings-card">
      <summary className="field-label">Helper: set controls by hand</summary>
      <p>Choose what each movement does. Exactly one movement selects; moving back needs a movement for moving next. You review before anything turns on.</p>
      {models.map((model) => (
        <label key={model.id} className="text-field">{model.label}
          <select value={choices[model.id] ?? ''} onChange={(event) => setChoices({ ...choices, [model.id]: event.target.value as ControlAction | '' })}>
            {ACTION_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      ))}
      <button type="button" className="button" onClick={submit}>Review these controls</button>
    </details>
  );
}

/** Candidates from free exploration: suggestions only; choosing one starts the usual practice and checks (R9). */
export function DiscoveryResultsView({ snapshot, session }: ViewProps) {
  const result = snapshot.discovery;
  const candidates = result?.candidates ?? [];
  return (
    <>
      <Heading eyebrow="FINDING YOUR MOVEMENTS" title={candidates.length ? <>Movements we<br /><em>noticed.</em></> : <>Nothing clear<br /><em>this time.</em></>}
        lead="These are suggestions from what the camera saw, not proof of what you meant. Choosing one starts the usual practice and checks; nothing works until you approve it." />
      {result?.reason && <p className="status-notice">{result.reason}</p>}
      {candidates.length > 0 && (
        <ul className="movement-evidence" aria-label="Noticed movements">
          {candidates.map((candidate) => (
            <li key={`${candidate.feature}:${candidate.direction}`}>
              <strong>{candidate.label}</strong> — seen {candidate.episodes} times
              {candidate.companions.length > 0 && <> · moves together with: {candidate.companions.map((channel) => channel.label).join(', ')}</>}
              {candidate.alsoMoves.length > 0 && <> · often at the same time as: {candidate.alsoMoves.map((channel) => channel.label).join(', ')}</>}
              {candidate.interferesWith.map((label) => <span key={label}> · may interfere with “{label}” — the cross-check will test this</span>)}
            </li>
          ))}
        </ul>
      )}
      <DecisionList snapshot={snapshot} onChoose={(id) => session.chooseSetupTarget(id)} />
    </>
  );
}

export function TiringView({ snapshot, session }: ViewProps) {
  return (
    <>
      <Heading eyebrow="TAKING CARE OF YOU" title={<>Which movement<br /><em>is tiring?</em></>}
        lead="Choose the movement that is tiring. We will suggest controls that use it less. Nothing changes until you approve." />
      <DecisionList snapshot={snapshot} onChoose={(id) => session.chooseSetupTarget(id)} />
    </>
  );
}
