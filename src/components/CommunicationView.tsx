import { Icon } from './Icon';
import { SaveProfile } from './ProfileViews';
import { EvidencePanel } from './ReviewViews';
import { ScanButton, ScanHint } from './ScanBoard';
import type { ViewProps } from './SetupViews';

export function CommunicationView({ snapshot, session }: ViewProps) {
  const scan = snapshot.scan;
  const practice = snapshot.stage === 'practice';
  const paused = scan?.paused ?? false;
  const activate = (id: string) => session.selectTarget(id);
  const phrases = scan?.targets.filter((target) => target.kind === 'phrase') ?? [];
  const controls = scan?.targets.filter((target) => target.kind !== 'phrase') ?? [];
  const mode = snapshot.inputMode === 'assisted' ? 'Assisted Space switch' : 'Automatic scanning';
  return (
    <>
      <div className="communication-heading">
        <div>
          <p className="eyebrow">{practice ? 'PRACTICE · NOTHING IS SPOKEN' : 'YOUR COMMUNICATION SPACE'}</p>
          <h1>{practice ? <>Find your <em>flow.</em></> : <>What would you<br /><em>like to say?</em></>}</h1>
        </div>
        <span className={`session-state ${paused ? 'session-paused' : ''}`}><span />{paused ? 'Paused' : mode}</span>
      </div>
      {paused
        ? <div className="status-notice">
            <p>Paused. Nothing will be selected. {snapshot.inputMode === 'assisted' ? 'Press Space to resume.' : 'Rest, then make your movement to resume.'}</p>
            <button type="button" className="button button-primary" onClick={() => session.resume()}><Icon name="arrow" />Resume</button>
          </div>
        : <ScanHint snapshot={snapshot} />}
      <div className="phrase-grid" role="group" aria-label={practice ? 'Practice phrases' : 'Phrases'}>
        {phrases.map((target, index) => (
          <ScanButton key={target.id} id={target.id} snapshot={snapshot} onActivate={activate} className="phrase-tile" disabled={paused}
            label={practice ? `Practice: ${target.label}` : `Add “${target.label}” to message`}>
            <span className="phrase-number">{String(index + 1).padStart(2, '0')}</span><span>{target.label}</span><Icon name="plus" size={18} />
          </ScanButton>
        ))}
      </div>
      {practice
        ? <p className="success-note"><Icon name="check" />{snapshot.practice.selections} practice selection{snapshot.practice.selections === 1 ? '' : 's'}{snapshot.practice.last ? ` · last: “${snapshot.practice.last}”` : ''}. Take your time.</p>
        : (
          <section className="composer" aria-label="Message">
            <div className="composer-heading"><span className="field-label">Your message</span><span>{snapshot.message.length} phrase{snapshot.message.length === 1 ? '' : 's'}</span></div>
            <p className={snapshot.message.length ? 'message-text' : 'message-text message-placeholder'}>
              {snapshot.message.length ? snapshot.message.join('. ') : 'Choose a phrase to start your message.'}
            </p>
            {snapshot.lastSpoken && <p className="speech-note">Last spoken: “{snapshot.lastSpoken}”</p>}
          </section>
        )}
      {!snapshot.speech.available && !practice && (
        <p className="speech-note">No local speech voice is available in this browser. Your message stays visible on screen; Motif never uses a remote voice.</p>
      )}
      <nav className="operation-toolbar" aria-label="Controls">
        {controls.map((target) => (
          <ScanButton key={target.id} id={target.id} snapshot={snapshot} onActivate={activate} disabled={paused}
            primary={target.id === 'speak' || target.id === 'finish-practice'}>
            {target.id === 'speak' && <Icon name="voice" />}{target.id === 'pause' && <Icon name="pause" />}
            {target.id === 'recalibrate' && <Icon name="refresh" />}{target.label}
          </ScanButton>
        ))}
      </nav>
      <p className="helper-copy">Scanning every {((scan?.intervalMs ?? 2_000) / 1_000).toFixed(1)} seconds. {snapshot.inputMode === 'assisted' ? 'Assisted mode does not use or verify a facial movement.' : 'If tracking is lost, scanning waits and nothing is selected.'}</p>
      {!practice && <SaveProfile snapshot={snapshot} session={session} />}
      {!practice && <EvidencePanel snapshot={snapshot} />}
    </>
  );
}
