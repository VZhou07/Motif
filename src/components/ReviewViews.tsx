import { useState } from 'react';
import type { ControlAction } from '../app/mapping';
import { describeEvidence } from '../app/scoring';
import type { CycleEvidence, SessionSnapshot } from '../app/types';
import { Icon } from './Icon';
import { SavedProfiles } from './ProfileViews';
import { DecisionList, ScanButton, ScanHint } from './ScanBoard';
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
    lines.push(`Everyday activity: ${cycle.negative.eventCount} accidental selection${cycle.negative.eventCount === 1 ? '' : 's'} in ${seconds(cycle.negative.validDurationMs)}; paused ${cycle.negative.restarts} time${cycle.negative.restarts === 1 ? '' : 's'}`);
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
  const ids = snapshot.decisions.map((decision) => decision.id);
  // Exactly one main action: record again, else the fix for what failed, else choose another movement.
  const key = ids.includes('record-again') ? 'record-again'
    : failure?.kind === 'baseline' ? 'redo'
      : failure?.kind === 'discovery' ? 'look'
        : ids.includes('another-movement') ? 'another-movement' : 'redo';
  return (
    <>
      <Heading eyebrow="LET'S TAKE ANOTHER LOOK" title={<>No rush.<br /><em>{failure?.title ?? 'We can try again.'}</em></>}
        lead="Nothing was approved from this attempt." />
      {failure && <div className="error-banner" role="alert"><strong>What we observed</strong>{failure.reasons.map((reason) => <p key={reason}>{reason}</p>)}</div>}
      <DecisionList snapshot={snapshot} onChoose={(id) => session.chooseSetupTarget(id)} primaryId={key === 'redo' || key === 'look' ? null : key} />
      <div className="button-row" style={{ marginTop: 16 }}>
        {failure?.kind === 'discovery' && <button type="button" className={`button ${key === 'look' ? 'button-primary' : 'button-quiet'}`} onClick={() => session.startDiscovery()}>Look for movements again</button>}
        <button type="button" className={`button ${key === 'redo' ? 'button-primary' : 'button-quiet'}`} onClick={() => session.startBaseline()}><Icon name="refresh" />Redo the rest check</button>
        <button type="button" className="button button-quiet" onClick={() => session.useAssisted()}>Use assisted input (Space switch)</button>
      </div>
      {!snapshot.approvedModels.length && <SavedProfiles snapshot={snapshot} session={session} quiet />}
      <EvidencePanel snapshot={snapshot} />
    </>
  );
}

/** Locally controlled so a publish per keystroke never remounts it or moves focus; every valid change applies at once. */
function MovementName({ initial, session }: { initial: string; session: ViewProps['session'] }) {
  const [draft, setDraft] = useState(initial);
  const [problem, setProblem] = useState('');
  const check = (value: string) => {
    const result = session.renameMovement(value);
    setProblem(result.ok ? '' : result.reason);
  };
  return (
    <div className="text-field">
      <label htmlFor="movement-name">Name this movement</label>
      <input id="movement-name" value={draft} maxLength={60} aria-describedby="movement-name-status"
        onChange={(event) => { setDraft(event.target.value); if (session.renameMovement(event.target.value).ok) setProblem(''); }}
        onBlur={(event) => check(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); check(event.currentTarget.value); } }} />
      <p id="movement-name-status" role="status" className="helper-copy">{problem}</p>
    </div>
  );
}

export function ComfortView({ snapshot, session }: ViewProps) {
  const cycle = snapshot.cycles[snapshot.cycles.length - 1];
  const preview = snapshot.comfortPreview;
  return (
    <>
      <Heading eyebrow="CHECKING IN WITH YOU" title={<>How does<br /><em>that feel?</em></>}
        lead="The computer checked the signal. You decide whether this is a movement you are comfortable repeating." />
      <div className="result-card">
        <span className="result-icon"><Icon name="check" size={26} /></span>
        <h2>{snapshot.restoring ? 'Your saved setup' : snapshot.candidate?.label ?? 'Your movement'}</h2>
        <div className="evidence-grid">
          <div><strong>{cycle?.heldOut.filter((attempt) => attempt.passed).length ?? 0} / {cycle?.heldOut.length ?? 0}</strong><span>separate checks passed</span></div>
          <div><strong>{cycle?.negative?.eventCount ?? '—'}</strong><span>accidental selections in {cycle?.negative ? seconds(cycle.negative.validDurationMs) : '—'} of everyday activity</span></div>
        </div>
        <p>Observations from this short session, not a guarantee of future accuracy.</p>
      </div>
      <h2 className="question-heading">{preview ? 'Comfortable enough to use?' : 'Comfortable enough to repeat?'}</h2>
      {preview && snapshot.candidate && snapshot.approvedModels.length === 0 && <MovementName initial={snapshot.candidate.label} session={session} />}
      {preview && (
        <div id="comfort-preview" className="mapping-explainer comfort-preview proposal-card-static">
          <h2>{MODE_HEADINGS[preview.mode]}</h2>
          <ControlChips parts={preview.parts} />
          <p>Approving turns on: <strong>{preview.label}</strong>. {preview.mode === 'auto'
            ? 'Choices highlight one at a time on their own, and your held movement selects the highlighted choice. Nothing is spoken until you choose it.'
            : 'The highlight moves only when you make your movement.'} Nothing is on until you approve.
            {snapshot.recalibrating && snapshot.approvedModels.length > 1 ? ' Your other movements will be turned off.' : ''}</p>
        </div>
      )}
      <DecisionList snapshot={snapshot} onChoose={(id) => session.chooseSetupTarget(id)} describedBy={preview ? 'comfort-preview' : undefined} />
      <EvidencePanel snapshot={snapshot} />
    </>
  );
}

const ACTION_WORDS = { select: 'Select', next: 'Move next', previous: 'Move back', pause: 'Pause' } as const;
const MODE_HEADINGS = { auto: 'Automatic: the highlight moves by itself', step: 'Step by step: no timer' } as const;

function ControlChips({ parts }: { parts: Array<{ label: string; action: keyof typeof ACTION_WORDS }> }) {
  return <span className="proposal-chips">{parts.map((part) => <span key={part.label} className="proposal-chip">{part.label}: {ACTION_WORDS[part.action]}</span>)}</span>;
}

export function MappingView({ snapshot, session }: ViewProps) {
  const cards = new Map(snapshot.proposals.map((card) => [card.id, card]));
  const choose = (id: string) => session.chooseSetupTarget(id);
  return (
    <>
      <Heading eyebrow="CHOOSE YOUR CONTROLS" title={<>Your movements.<br /><em>Your controls.</em></>}
        lead="Choose how your movements control Motif. Choosing turns nothing on until you approve." />
      {snapshot.mappingLabel && <p className="status-notice">Current controls: {snapshot.mappingLabel}</p>}
      {snapshot.recommendation && (
        <details className="settings-card">
          <summary className="field-label">Why recommended</summary>
          <ul>{snapshot.recommendation.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
          <p>Based only on what you told us and what was observed in this session. You can pick any option.</p>
        </details>
      )}
      {snapshot.decisions.length > 0 && <ScanHint snapshot={snapshot} />}
      <div className="stacked-actions proposal-list" role="group" aria-label="Choices">
        {snapshot.decisions.map((decision) => {
          const card = cards.get(decision.id);
          if (!card) {
            return <ScanButton key={decision.id} id={decision.id} snapshot={snapshot} onActivate={choose}>{decision.label}</ScanButton>;
          }
          return (
            <ScanButton key={decision.id} id={decision.id} snapshot={snapshot} onActivate={choose} label={decision.label} className="proposal-card">
              <strong>{MODE_HEADINGS[card.mode]}</strong>
              <ControlChips parts={card.parts} />
              {(card.recommended || card.inUse) && (
                <span className="proposal-badges">
                  {card.recommended && <span className="proposal-badge">Recommended</span>}
                  {card.inUse && <span className="proposal-badge">In use now</span>}
                </span>
              )}
            </ScanButton>
          );
        })}
      </div>
      <CustomControls snapshot={snapshot} session={session} />
    </>
  );
}

export function MappingConfirmView({ snapshot, session }: ViewProps) {
  const pending = snapshot.pendingMapping;
  const parts = pending ? snapshot.setupModels.flatMap((model) => { const action = pending.assignments[model.id]; return action ? [{ label: model.label, action }] : []; }) : [];
  return (
    <>
      <Heading eyebrow="CHECK YOUR CONTROLS" title={<>Turn these<br /><em>controls on?</em></>}
        lead="Only Approve turns these controls on. Nothing is spoken when you approve." />
      <div className="result-card proposal-card-static">
        <h2>{pending ? MODE_HEADINGS[pending.mode] : 'No controls chosen yet'}</h2>
        <ControlChips parts={parts} />
        <p>{pending?.mode === 'step' ? 'If no movement is seen for a minute, scanning becomes automatic again.' : 'Your select movement picks the highlighted choice.'}</p>
      </div>
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

/** Candidates from free exploration: suggestions only; choosing one starts the usual recording and checks (R9). */
export function DiscoveryResultsView({ snapshot, session }: ViewProps) {
  const result = snapshot.discovery;
  const candidates = result?.candidates ?? [];
  const choose = (id: string) => session.chooseSetupTarget(id);
  return (
    <>
      <Heading eyebrow="FINDING YOUR MOVEMENTS" title={candidates.length ? <>Movements we<br /><em>noticed.</em></> : <>Nothing clear<br /><em>this time.</em></>}
        lead="Suggestions from what the camera saw, not proof of what you meant. Nothing works until you approve it." />
      {result?.reason && <p className="status-notice">{result.reason}</p>}
      <ScanHint snapshot={snapshot} />
      <div className="stacked-actions" role="group" aria-label="Choices">
        {snapshot.decisions.map((decision) => {
          const main = /^discovered:(\d+)$/.exec(decision.id);
          const candidate = main ? candidates[Number(main[1])] : undefined;
          if (!main || !candidate) return <ScanButton key={decision.id} id={decision.id} snapshot={snapshot} onActivate={choose}>{decision.label}</ScanButton>;
          const notes = [
            candidate.companions.length > 0 ? `moves together with ${candidate.companions.map((channel) => channel.label).join(', ')}` : '',
            candidate.alsoMoves.length > 0 ? `often with ${candidate.alsoMoves.map((channel) => channel.label).join(', ')}` : '',
            ...candidate.interferesWith.map((label) => `may interfere with “${label}”; the cross-check will test this`),
          ].filter(Boolean);
          return (
            <ScanButton key={decision.id} id={decision.id} snapshot={snapshot} onActivate={choose} label={decision.label} className="discovery-choice">
              <strong>{candidate.label}</strong><span>seen {candidate.episodes} times</span>
              {notes.length > 0 && <span className="discovery-note">{notes.join(' · ')}</span>}
            </ScanButton>
          );
        })}
      </div>
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
