import { useEffect, useRef } from 'react';
import { HelperPanel } from './HelperPanel';
import { Icon } from './Icon';
import { ScanButton, ScanHint } from './ScanBoard';
import type { ViewProps } from './SetupViews';
import type { ParticipantRequestController } from '../features/participant-requests/controller';
import { ParticipantRequestsPanel } from '../features/participant-requests/ParticipantRequestsPanel';
import { RequestStatusLine } from '../features/participant-requests/RequestStatusLine';

/** Visible group tile text: the name with the count as a quiet second line. The accessible name keeps the long form. */
function GroupTileText({ snapshot, id, fallback }: { snapshot: ViewProps['snapshot']; id: string; fallback: string }) {
  const group = snapshot.vocabulary.groups.find((entry) => `group:${entry.id}` === id);
  if (!group) return <span>{fallback}</span>;
  return <span className="group-tile-text"><span>{group.name}</span><span className="tile-count">{group.phrases.length ? `${group.phrases.length} phrase${group.phrases.length === 1 ? '' : 's'}` : 'No phrases yet'}</span></span>;
}

export function CommunicationView({ snapshot, session, requests }: ViewProps & { requests?: ParticipantRequestController | null }) {
  const scan = snapshot.scan;
  const paused = scan?.paused ?? false;
  const activate = (id: string) => session.selectTarget(id);
  const offered = new Set(scan?.targets.map((target) => target.id) ?? []);
  const tiles = scan?.targets.filter((target) => target.kind === 'phrase' || target.kind === 'group') ?? [];
  const nav = scan?.targets.filter((target) => target.kind === 'nav') ?? [];
  const { helperOpen, confirmingClear, confirmingRecalibrate, message, lastSpoken, level } = snapshot;
  const confirmingFavourite = level?.kind === 'confirm';
  const asking = level?.kind === 'ask';
  const panel = helperOpen || confirmingRecalibrate;
  const question = useRef<HTMLParagraphElement>(null);
  const previous = useRef({ helperOpen: false, confirmingClear: false });

  // Focus follows the panel: the question when asking to clear, the Helper button when either closes.
  useEffect(() => {
    const before = previous.current;
    previous.current = { helperOpen, confirmingClear };
    if (confirmingClear && !before.confirmingClear) question.current?.focus();
    else if (!confirmingClear && !helperOpen && (before.confirmingClear || before.helperOpen)) {
      document.querySelector<HTMLElement>('[data-scan-id="more"]')?.focus();
    }
  }, [helperOpen, confirmingClear]);

  const count = `${message.length} phrase${message.length === 1 ? '' : 's'}`;
  const shown = snapshot.speech.available ? 'Last spoken' : 'Shown on screen';
  const where = level?.kind === 'group' && level.group ? `${level.group.name} · ${level.group.phrases} phrase${level.group.phrases === 1 ? '' : 's'}` : asking ? 'Ask caregiver' : 'Main list';
  const pauseCard = (
    <div className="pause-card" role="status">
      <h2>Paused</h2>
      <p>Nothing will be selected. {snapshot.inputMode === 'assisted' ? 'Press Space to resume.' : 'Rest, then make your movement to resume.'}</p>
      <button type="button" className="button button-primary" onClick={() => session.resume()}><Icon name="arrow" />Resume</button>
    </div>
  );

  return (
    <div className="comm-screen">
      <section className="message-bar" aria-label="Message">
        <div className="message-main">
          <div className="message-count">Your message · {count}</div>
          {confirmingClear
            ? <p className="message-ask" ref={question} tabIndex={-1}>Clear the whole message?</p>
            : confirmingFavourite
              ? <p className="message-ask">Save “{level?.confirm}” to Favourites?</p>
              : message.length
                ? <p className="message-text">{message.join('. ')}</p>
                : <p className="message-text message-placeholder">Choose a phrase to start your message.</p>}
          {!confirmingClear && !confirmingFavourite && !message.length && lastSpoken && <p className="message-last">{shown}: “{lastSpoken}”</p>}
        </div>
        <div className="message-actions">
          {confirmingClear && (
            <>
              <ScanButton id="clear-no" snapshot={snapshot} onActivate={activate} disabled={paused}>Keep it</ScanButton>
              <ScanButton id="clear-yes" snapshot={snapshot} onActivate={activate} primary disabled={paused}>Yes, clear it</ScanButton>
            </>
          )}
          {confirmingFavourite && (
            <>
              <ScanButton id="confirm-favourite" snapshot={snapshot} onActivate={activate} primary disabled={paused} label={scan?.targets.find((target) => target.id === 'confirm-favourite')?.label}>Save to Favourites</ScanButton>
              <ScanButton id="cancel-favourite" snapshot={snapshot} onActivate={activate} disabled={paused}>Cancel, do not save</ScanButton>
            </>
          )}
          {!confirmingClear && !confirmingFavourite && !confirmingRecalibrate && (
            <>
              <ScanButton id="speak" snapshot={snapshot} onActivate={activate} primary={message.length > 0} className={message.length ? '' : 'muted'}
                disabled={paused || !offered.has('speak')}><Icon name="voice" />Play</ScanButton>
              <ScanButton id="undo" snapshot={snapshot} onActivate={activate} disabled={paused || !offered.has('undo')} className={message.length ? '' : 'muted'}>Undo</ScanButton>
              {!message.length && lastSpoken && (
                <button type="button" className="button" disabled={paused} onClick={() => session.repeatLast()}>Say it again</button>
              )}
            </>
          )}
        </div>
      </section>
      {requests && !asking && !panel && <RequestStatusLine controller={requests} />}
      {paused && panel && <div className="pause-banner">{pauseCard}</div>}
      <div className="board">
        {panel
          ? <HelperPanel snapshot={snapshot} session={session} requests={requests} />
          : asking && requests
            ? <>
                <h2 className="level-heading">{where}</h2>
                <ParticipantRequestsPanel controller={requests} snapshot={snapshot} onActivate={(id) => session.selectRequest(id)} disabled={paused} />
              </>
            : (
            <>
              {(snapshot.phraseGroups || level?.kind === 'group') && <h2 className="level-heading">{where}</h2>}
              <div className="phrase-grid" role="group" aria-label={level?.kind === 'group' && level.group ? `${level.group.name} phrases` : snapshot.phraseGroups ? 'Phrase groups' : 'Phrases'}>
                {tiles.map((target, index) => (
                  <ScanButton key={target.id} id={target.id} snapshot={snapshot} onActivate={activate} className="phrase-tile" disabled={paused || confirmingClear}
                    label={target.kind === 'group' ? target.label : `Add “${target.label}” to message`}>
                    <span className="phrase-number">{String(index + 1).padStart(2, '0')}</span>
                    {target.kind === 'group' ? <GroupTileText snapshot={snapshot} id={target.id} fallback={target.label} /> : <span>{target.label}</span>}
                  </ScanButton>
                ))}
              </div>
            </>
          )}
        {paused && !panel && <div className="pause-overlay">{pauseCard}</div>}
      </div>
      {!panel && !confirmingClear && !confirmingFavourite && (
        <nav className="comm-bottom" aria-label="Controls">
          <ScanButton id="pause" snapshot={snapshot} onActivate={activate} disabled={paused}><Icon name="pause" />Pause</ScanButton>
          {nav.map((target) => <ScanButton key={target.id} id={target.id} snapshot={snapshot} onActivate={activate} disabled={paused}>{target.label}</ScanButton>)}
          <ScanHint snapshot={snapshot} />
        </nav>
      )}
      {(panel || confirmingClear || confirmingFavourite) && <ScanHint snapshot={snapshot} />}
    </div>
  );
}
