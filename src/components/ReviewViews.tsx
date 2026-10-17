import type { CycleEvidence, SessionSnapshot } from '../app/types';
import { Icon } from './Icon';
import { DecisionList } from './ScanBoard';
import { Heading, type ViewProps } from './SetupViews';

const seconds = (ms: number) => `${(ms / 1_000).toFixed(1)} s`;

function cycleSummary(cycle: CycleEvidence): string[] {
  const lines = [`Training: ${cycle.training === null ? 'not finished' : cycle.training.ok ? 'learned from 3 attempts' : `not learned — ${cycle.training.reasons[0] ?? ''}`}`];
  cycle.heldOut.forEach((attempt) => lines.push(`Check ${attempt.attempt}: ${attempt.passed ? 'passed' : 'did not pass'} — ${attempt.eventCount} recognition${attempt.eventCount === 1 ? '' : 's'}${attempt.passed ? '' : `; ${attempt.reasons[0] ?? ''}`}`));
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
      <DecisionList snapshot={snapshot} onDecide={(id) => session.decide(id)} />
      <div className="button-row" style={{ marginTop: 16 }}>
        <button type="button" className="button" onClick={() => session.startBaseline()}><Icon name="refresh" />Redo the rest check</button>
        <button type="button" className="button button-quiet" onClick={() => session.useAssisted()}>Use assisted input (Space switch)</button>
      </div>
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
        <h2>{snapshot.candidate?.label ?? 'Your movement'}</h2>
        <div className="evidence-grid">
          <div><strong>{cycle?.heldOut.filter((attempt) => attempt.passed).length ?? 0} / {cycle?.heldOut.length ?? 0}</strong><span>separate checks passed</span></div>
          <div><strong>{cycle?.negative?.eventCount ?? '—'}</strong><span>accidental selections in {cycle?.negative ? seconds(cycle.negative.validDurationMs) : '—'} of everyday activity</span></div>
        </div>
        <p>Observations from this short session, not a guarantee of future accuracy.</p>
      </div>
      <h2 className="question-heading">Comfortable enough to repeat?</h2>
      <DecisionList snapshot={snapshot} onDecide={(id) => session.decide(id)} />
    </>
  );
}

export function MappingView({ snapshot, session }: ViewProps) {
  const interval = ((snapshot.scan?.intervalMs ?? 2_000) / 1_000).toFixed(1);
  return (
    <>
      <Heading eyebrow="STEP 3 · MAKE IT YOURS" title={<>Your movement.<br /><em>Your control.</em></>}
        lead="Review the control before turning it on. Nothing is spoken during setup." />
      <div className="mapping-explainer"><Icon name="check" />
        <p>Choices highlight one at a time, every {interval} seconds. <strong>{snapshot.candidate?.label}</strong>, held briefly, selects the highlighted choice. After each selection, rest briefly before the next one. Pause, speed and recalibration are choices in the same list.</p>
      </div>
      <DecisionList snapshot={snapshot} onDecide={(id) => session.decide(id)} />
    </>
  );
}

export function RecalibrateView({ snapshot, session }: ViewProps) {
  return (
    <>
      <Heading eyebrow="RECALIBRATE" title={<>Fresh start,<br /><em>same you.</em></>}
        lead="Recording a new rest check and movement turns communication off until the new movement is verified and approved. You can keep your current setup at every decision point." />
      <DecisionList snapshot={snapshot} onDecide={(id) => session.decide(id)} />
    </>
  );
}
