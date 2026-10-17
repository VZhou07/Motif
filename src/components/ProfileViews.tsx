import { useRef, useState } from 'react';
import type { StoreResult } from '../app/profiles';
import type { ViewProps } from './SetupViews';

/** Helper-operated list of saved profiles: Restore (disarmed re-check) and Delete with confirmation (R7). */
export function SavedProfiles({ snapshot, session }: ViewProps) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const { names, rejected, available, readable } = snapshot.profiles;
  // Nothing saved here: say nothing, even if storage is blocked (the Save form explains that when it matters).
  if (!names.length && !rejected && readable) return null;
  const running = snapshot.camera === 'running';
  return (
    <section className="settings-card" aria-labelledby="saved-profiles-heading">
      <h2 id="saved-profiles-heading" className="field-label">Saved on this device</h2>
      <p>Restoring a profile repeats the rest check and re-checks every saved movement. Nothing works until you approve its controls again.{running ? '' : ' Start the camera to restore.'}</p>
      {!available && <p className="status-notice">Saved profiles are not available in this browser (storage is blocked).</p>}
      {!readable && <p className="status-notice">Saved profiles on this device could not be read. Use Delete all to clear them.</p>}
      {rejected > 0 && <p className="status-notice">{rejected} saved profile{rejected === 1 ? '' : 's'} could not be read and {rejected === 1 ? 'was' : 'were'} ignored.</p>}
      <ul className="profile-list">
        {names.map((name) => (
          <li key={name}>
            <strong>{name}</strong>
            {confirming === name
              ? <span className="button-row">
                  <button type="button" className="button" onClick={() => { session.deleteProfile(name); setConfirming(null); }}>Yes, delete “{name}”</button>
                  <button type="button" className="button button-quiet" onClick={() => setConfirming(null)}>Keep it</button>
                </span>
              : <span className="button-row">
                  <button type="button" className="button button-primary" disabled={!running} onClick={() => session.restoreProfile(name)}>Restore “{name}”</button>
                  <button type="button" className="button button-quiet" onClick={() => setConfirming(name)}>Delete “{name}”</button>
                </span>}
          </li>
        ))}
      </ul>
      {confirming === '*'
        ? <div className="button-row">
            <button type="button" className="button" onClick={() => { session.deleteAllProfiles(); setConfirming(null); }}>Yes, delete all saved profiles</button>
            <button type="button" className="button button-quiet" onClick={() => setConfirming(null)}>Keep them</button>
          </div>
        : <button type="button" className="button button-quiet" onClick={() => setConfirming('*')}>Delete all saved profiles</button>}
    </section>
  );
}

/** Opt-in Save of the approved setup; states exactly what is and is not stored. Closes with a visible confirmation once saved. */
export function SaveProfile({ snapshot, session }: ViewProps) {
  const { active, unsaved, available } = snapshot.profiles;
  const [name, setName] = useState(active ?? '');
  const [result, setResult] = useState<StoreResult | null>(null);
  const panel = useRef<HTMLDetailsElement>(null);
  const [saved, setSaved] = useState<string | null>(null);
  if (!snapshot.approvedModels.length) return null;
  const save = (replace: boolean) => {
    const outcome = session.saveProfile(name, replace);
    setResult(outcome);
    setSaved(outcome.ok ? name.trim() : null);
    if (outcome.ok && panel.current) panel.current.open = false;
  };
  return (
    <>
      {saved && !unsaved && <p className="status-notice" role="status">Saved “{saved}” on this device.</p>}
      {active && !unsaved && (
        <div className="button-row">
          <button type="button" className="button" onClick={() => session.returnToStart()}>Done, back to start screen</button>
          <span className="helper-copy">This ends the session. Restore “{active}” there to continue. Within an hour, checks already done are not repeated, so only the same person should restore it.</span>
        </div>
      )}
      <details className="settings-card" ref={panel}>
        <summary className="field-label">Save this setup on this device{active ? ` · “${active}”${unsaved ? ' (changed since saving)' : ''}` : ''}</summary>
        <p>Saved: your movement settings, controls, phrases and scan speed. Never saved: video, camera images, your messages or anything you said. It stays in this browser until you delete it.</p>
        {!available && <p className="status-notice">Saving is not available in this browser (storage is blocked).</p>}
        <label className="text-field">Profile name
          <input value={name} maxLength={40} placeholder="For example: Alex, evenings" onChange={(event) => { setName(event.target.value); setResult(null); setSaved(null); }} />
        </label>
        <div className="button-row">
          <button type="button" className="button button-primary" disabled={!name.trim() || !available} onClick={() => save(false)}>Save on this device</button>
          {result && !result.ok && result.code === 'exists' && (
            <button type="button" className="button" onClick={() => save(true)}>Replace “{name.trim()}”</button>
          )}
        </div>
        {result && !result.ok && <p className="status-notice" role="status">{result.reason}</p>}
      </details>
    </>
  );
}
