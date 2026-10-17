import { useState, type ReactNode } from 'react';
import { AUTO_PROFILE_NAME } from '../app/profiles';
import { Icon } from './Icon';
import type { ViewProps } from './SetupViews';

/** The one setup kept on this device: Continue (disarmed re-check) and Delete with confirmation (R7). */
export function SavedProfiles({ snapshot, session, onStartCamera, children }: ViewProps & { onStartCamera?: () => Promise<boolean> | void; children?: ReactNode }) {
  const [confirming, setConfirming] = useState(false);
  const { names, rejected, available, readable, hasBaseline } = snapshot.profiles;
  const saved = names.includes(AUTO_PROFILE_NAME);
  // Nothing saved here: say nothing, even if storage is blocked.
  if (!saved && !rejected && readable) return null;
  const running = snapshot.camera === 'running';
  // From the start screen, Continue turns the camera on first; elsewhere the camera must already be running.
  const canContinue = running || (!!onStartCamera && snapshot.camera !== 'loading');
  const resume = async (quick: boolean) => {
    if (!running && (await onStartCamera?.()) === false) return;
    session.restoreProfile(AUTO_PROFILE_NAME, quick);
  };
  return (
    <section className="saved-setup" aria-labelledby="saved-profiles-heading">
      <h2 id="saved-profiles-heading" className="sr-only">Saved on this device</h2>
      {!available && <p className="status-notice">Saving is not available in this browser (storage is blocked).</p>}
      {!readable && <p className="status-notice">The saved setup on this device could not be read. Delete it to start fresh.</p>}
      {rejected > 0 && <p className="status-notice">{rejected} saved item{rejected === 1 ? '' : 's'} could not be read and {rejected === 1 ? 'was' : 'were'} ignored.</p>}
      {saved && <>
        <button type="button" className="button button-primary button-large" disabled={!canContinue} onClick={() => void resume(true)}>Continue with your last setup<Icon name="arrow" /></button>
        <p className="helper-copy">{hasBaseline ? 'Goes straight to approving your saved controls.' : 'Starts with a 10-second rest check, then you approve your saved controls.'}{canContinue ? '' : ' Start the camera first.'}</p>
      </>}
      <div className="start-secondary">
        {saved && <button type="button" className="button button-quiet" disabled={!canContinue} onClick={() => void resume(false)}>Re-check my movement first</button>}
        {children}
        {confirming
        ? <div className="button-row">
            <button type="button" className="button" onClick={() => { session.deleteAllProfiles(); setConfirming(false); }}>Yes, delete the saved setup</button>
            <button type="button" className="button button-quiet" onClick={() => setConfirming(false)}>Keep it</button>
          </div>
        : <button type="button" className="button button-quiet" onClick={() => setConfirming(true)}>Delete saved setup</button>}
      </div>
    </section>
  );
}
