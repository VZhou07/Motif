import { useEffect, useRef, useState } from 'react';
import { CameraDiagnostics } from './CameraDiagnostics';
import { SignalDashboard } from './CameraPanel';
import { Icon } from './Icon';
import { EvidencePanel } from './ReviewViews';
import { PhraseEditor } from './PhraseEditor';
import { ScanButton } from './ScanBoard';
import type { ViewProps } from './SetupViews';

const TILES: Record<string, { label: string; text: string }> = {
  'change-controls': { label: 'Change controls', text: 'Choose what each movement does' },
  'add-movement': { label: 'Add a movement', text: 'Use another movement too' },
  recalibrate: { label: 'Recalibrate', text: 'Check your movement again' },
  'setup-gesture': { label: 'Set up a movement', text: 'Choose and check a movement' },
  'use-gesture': { label: 'Use my movement', text: 'Go back to your movement' },
};
const TILE_ORDER = ['change-controls', 'add-movement', 'recalibrate', 'setup-gesture', 'use-gesture'];

/** Everything a helper or the settings need, one level below the communication board. */
export function HelperPanel({ snapshot, session }: ViewProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [diagnostics, setDiagnostics] = useState(false);
  const question = useRef<HTMLParagraphElement>(null);
  const confirming = snapshot.confirmingRecalibrate;
  // Focus: the question while confirming recalibration, the panel heading otherwise (opening, and after No).
  useEffect(() => { (confirming ? question.current : heading.current)?.focus(); }, [confirming]);
  const activate = (id: string) => session.selectTarget(id);
  const offered = new Set(snapshot.scan?.targets.map((target) => target.id) ?? []);
  const tiles = TILE_ORDER.filter((id) => offered.has(id));
  const seconds = ((snapshot.scan?.intervalMs ?? 2_000) / 1_000).toFixed(1);
  const paused = snapshot.scan?.paused ?? false;
  const assisted = snapshot.inputMode === 'assisted';
  const favouriteCount = snapshot.vocabulary.groups[0]?.phrases.length ?? 0;
  return (
    <section className="helper-panel" aria-label="Helper options">
      <div className="helper-head">
        <div>
          <h2 ref={heading} tabIndex={-1}>Helper options</h2>
          <p>For a helper or for settings. Your message is kept. Scan speed: {seconds} s.</p>
        </div>
        {!confirming && <ScanButton id="back" snapshot={snapshot} onActivate={activate} disabled={paused}>Close helper</ScanButton>}
      </div>
      {confirming && (
        <div className="recalibrate-confirm">
          <p className="message-ask" ref={question} tabIndex={-1}>Start recalibration?</p>
          <p className="helper-note">Recalibrating turns communication off until the new movement is approved.</p>
          <div className="helper-row">
            <ScanButton id="recalibrate-no" snapshot={snapshot} onActivate={activate} disabled={paused}>Keep current setup</ScanButton>
            <ScanButton id="recalibrate-yes" snapshot={snapshot} onActivate={activate} primary disabled={paused}>Start recalibration</ScanButton>
            <ScanButton id="pause" snapshot={snapshot} onActivate={activate} disabled={paused}><Icon name="pause" />Pause</ScanButton>
          </div>
        </div>
      )}
      {!confirming && <>
      {tiles.length > 0 && (
        <>
          <h3 className="helper-group">Your controls</h3>
          <div className="helper-tiles" role="group" aria-label="Your controls">
            {tiles.map((id) => (
              <ScanButton key={id} id={id} snapshot={snapshot} onActivate={activate} className="helper-tile" disabled={paused}>
                <strong>{TILES[id]!.label}</strong><span>{TILES[id]!.text}</span>
              </ScanButton>
            ))}
          </div>
        </>
      )}
      <h3 className="helper-group">Scanning and message</h3>
      <div className="helper-row" role="group" aria-label="Scanning and message">
        {['slower', 'faster', 'clear', 'save-favourite', 'say-again', 'practice', 'pause'].filter((id) => offered.has(id)).map((id) => {
          const target = snapshot.scan!.targets.find((candidate) => candidate.id === id)!;
          return (
            <ScanButton key={id} id={id} snapshot={snapshot} onActivate={activate} disabled={paused}>
              {id === 'pause' && <Icon name="pause" />}{target.label}
            </ScanButton>
          );
        })}
      </div>
      {!snapshot.speech.available && <p className="helper-note">No local speech voice is available in this browser. Your message stays visible on screen; Motif never uses a remote voice.</p>}
      {assisted && <p className="helper-note">Assisted mode does not use or verify a facial movement.</p>}
      <details className="helper-details">
        <summary>Jump to a phrase group</summary>
        <nav className="group-tabs" aria-label="Helper shortcuts to phrase groups">
          {[{ id: 'top', label: 'Main list' }, ...snapshot.vocabulary.groups.map((group) => ({ id: group.id, label: group.name }))].map((tab) => (
            <button key={tab.id} type="button" className="button button-quiet" disabled={paused} onClick={() => session.openGroup(tab.id)}>{tab.label}</button>
          ))}
        </nav>
      </details>
      <details className="helper-details">
        <summary>Edit phrases</summary>
        {paused
          ? <>
              <p className="helper-note">{snapshot.approvedModels.length && snapshot.profiles.available
                ? 'Changes are kept on this device automatically, with Last setup.'
                : snapshot.approvedModels.length ? 'This browser cannot keep changes; they last until this page closes.'
                  : 'Changes are kept on this device only once a movement setup is approved.'}</p>
              <PhraseEditor vocabulary={snapshot.vocabulary} onEdit={(edit) => session.editVocabulary(edit)} />
            </>
          : <p className="helper-note">Pause scanning first, so nothing can be selected while phrases change. Resume then starts from the main list if anything changed.</p>}
      </details>
      <div className="helper-details">
        <button type="button" className="helper-toggle" aria-expanded={diagnostics} aria-controls="helper-diagnostics" onClick={() => setDiagnostics(!diagnostics)}>
          <span>Camera diagnostics</span><span aria-hidden="true">{diagnostics ? '−' : '+'}</span>
        </button>
        {diagnostics && (
          <div id="helper-diagnostics">
            <CameraDiagnostics snapshot={snapshot} />
            <SignalDashboard snapshot={snapshot} />
          </div>
        )}
      </div>
      <EvidencePanel snapshot={snapshot} />
      <details className="helper-details">
        <summary>Saving and the start screen</summary>
        {snapshot.profiles.available && <p className="helper-note">Your setup is saved on this device automatically: movement settings, controls, phrase groups (including {favouriteCount} favourite{favouriteCount === 1 ? '' : 's'}), scan speed and when your checks last passed. Never video, camera images or your messages.</p>}
        {assisted && !snapshot.approvedModels.length && (
          <div className="button-row">
            <button type="button" className="button" onClick={() => session.returnToStart()}>Done, back to start screen</button>
            <span className="helper-note">This ends assisted input and clears the message. Nothing is saved.</span>
          </div>
        )}
        {snapshot.profiles.available && snapshot.approvedModels.length > 0 && snapshot.mapping && (
          <div className="button-row">
            <button type="button" className="button" onClick={() => session.returnToStart()}>Done, back to start screen</button>
            <span className="helper-note">This ends the session. Continue from the start screen skips checks that passed within the last hour, so only the same person should continue.</span>
          </div>
        )}
      </details>
      </>}
    </section>
  );
}
