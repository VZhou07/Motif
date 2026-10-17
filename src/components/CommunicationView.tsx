import { useEffect, useRef } from 'react';
import { HelperPanel } from './HelperPanel';
import { Icon } from './Icon';
import { ScanButton, ScanHint } from './ScanBoard';
import type { ViewProps } from './SetupViews';

export function CommunicationView({ snapshot, session }: ViewProps) {
  const scan = snapshot.scan;
  const practice = snapshot.stage === 'practice';
  const paused = scan?.paused ?? false;
  const activate = (id: string) => session.selectTarget(id);
  const offered = new Set(scan?.targets.map((target) => target.id) ?? []);
  const tiles = scan?.targets.filter((target) => target.kind === 'phrase' || target.kind === 'group') ?? [];
  const nav = scan?.targets.filter((target) => target.kind === 'nav') ?? [];
  const extras = practice ? (scan?.targets.filter((target) => target.kind === 'decision') ?? []) : [];
  const { helperOpen, confirmingClear, confirmingRecalibrate, message, lastSpoken, level } = snapshot;
  const confirmingFavourite = level?.kind === 'confirm';
  const panel = !practice && (helperOpen || confirmingRecalibrate);
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

  const count = practice
    ? `${snapshot.practice.selections} practice selection${snapshot.practice.selections === 1 ? '' : 's'}`
    : `${message.length} phrase${message.length === 1 ? '' : 's'}`;
  const shown = snapshot.speech.available ? 'Last spoken' : 'Shown on screen';
  const where = level?.kind === 'group' && level.group ? `${level.group.name} · ${level.group.phrases} phrase${level.group.phrases === 1 ? '' : 's'}` : 'Main list';
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
          <div className="message-count">{practice ? `Practice · nothing is spoken · ${count}` : `Your message · ${count}`}</div>
          {confirmingClear
            ? <p className="message-ask" ref={question} tabIndex={-1}>Clear the whole message?</p>
            : confirmingFavourite
              ? <p className="message-ask">Save “{level?.confirm}” to Favourites?</p>
              : practice
                ? <p className="message-text">{snapshot.practice.last ? `Last: “${snapshot.practice.last}”` : 'Try a phrase.'}</p>
                : message.length
                  ? <p className="message-text">{message.join('. ')}</p>
                  : <p className="message-text message-placeholder">Choose a phrase to start your message.</p>}
          {!practice && !confirmingClear && !confirmingFavourite && !message.length && lastSpoken && <p className="message-last">{shown}: “{lastSpoken}”</p>}
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
          {!practice && !confirmingClear && !confirmingFavourite && !confirmingRecalibrate && (
            <>
              <ScanButton id="speak" snapshot={snapshot} onActivate={activate} primary={message.length > 0} className={message.length ? '' : 'muted'}
                disabled={paused || !offered.has('speak')}><Icon name="voice" />Speak</ScanButton>
              <ScanButton id="undo" snapshot={snapshot} onActivate={activate} disabled={paused || !offered.has('undo')} className={message.length ? '' : 'muted'}>Undo</ScanButton>
              {!message.length && lastSpoken && (
                <button type="button" className="button" disabled={paused} onClick={() => session.repeatLast()}>Say it again</button>
              )}
            </>
          )}
          {practice && <ScanButton id="finish-practice" snapshot={snapshot} onActivate={activate} primary disabled={paused}>Start talking</ScanButton>}
        </div>
      </section>
      {paused && panel && <div className="pause-banner">{pauseCard}</div>}
      <div className="board">
        {panel
          ? <HelperPanel snapshot={snapshot} session={session} />
          : (
            <>
              <h2 className="level-heading">{where}</h2>
              <div className="phrase-grid" role="group" aria-label={level?.kind === 'group' && level.group ? `${level.group.name} phrases` : practice ? 'Practice phrases' : 'Phrase groups'}>
                {tiles.map((target, index) => (
                  <ScanButton key={target.id} id={target.id} snapshot={snapshot} onActivate={activate} className="phrase-tile" disabled={paused || confirmingClear}
                    label={target.kind === 'group' ? target.label : practice ? `Practice: ${target.label}` : `Add “${target.label}” to message`}>
                    <span className="phrase-number">{String(index + 1).padStart(2, '0')}</span><span>{target.label}</span>
                  </ScanButton>
                ))}
              </div>
            </>
          )}
        {paused && !panel && <div className="pause-overlay">{pauseCard}</div>}
      </div>
      {extras.length > 0 && (
        <nav className="comm-bottom" aria-label="Controls">
          {extras.map((target) => <ScanButton key={target.id} id={target.id} snapshot={snapshot} onActivate={activate} disabled={paused}>{target.label}</ScanButton>)}
        </nav>
      )}
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
