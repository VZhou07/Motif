import { useEffect, useRef } from 'react';
import { HelperPanel } from './HelperPanel';
import { Icon } from './Icon';
import { ScanButton, ScanHint } from './ScanBoard';
import type { ViewProps } from './SetupViews';

const has = (ids: Set<string>, id: string) => ids.has(id);

export function CommunicationView({ snapshot, session }: ViewProps) {
  const scan = snapshot.scan;
  const practice = snapshot.stage === 'practice';
  const paused = scan?.paused ?? false;
  const activate = (id: string) => session.selectTarget(id);
  const offered = new Set(scan?.targets.map((target) => target.id) ?? []);
  const phrases = scan?.targets.filter((target) => target.kind === 'phrase') ?? [];
  const extras = practice ? (scan?.targets.filter((target) => target.kind !== 'phrase' && target.id !== 'finish-practice') ?? []) : [];
  const { helperOpen, confirmingClear, message, lastSpoken } = snapshot;
  const question = useRef<HTMLParagraphElement>(null);
  const previous = useRef({ helperOpen: false, confirmingClear: false });

  // Focus follows the panel: the question when asking to clear, the Helper button when either closes.
  useEffect(() => {
    const before = previous.current;
    previous.current = { helperOpen, confirmingClear };
    if (confirmingClear && !before.confirmingClear) question.current?.focus();
    else if (!confirmingClear && !helperOpen && (before.confirmingClear || before.helperOpen)) {
      document.querySelector<HTMLElement>('[data-scan-id="helper"]')?.focus();
    }
  }, [helperOpen, confirmingClear]);

  const count = practice
    ? `${snapshot.practice.selections} practice selection${snapshot.practice.selections === 1 ? '' : 's'}`
    : `${message.length} phrase${message.length === 1 ? '' : 's'}`;
  const shown = snapshot.speech.available ? 'Last spoken' : 'Shown on screen';

  return (
    <div className="comm-screen">
      <section className="message-bar" aria-label="Message">
        <div className="message-main">
          <div className="message-count">{practice ? `Practice · nothing is spoken · ${count}` : `Your message · ${count}`}</div>
          {confirmingClear
            ? <p className="message-ask" ref={question} tabIndex={-1}>Clear the whole message?</p>
            : practice
              ? <p className="message-text">{snapshot.practice.last ? `Last: “${snapshot.practice.last}”` : 'Try a phrase.'}</p>
              : message.length
                ? <p className="message-text">{message.join('. ')}</p>
                : <p className="message-text message-placeholder">Choose a phrase to start your message.</p>}
          {!practice && !confirmingClear && !message.length && lastSpoken && <p className="message-last">{shown}: “{lastSpoken}”</p>}
        </div>
        <div className="message-actions">
          {confirmingClear && (
            <>
              <ScanButton id="clear-no" snapshot={snapshot} onActivate={activate} disabled={paused}>Keep it</ScanButton>
              <ScanButton id="clear-yes" snapshot={snapshot} onActivate={activate} primary disabled={paused}>Yes, clear it</ScanButton>
            </>
          )}
          {!confirmingClear && !practice && has(offered, 'speak') && (
            <>
              <ScanButton id="speak" snapshot={snapshot} onActivate={activate} primary disabled={paused}><Icon name="voice" />Speak</ScanButton>
              <ScanButton id="undo" snapshot={snapshot} onActivate={activate} disabled={paused}>Undo</ScanButton>
            </>
          )}
          {!confirmingClear && !practice && has(offered, 'repeat') && (
            <ScanButton id="repeat" snapshot={snapshot} onActivate={activate} disabled={paused}>Say it again</ScanButton>
          )}
          {practice && <ScanButton id="finish-practice" snapshot={snapshot} onActivate={activate} primary disabled={paused}>Start talking</ScanButton>}
        </div>
      </section>
      <div className="board">
        {helperOpen && !practice
          ? <HelperPanel snapshot={snapshot} session={session} />
          : (
            <div className="phrase-grid" role="group" aria-label={practice ? 'Practice phrases' : 'Phrases'}>
              {phrases.map((target, index) => (
                <ScanButton key={target.id} id={target.id} snapshot={snapshot} onActivate={activate} className="phrase-tile" disabled={paused || confirmingClear}
                  label={practice ? `Practice: ${target.label}` : `Add “${target.label}” to message`}>
                  <span className="phrase-number">{String(index + 1).padStart(2, '0')}</span><span>{target.label}</span>
                </ScanButton>
              ))}
            </div>
          )}
        {paused && (
          <div className="pause-overlay">
            <div className="pause-card" role="status">
              <h2>Paused</h2>
              <p>Nothing will be selected. {snapshot.inputMode === 'assisted' ? 'Press Space to resume.' : 'Rest, then make your movement to resume.'}</p>
              <button type="button" className="button button-primary" onClick={() => session.resume()}><Icon name="arrow" />Resume</button>
            </div>
          </div>
        )}
      </div>
      {practice && extras.length > 0 && (
        <nav className="comm-bottom" aria-label="Controls">
          {extras.map((target) => <ScanButton key={target.id} id={target.id} snapshot={snapshot} onActivate={activate} disabled={paused}>{target.label}</ScanButton>)}
        </nav>
      )}
      {!practice && !helperOpen && !confirmingClear && (
        <nav className="comm-bottom" aria-label="Controls">
          <ScanButton id="pause" snapshot={snapshot} onActivate={activate} disabled={paused}><Icon name="pause" />Pause</ScanButton>
          <ScanButton id="helper" snapshot={snapshot} onActivate={activate} disabled={paused}>Helper</ScanButton>
          <ScanHint snapshot={snapshot} />
        </nav>
      )}
      {(practice || helperOpen || confirmingClear) && <ScanHint snapshot={snapshot} />}
    </div>
  );
}
