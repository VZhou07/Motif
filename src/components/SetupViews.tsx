import type { ReactNode } from 'react';
import { liveDeviation, MOVEMENT_OPTIONS } from '../app/movements';
import type { MotifSession } from '../app/session';
import type { CapturePrompt, SessionSnapshot } from '../app/types';
import { Icon } from './Icon';
import { PhraseEditor } from './PhraseEditor';
import { AUTO_PROFILE_NAME } from '../app/profiles';
import { SavedProfiles } from './ProfileViews';
import { DecisionList } from './ScanBoard';

export interface ViewProps { snapshot: SessionSnapshot; session: MotifSession }

export function Heading({ eyebrow, title, lead }: { eyebrow: string; title: ReactNode; lead: string }) {
  return <div className="stage-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="lead">{lead}</p></div>;
}

const percent = (value: number) => Math.round(Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100);

export function WelcomeView({ snapshot, session, onStartCamera, onGetStarted }: ViewProps & { onStartCamera: () => Promise<boolean> | void; onGetStarted: () => Promise<boolean> | void }) {
  const running = snapshot.camera === 'running';
  const loading = snapshot.camera === 'loading';
  // A saved setup makes Continue the main action; a new setup stays available but is secondary.
  const hasSaved = snapshot.profiles.names.includes(AUTO_PROFILE_NAME);
  const assisted = <button type="button" className="button button-quiet" onClick={() => session.useAssisted()}>Use assisted input (Space switch)</button>;
  return (
    <div className="start-screen">
      <div className="stage-heading">
        <h1>{hasSaved ? <>Welcome <em>back.</em></> : <>Your movement.<br /><em>Your voice.</em></>}</h1>
        <p className="lead">{hasSaved ? 'Your setup is saved on this device.' : 'Talk using one comfortable movement, such as raising an eyebrow or opening your mouth.'}</p>
      </div>
      {hasSaved
        ? <SavedProfiles snapshot={snapshot} session={session} onStartCamera={onStartCamera}>
            <button type="button" className="button button-quiet" disabled={loading} onClick={() => void onGetStarted()}>
              {loading ? 'Starting camera…' : 'Set up again'}</button>
            {assisted}
          </SavedProfiles>
        : <>
            <div className="start-primary">
              {running
                ? <button type="button" className="button button-primary button-large" onClick={() => void onGetStarted()}>Start the rest check<Icon name="arrow" /></button>
                : <button type="button" className="button button-primary button-large" disabled={loading} onClick={() => void onGetStarted()}>
                    <Icon name="camera" />{loading ? 'Starting camera…' : snapshot.camera === 'error' ? 'Retry camera' : 'Get started'}<Icon name="arrow" /></button>}
              <p className="helper-copy">Takes about 1½ minutes: a short rest, then a few practice tries.</p>
            </div>
            <div className="start-secondary">{assisted}</div>
            {/* Shows only unreadable or blocked saved data, with Delete. */}
            <SavedProfiles snapshot={snapshot} session={session} onStartCamera={onStartCamera} />
          </>}
      <SetupOptions snapshot={snapshot} session={session} />
    </div>
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
      <h2 className="field-label">Phrase groups</h2>
      <p className="helper-copy">Phrases are kept on this device with Last setup once a movement setup is approved. Continue uses the phrases saved with that setup.</p>
      <PhraseEditor vocabulary={snapshot.vocabulary} onEdit={(edit) => session.editVocabulary(edit)} />
    </details>
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
  const regions = [...new Set(MOVEMENT_OPTIONS.map((option) => option.region))];
  // While adding, movements already in the approved set are refused by the session; show that up front.
  const inUse = new Set(snapshot.adding ? snapshot.approvedModels.map((model) => `${model.feature}:${model.direction}`) : []);
  return (
    <>
      <Heading eyebrow="STEP 2 · FIND YOUR MOVEMENT" title={<>A movement that<br /><em>works for you.</em></>}
        lead="Click any movement you can comfortably repeat and hold until the Rest cue; recording starts right away. The number shows how strongly it registers compared with your own rest." />
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
                <button key={key} type="button" className="button feature-button" disabled={used || snapshot.camera !== 'running'}
                  onClick={() => session.chooseMovement({ feature: option.feature, direction: option.direction, label: option.label })}>
                  {option.label}<span>{used ? 'already in use' : deviation === null ? '—' : `${Math.max(0, deviation).toFixed(1)}× rest`}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
      <div className="button-row discovery-row">
        <button type="button" className="button" disabled={snapshot.camera !== 'running'} onClick={() => session.startDiscovery()}>Not sure? Find my movements</button>
      </div>
      <div className="button-row">
        <button type="button" className="button button-quiet" onClick={() => session.cancel()}>Stop setup</button>
      </div>
      {snapshot.camera !== 'running' && <p className="helper-copy" role="status">Waiting for the camera before you can record.</p>}
      <p className="helper-copy">Next: three practice attempts, two separate checks, then ten seconds of everyday activity. Head-direction labels are calculated from the camera geometry and still need confirmation on real hardware.</p>
      <SetupOptions snapshot={snapshot} session={session} />
    </>
  );
}
