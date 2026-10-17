import { useState, type ReactNode } from 'react';
import { liveDeviation, MOVEMENT_OPTIONS, type MovementOption } from '../app/movements';
import type { MotifSession } from '../app/session';
import type { CapturePrompt, SessionSnapshot } from '../app/types';
import { Icon } from './Icon';
import { AUTO_PROFILE_NAME } from '../app/profiles';
import { SavedProfiles } from './ProfileViews';
import { DecisionList } from './ScanBoard';

export interface ViewProps { snapshot: SessionSnapshot; session: MotifSession }

export function Heading({ eyebrow, title, lead }: { eyebrow: string; title: ReactNode; lead: string }) {
  return <div className="stage-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="lead">{lead}</p></div>;
}

const percent = (value: number) => Math.round(Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100);

export function WelcomeView({ snapshot, session, onStartCamera }: ViewProps & { onStartCamera: () => Promise<boolean> | void }) {
  const running = snapshot.camera === 'running';
  // A saved setup makes Continue the main action; a new setup stays available but is secondary.
  const hasSaved = snapshot.profiles.names.includes(AUTO_PROFILE_NAME);
  return (
    <>
      <Heading eyebrow="A LITTLE MOVEMENT. A WORLD OF POSSIBILITY." title={<>Your movement.<br /><em>Your voice.</em></>}
        lead="A personal way to communicate, built around a movement that feels comfortable to you. No particular smile, blink or head movement is required." />
      <SavedProfiles snapshot={snapshot} session={session} onStartCamera={onStartCamera} />
      <div className="button-row welcome-actions">
        {running
          ? <button type="button" className={`button ${hasSaved ? '' : 'button-primary'}`} onClick={() => session.startBaseline()}>Start the rest check<Icon name="arrow" /></button>
          : <button type="button" className={`button ${hasSaved ? '' : 'button-primary'}`} disabled={snapshot.camera === 'loading'} onClick={() => void onStartCamera()}>
              <Icon name="camera" />{snapshot.camera === 'loading' ? 'Starting camera…' : 'Start camera'}<Icon name="arrow" /></button>}
        <button type="button" className="button button-quiet" onClick={() => session.useAssisted()}>Use assisted input (Space switch) instead</button>
      </div>
      <p className="helper-copy">A helper may assist with camera permission and setup. After your movement is verified and approved, communication, pause, speed and recalibration all work with that movement alone.</p>
      <SetupOptions snapshot={snapshot} session={session} />
      <div className="journey-cards">
        {[['01', 'Settle in', 'Ten quiet seconds so Motif learns your own resting variation.'],
          ['02', 'Find your movement', 'Three practice attempts, two separate checks, and an everyday-activity check.'],
          ['03', 'Make it your voice', 'Approve the control, practice, then build and speak messages.']].map(([number, title, text]) => (
          <div key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></div>
        ))}
      </div>
    </>
  );
}

/** Conventional (helper) settings available during setup: spoken prompts and phrase editing. */
export function SetupOptions({ snapshot, session }: ViewProps) {
  return (
    <details className="settings-card">
      <summary className="field-label">Helper settings: spoken prompts and phrases</summary>
      <label className="text-field" style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16 }}>
        <input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={snapshot.spokenPrompts} disabled={!snapshot.speech.available}
          onChange={(event) => session.setSpokenPrompts(event.target.checked)} />
        Speak setup prompts aloud {snapshot.speech.available ? `(local voice: ${snapshot.speech.voiceName})` : '(no local voice available on this device)'}
      </label>
      <div className="phrase-edit-grid">
        {snapshot.phrases.map((phrase, index) => <PhraseField key={`${index}:${phrase}`} index={index} phrase={phrase} session={session} />)}
      </div>
    </details>
  );
}

function PhraseField({ index, phrase, session }: { index: number; phrase: string; session: MotifSession }) {
  const [draft, setDraft] = useState(phrase);
  return (
    <label className="text-field">Phrase {index + 1}
      <input value={draft} maxLength={60} onChange={(event) => setDraft(event.target.value)}
        onBlur={() => { if (!session.setPhrase(index, draft)) setDraft(phrase); }} />
    </label>
  );
}

const PROMPT_TITLES: Record<CapturePrompt, ReactNode> = {
  Rest: <>Rest <em>comfortably.</em></>,
  Action: <>Make your movement<br /><em>and hold it.</em></>,
  'Everyday activity': <>Be yourself.<br /><em>Move naturally.</em></>,
  'Explore freely': <>Try what feels<br /><em>comfortable.</em></>,
};

export function CaptureView({ snapshot, session }: ViewProps) {
  const capture = snapshot.capture;
  if (!capture) return null;
  const seconds = Math.max(0, Math.ceil(capture.remainingMs / 1_000));
  const nextInstruction = capture.nextPrompt === 'Action' ? 'Next: Action. Stay relaxed until the Action cue.'
    : capture.nextPrompt === 'Rest' ? 'Next: Rest. Relax when the Rest cue appears.' : null;
  const timerLabel = capture.kind === 'negative' ? 'armed seconds remaining'
    : capture.prompt === 'Rest' && capture.nextPrompt === 'Action' ? 'seconds until action'
      : capture.prompt === 'Action' ? 'seconds until rest' : 'seconds in this step';
  const eyebrow = capture.kind === 'baseline' ? 'STEP 1 · YOUR RESTING BASELINE'
    : capture.kind === 'training' ? `MOVEMENT PRACTICE · ${capture.index} OF ${capture.total}`
      : capture.kind === 'verification' ? `SEPARATE CHECK · ${capture.index} OF ${capture.total}`
        : capture.kind === 'discovery' ? 'FINDING YOUR MOVEMENTS' : 'EVERYDAY ACTIVITY CHECK';
  const lead = capture.kind === 'baseline' ? 'Rest in a position that feels natural. Only clear, uninterrupted camera input counts.'
    : capture.kind === 'negative' ? 'Look around, talk or make small ordinary movements — but please avoid your chosen movement. We count any accidental selections.'
      : capture.kind === 'discovery' ? 'Try any movements you can comfortably make, a few times each, holding each for a moment and resting in between. Nothing is selected while exploring.'
      : capture.kind === 'verification' ? 'A new attempt that checks what was learned. It does not change the learned movement.'
        : 'Rest for five seconds, then make and hold your movement during five seconds of Action. Relax when Rest appears.';
  return (
    <>
      <Heading eyebrow={eyebrow} title={PROMPT_TITLES[capture.prompt]} lead={lead} />
      {capture.movement && <p className="status-notice">Movement for this attempt: <strong>{capture.movement}</strong></p>}
      <div className={`recording-card ${capture.prompt === 'Action' ? 'recording-move' : ''}`}>
        <div><span className="recording-dot" /><span>{capture.prompt}</span></div>
        <strong className="timer" aria-hidden="true">{seconds}<small>{timerLabel}</small></strong>
        <progress max={100} value={percent(capture.overallProgress)} aria-label={`${capture.kind} recording progress`} />
      </div>
      {nextInstruction && <p className="helper-copy">{nextInstruction}</p>}
      <p className="helper-copy">
        {capture.kind === 'negative'
          ? `Observed so far: ${(capture.validMs / 1_000).toFixed(1)} s armed. Restarts: ${capture.interruptions}.`
          : `Interruptions this step: ${capture.interruptions}. Communication is off while recording.`}
      </p>
      {capture.notice && <p className="status-notice">{capture.notice}</p>}
      <div className="button-row"><button type="button" className="button button-quiet" onClick={() => session.cancel()}>Stop setup</button></div>
    </>
  );
}

export function ChooseView({ snapshot, session }: ViewProps) {
  const [selected, setSelected] = useState<MovementOption | null>(null);
  const [name, setName] = useState('');
  const regions = [...new Set(MOVEMENT_OPTIONS.map((option) => option.region))];
  // While adding, movements already in the approved set are refused by the session; show that up front.
  const inUse = new Set(snapshot.adding ? snapshot.approvedModels.map((model) => `${model.feature}:${model.direction}`) : []);
  return (
    <>
      <Heading eyebrow="STEP 2 · FIND YOUR MOVEMENT" title={<>A movement that<br /><em>works for you.</em></>}
        lead="Choose any movement you can comfortably repeat and hold until the Rest cue. The number shows how strongly it registers compared with your own rest." />
      <p className="helper-copy">The rhythm alternates: 5 seconds of Rest, then 5 seconds of Action. Stay relaxed during Rest; make and hold your movement during Action. The camera overlay shows what Motif is measuring.</p>
      {(snapshot.recalibrating || snapshot.adding) && <DecisionList snapshot={snapshot} onChoose={(id) => session.chooseSetupTarget(id)} />}
      {snapshot.adding && <p className="status-notice">Adding a movement to: {snapshot.mappingLabel}. Movements you already use cannot be chosen twice.</p>}
      {regions.map((region) => (
        <fieldset className="feature-fieldset" key={region}>
          <legend>{region}</legend>
          <div className="feature-grid">
            {MOVEMENT_OPTIONS.filter((option) => option.region === region).map((option) => {
              const deviation = liveDeviation(snapshot.baseline, snapshot.frame, option.feature, option.direction);
              const key = `${option.feature}:${option.direction}`;
              const used = inUse.has(key);
              return (
                <button key={key} type="button" className="button feature-button" aria-pressed={selected === option} disabled={used}
                  onClick={() => { setSelected(option); setName((current) => (!current.trim() || current === selected?.label ? option.label : current)); }}>
                  {option.label}<span>{used ? 'already in use' : deviation === null ? '—' : `${Math.max(0, deviation).toFixed(1)}× rest`}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
      <label className="text-field">Name for this movement <span>(optional)</span>
        <input value={name} maxLength={60} placeholder={selected ? 'My comfortable movement' : 'Choose a movement above first'} disabled={!selected} onChange={(event) => setName(event.target.value)} />
      </label>
      <div className="button-row">
        <button type="button" className="button" disabled={snapshot.camera !== 'running'} onClick={() => session.startDiscovery()}>Not sure? Find my movements</button>
      </div>
      <div className="button-row">
        <button type="button" className="button button-primary" disabled={!selected || snapshot.camera !== 'running'}
          onClick={() => selected && session.chooseMovement({ feature: selected.feature, direction: selected.direction, label: name.trim() || selected.label })}>
          Record this movement<Icon name="arrow" /></button>
        <button type="button" className="button button-quiet" onClick={() => session.cancel()}>Stop setup</button>
      </div>
      {(!selected || snapshot.camera !== 'running') && (
        <p className="helper-copy" role="status">
          {!selected ? 'Choose a movement above to enable recording. The name is optional.' : 'Waiting for the camera before you can record.'}
        </p>
      )}
      <p className="helper-copy">Next: three practice attempts, two separate checks, then ten seconds of everyday activity. Head-direction labels are calculated from the camera geometry and still need confirmation on real hardware.</p>
      <SetupOptions snapshot={snapshot} session={session} />
    </>
  );
}
