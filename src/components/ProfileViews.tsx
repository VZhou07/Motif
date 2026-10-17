import { useState } from 'react';
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

/** Opt-in Save of the approved setup; states exactly what is and is not stored. */
export function SaveProfile({ snapshot, session }: ViewProps) {
  const { active, unsaved, available } = snapshot.profiles;
  const [name, setName] = useState(active ?? '');
  const [result, setResult] = useState<StoreResult | null>(null);
  if (!snapshot.approvedModels.length) return null;
  const save = (replace: boolean) => setResult(session.saveProfile(name, replace));
  return (
    <details className="settings-card">
      <summary className="field-label">Save this setup on this device{active ? ` · “${active}”${unsaved ? ' (changed since saving)' : ''}` : ''}</summary>
      <p>Saved: your movement settings, controls, phrases and scan speed. Never saved: video, camera images, your messages or anything you said. It stays in this browser until you delete it.</p>
      {!available && <p className="status-notice">Saving is not available in this browser (storage is blocked).</p>}
      <label className="text-field">Profile name
        <input value={name} maxLength={40} placeholder="For example: Alex, evenings" onChange={(event) => { setName(event.target.value); setResult(null); }} />
      </label>
      <div className="button-row">
        <button type="button" className="button button-primary" disabled={!name.trim() || !available} onClick={() => save(false)}>Save on this device</button>
        {result && !result.ok && result.code === 'exists' && (
          <button type="button" className="button" onClick={() => save(true)}>Replace “{name.trim()}”</button>
        )}
      </div>
      {result && <p className="status-notice" role="status">{result.ok ? `Saved “${name.trim()}”.` : result.reason}</p>}
    </details>
  );
}
