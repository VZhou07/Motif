import { useState } from 'react';
import type { FormEvent } from 'react';
import type { ParticipantRequestController } from './controller';
import { useParticipantRequests } from './ParticipantRequestsPanel';
import './participant-requests.css';

/**
 * Assisted setup: a helper enters the caregiver's single-use invitation on this device.
 * The only identity source is the shared client's authorized snapshot; nothing here can pick a sender.
 */
export function ParticipantPairing({ controller }: { controller: ParticipantRequestController }) {
  const view = useParticipantRequests(controller);
  const [code, setCode] = useState('');
  const busy = view.pairing.busy;
  const state = view.identity.state;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const token = code;
    setCode(''); // never leave the invitation on screen
    if (token.trim()) void controller.pair(token);
  };

  let body;
  if (state === 'not-configured') {
    body = <p>Caregiver requests are not set up on this device. Local communication still works.</p>;
  } else if (state === 'participant') {
    body = (
      <>
        <p className="pairing-identity">This device sends requests as <strong>{view.identity.alias}</strong> to <strong>{view.identity.receiver ?? 'your caregiver'}</strong>.
          {view.identity.stale && ' (last known, not confirmed right now)'}</p>
        <p className="helper-copy">Signing out ends this device's pairing. Your caregiver will need to create a new invitation.</p>
        <button type="button" className="button" disabled={busy} onClick={() => void controller.signOut()}>Sign this device out</button>
      </>
    );
  } else if (state === 'caregiver') {
    body = (
      <>
        <p>Signed in as a caregiver. Sign out before pairing this device for a person.</p>
        <button type="button" className="button" disabled={busy} onClick={() => void controller.signOut()}>Sign out</button>
      </>
    );
  } else if (state === 'connecting' && !view.pairing.error) {
    body = <p>Connecting to the caregiver service…</p>;
  } else {
    body = (
      <form onSubmit={submit}>
        {state === 'revoked' && <p>Your caregiver removed this pairing. Ask for a new invitation.</p>}
        <p>Ask your caregiver for an invitation code, then enter it here. Pairing lets this device send the requests you choose; your camera and movements stay on this device.</p>
        <label className="text-field">Invitation code
          <input value={code} autoComplete="off" spellCheck={false} disabled={busy} onChange={(event) => setCode(event.target.value)} />
        </label>
        <button type="submit" className="button button-primary" disabled={busy || !code.trim()}>{busy ? 'Pairing…' : 'Pair this device'}</button>
      </form>
    );
  }

  return (
    <section className="settings-card" aria-label="Caregiver pairing">
      <h2>Caregiver pairing</h2>
      {view.pairing.error && <p className="pairing-error" role="alert">{view.pairing.error}</p>}
      {body}
    </section>
  );
}
