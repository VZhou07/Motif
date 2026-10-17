import { Icon } from './Icon';
import { PhraseEditor } from './PhraseEditor';
import { EvidencePanel } from './ReviewViews';
import { ScanButton, ScanHint } from './ScanBoard';
import type { ViewProps } from './SetupViews';

export function CommunicationView({ snapshot, session }: ViewProps) {
  const scan = snapshot.scan;
  const practice = snapshot.stage === 'practice';
  const favouriteCount = snapshot.vocabulary.groups[0]?.phrases.length ?? 0;
  const paused = scan?.paused ?? false;
  const activate = (id: string) => session.selectTarget(id);
  const tiles = scan?.targets.filter((target) => target.kind === 'phrase' || target.kind === 'group') ?? [];
  const controls = scan?.targets.filter((target) => target.kind !== 'phrase' && target.kind !== 'group') ?? [];
  const level = snapshot.level;
  const where = level?.kind === 'group' && level.group ? `${level.group.name} · ${level.group.phrases} phrase${level.group.phrases === 1 ? '' : 's'}`
    : level?.kind === 'more' ? 'More options' : level?.kind === 'confirm' ? 'Save to Favourites?' : 'Main list';
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
      <h2 className="level-heading">{where}</h2>
      <nav className="group-tabs" aria-label="Helper shortcuts to phrase groups">
        {[{ id: 'top', label: 'Main list' }, ...snapshot.vocabulary.groups.map((group) => ({ id: group.id, label: group.name }))].map((tab) => {
          const current = tab.id === 'top' ? level?.kind === 'top' : level?.kind === 'group' && level.group?.id === tab.id;
          return (
            <button key={tab.id} type="button" className="button button-quiet" aria-pressed={current} disabled={paused}
              onClick={() => session.openGroup(tab.id)}>{tab.label}</button>
          );
        })}
      </nav>
      {tiles.length > 0 && (
        <div className="phrase-grid" role="group" aria-label={level?.kind === 'group' && level.group ? `${level.group.name} phrases` : 'Phrase groups'}>
          {tiles.map((target, index) => (
            <ScanButton key={target.id} id={target.id} snapshot={snapshot} onActivate={activate} className="phrase-tile" disabled={paused}
              label={target.kind === 'group' ? target.label : practice ? `Practice: ${target.label}` : `Add “${target.label}” to message`}>
              <span className="phrase-number">{String(index + 1).padStart(2, '0')}</span><span>{target.label}</span>
              <Icon name={target.kind === 'group' ? 'arrow' : 'plus'} size={18} />
            </ScanButton>
          ))}
        </div>
      )}
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
      {!practice && (
        <details className="settings-card">
          <summary className="field-label">Edit phrases (helper)</summary>
          {paused
            ? <>
                <p className="helper-copy">{snapshot.approvedModels.length
                  ? 'Changes are kept on this device automatically, with Last setup.'
                  : 'Changes are kept on this device only once a movement setup is approved.'}</p>
                <PhraseEditor vocabulary={snapshot.vocabulary} onEdit={(edit) => session.editVocabulary(edit)} />
              </>
            : <p>Pause scanning first, so nothing can be selected while phrases change. Resume then starts from the main list if anything changed.</p>}
        </details>
      )}
      {!practice && snapshot.inputMode === 'assisted' && !snapshot.approvedModels.length && (
        <div className="button-row">
          <button type="button" className="button" onClick={() => session.returnToStart()}>Done, back to start screen</button>
          <span className="helper-copy">This ends assisted input and clears the message. Nothing is saved.</span>
        </div>
      )}
      {!practice && snapshot.profiles.available && snapshot.approvedModels.length > 0 && <p className="helper-copy">Your setup is saved on this device automatically: movement settings, controls, phrase groups (including {favouriteCount} favourite{favouriteCount === 1 ? '' : 's'}), scan speed and when your checks last passed. Never video, camera images or your messages.</p>}
      {!practice && snapshot.profiles.available && snapshot.approvedModels.length > 0 && snapshot.mapping && (
        <div className="button-row">
          <button type="button" className="button" onClick={() => session.returnToStart()}>Done, back to start screen</button>
          <span className="helper-copy">This ends the session. Continue from the start screen skips checks that passed within the last hour, so only the same person should continue.</span>
        </div>
      )}
      {!practice && <EvidencePanel snapshot={snapshot} />}
    </>
  );
}
