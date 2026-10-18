import { createContext, useContext, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import './browser-access.css';
import type { BrowserController, ControllerState } from './controller';

const Context = createContext<BrowserController | null>(null);

export function BrowserAccessProvider({ controller, children }: { controller: BrowserController; children: ReactNode }) {
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}
export function useBrowserController(): BrowserController {
  const controller = useContext(Context);
  if (!controller) throw new Error('BrowserControlsPanel needs a BrowserAccessProvider.');
  return controller;
}
function useControllerState(controller: BrowserController): ControllerState {
  return useSyncExternalStore((listener) => controller.subscribe(listener), () => controller.getState(), () => controller.getState());
}

/** Fixed order; Pause and Return are always present so the person can stop or leave. */
export const BROWSER_COMMANDS = [
  { id: 'browser:scroll-down', label: 'Scroll down', hint: 'Moves the page down.' },
  { id: 'browser:scroll-up', label: 'Scroll up', hint: 'Moves the page up.' },
  { id: 'browser:back', label: 'Back', hint: 'Goes to the earlier page.' },
  { id: 'pause', label: 'Pause', hint: 'Stops scanning until you resume.' },
  { id: 'browser:return', label: 'Return to messages', hint: 'Back to your messages and requests.' },
] as const;

export const SUGGESTED_SITES = [
  { label: 'Wikipedia', value: 'https://en.wikipedia.org' },
  { label: 'MDN', value: 'https://developer.mozilla.org' },
  { label: 'Local demo page', value: 'http://localhost:5173' },
] as const;

const STATE_TEXT: Record<ControllerState['phase'], string> = {
  idle: 'Not controlling a web page.',
  binding: 'Looking for the page you are viewing...',
  controlling: 'Controlling a web page.',
};

export function BrowserControlsPanel({ mappingLabel, grantCameraUrl }: { mappingLabel?: string | null; grantCameraUrl?: string }) {
  const controller = useBrowserController();
  const state = useControllerState(controller);
  const [site, setSite] = useState('');
  const [siteMessage, setSiteMessage] = useState<string | null>(null);

  // Permission is requested here, inside a real click/submit by a helper, and nowhere else.
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await controller.allowSite(site);
    setSiteMessage(result.ok ? `Allowed ${result.origin}. Choose Browse a web page on it.` : result.message);
  };

  return (
    <section className="ba-panel" aria-labelledby="ba-heading">
      <h2 id="ba-heading">Browser controls</h2>
      <p className="ba-identity">{state.identity}</p>
      {state.blocked
        ? <p className="ba-status" role="status">Browser control is not available for this account.</p>
        : (
          <>
            <p className="ba-state">{state.phase === 'controlling' && state.origin ? `Controlling ${new URL(state.origin).host}` : STATE_TEXT[state.phase]}</p>
            <p className="ba-status" role="status" aria-live="polite">{state.message ?? 'Choose Browse a web page in your messages to start.'}</p>
            <ol className="ba-list" aria-label="Browser commands">
              {BROWSER_COMMANDS.map((command, index) => (
                <li key={command.id} className={index === BROWSER_COMMANDS.length - 1 ? 'ba-last' : undefined}>
                  <span>{command.label}</span><span className="ba-hint">{command.hint}</span>
                </li>
              ))}
            </ol>
            {mappingLabel ? <p className="ba-mapping">Your controls: {mappingLabel}</p> : null}
          </>
        )}
      <details className="ba-helper">
        <summary>Helper: allow a site</summary>
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="ba-site">Site to allow</label>
          <input id="ba-site" value={site} onChange={(event) => setSite(event.target.value)} placeholder="https://en.wikipedia.org" autoComplete="off" />
          <div className="ba-chips">
            {SUGGESTED_SITES.map((choice) => (
              <button key={choice.value} type="button" className="ba-button" onClick={() => setSite(choice.value)}>{choice.label}</button>
            ))}
          </div>
          <button type="submit" className="ba-button ba-button-primary">Allow this site</button>
          <p className="ba-note" role="status">{siteMessage ?? 'Chrome will ask you to confirm. Only this exact site is allowed. Chrome\'s own pages, the Web Store, PDFs and local files cannot be controlled.'}</p>
        </form>
        {grantCameraUrl ? <p className="ba-note">Camera question not showing? <a href={grantCameraUrl} target="_blank" rel="noreferrer">Open the camera permission page</a>.</p> : null}
      </details>
    </section>
  );
}

/** Shown instead of the app when another Motif window already holds the single runtime lock. */
export function RuntimeNotice() {
  return (
    <div className="ba-notice" role="alert">
      <strong>Motif is already running in another window.</strong>
      <p>Only one Motif window can use the camera. Close the other one, or use it, then reopen this panel.</p>
    </div>
  );
}
