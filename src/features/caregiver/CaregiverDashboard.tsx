import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { CareError, type CareClient } from '../../care';
import { KIND_LABELS, ageLabel, cleanText, clockLabel, nextAction, type Board, type BoardPerson, type BoardRequest } from './model';
import { createWebAudioSound, type SoundPort, type SoundState } from './sound';
import { useDashboard, systemClock, type DashboardClock } from './useDashboard';
import type { Invite } from './state';
import './caregiver.css';

export interface CaregiverDashboardProps {
  /** The shared, real care client (one per visible control surface). Fixtures belong in tests only. */
  client: CareClient;
  sound?: SoundPort;
  clock?: DashboardClock;
}

const SESSION_CODES = new Set(['session_changed', 'auth_required', 'disposed']);
/** The transport reports every refusal the same way, so the copy never claims what the server did. */
export function actionError(error: unknown): string {
  if (error instanceof CareError && SESSION_CODES.has(error.code)) return 'Your session changed. Check which account is signed in.';
  return 'That action could not be confirmed. It may have been refused or may already have taken effect; showing the latest information.';
}

type Area = 'requests' | 'people' | 'account' | 'group';

export function CaregiverDashboard({ client, sound: soundPort, clock = systemClock }: CaregiverDashboardProps) {
  const { core, view, mono, wall, dispatch } = useDashboard(client, clock);
  const sound = useMemo(() => soundPort ?? createWebAudioSound(), [soundPort]);
  const [soundState, setSoundState] = useState<SoundState>(sound.state);
  const [live, setLive] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Area, string>>>({});
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const inFlight = useRef(new Set<string>());
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  // A failed sign-in briefly looks like an outage in the client's snapshot; the form's own message explains it.
  const [signInFailed, setSignInFailed] = useState(false);
  const wasOffline = useRef(false);

  const board = view.kind === 'board' ? view.board : null;
  const boardVersion = view.kind === 'board' ? view.boardVersion : 0;
  const offline = view.kind === 'board' && view.offline;
  const blocked = view.kind === 'board' && view.stale;

  // One chime and one announcement per applied online snapshot with genuinely new requests (replays never re-alert).
  useEffect(() => {
    if (!board || offline || !core.session) return;
    const fresh = core.session.tracker.observe(board);
    if (!fresh.length) return;
    const first = board.outstanding.find((entry) => entry.request.id === fresh[0]);
    if (soundState === 'on') sound.chime();
    setLive(fresh.length === 1 && first ? `New request: ${KIND_LABELS[first.request.kind]} from ${first.name}.` : `${fresh.length} new requests.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on applied snapshots only
  }, [boardVersion]);

  useEffect(() => {
    if (view.kind !== 'board') return;
    if (wasOffline.current && !view.offline) setLive('Connection restored.');
    wasOffline.current = view.offline;
  }, [view]);

  // Expired codes disappear by themselves.
  useEffect(() => {
    for (const [id, invite] of Object.entries(core.invites)) if (invite.deadlineMono <= mono) dispatch({ type: 'hide-invite', id });
  }, [core.invites, mono, dispatch]);

  // Focus follows the caregiver's own action: the same card's next button, else the list heading.
  useEffect(() => {
    if (!focusKey) return;
    const target = document.querySelector<HTMLElement>(`[data-focus-key="${focusKey}"]`) ?? document.getElementById('cg-requests-heading');
    target?.focus();
    setFocusKey(null);
  }, [focusKey, boardVersion]);

  const setError = (area: Area, message: string | null) => setErrors((current) => {
    const next = { ...current };
    if (message) next[area] = message; else delete next[area];
    return next;
  });

  async function act(key: string, area: Area, task: () => Promise<unknown>, done?: () => void): Promise<void> {
    if (inFlight.current.has(key)) return; // a second click while the first is pending sends nothing
    inFlight.current.add(key);
    setBusy(new Set(inFlight.current));
    setError(area, null);
    try {
      await task();
      done?.();
    } catch (error) {
      setError(area, actionError(error));
      void client.refresh().catch(() => {});
    } finally {
      inFlight.current.delete(key);
      setBusy(new Set(inFlight.current));
    }
  }

  async function enableSound(): Promise<void> {
    const ok = await sound.enable();
    setSoundState(sound.state);
    if (ok && board && core.session) core.session.tracker.baseline(board);
    setLive(ok ? 'Sound on. New requests will chime while this page stays open.' : 'Sound is not available in this browser. New requests still appear here.');
  }
  function disableSound(): void { sound.disable(); setSoundState(sound.state); setLive('Sound off.'); }

  const signOut = () => act('sign-out', 'account', async () => { dispatch({ type: 'expect-sign-out' }); await client.signOut(); });
  const showSignIn = view.kind === 'signed-out' || view.kind === 'unreachable' || (view.kind === 'loading' && signingIn);

  return (
    <main className="cg-dashboard" aria-labelledby="cg-title">
      <h1 id="cg-title" className="cg-title">Caregiver dashboard</h1>
      <p className="cg-note">Requests from people you have paired appear here while this page stays open and visible. This is not an emergency alarm.</p>
      <div className="cg-live" role="status" aria-live="polite">{live}</div>

      {view.kind === 'loading' && !signingIn && <p className="cg-muted">Connecting to the care service…</p>}
      {view.kind === 'signed-out' && view.notice && <p className="cg-alert" role="alert">{view.notice}</p>}
      {view.kind === 'unreachable' && !signInFailed && (
        <section className="cg-panel" aria-labelledby="cg-unreachable">
          <h2 id="cg-unreachable" className="cg-heading">Can't reach the care service</h2>
          <p className="cg-alert" role="alert">{view.message ?? 'The care service could not be reached.'} Requests may be missing until the connection returns.</p>
          <div className="cg-row">
            <button type="button" className="button" onClick={() => void client.refresh().catch(() => {})}>Retry now</button>
            <button type="button" className="button button-quiet" disabled={busy.has('sign-out')} onClick={() => void signOut()}>Sign out</button>
          </div>
        </section>
      )}
      {showSignIn && <SignInForm client={client} onBusy={setSigningIn} onFailed={setSignInFailed} />}
      {view.kind === 'wrong-role' && <WrongRole role={view.role} busy={busy.has('sign-out')} onSignOut={() => void signOut()} error={errors.account} />}
      {view.kind === 'no-group' && (
        <CreateGroup busy={busy.has('create-group')} error={errors.group}
          onCreate={(name) => act('create-group', 'group', () => client.createGroup(name), () => setLive('Care group created.'))} />
      )}
      {view.kind === 'board' && board && (
        <>
          <header className="cg-header">
            <div>
              <p className="cg-muted">Signed in as caregiver · <bdi>{board.groupName}</bdi></p>
              {board.receiverName && board.receiverName !== board.groupName && <p className="cg-muted">Requests go to <bdi>{board.receiverName}</bdi></p>}
              <p className={view.offline || view.stale ? 'cg-badge cg-badge-lost' : 'cg-badge'}>{view.offline || view.stale ? 'Connection lost' : 'Connected'}</p>
            </div>
            <div className="cg-row">
              {soundState === 'on'
                ? <button type="button" className="button" aria-pressed="true" onClick={disableSound}>Sound on (turn off)</button>
                : <button type="button" className="button" onClick={() => void enableSound()}>Enable sound</button>}
              <button type="button" className="button button-quiet" disabled={busy.has('sign-out')} onClick={() => void signOut()}>Sign out</button>
            </div>
          </header>
          {soundState === 'unavailable' && <p className="cg-muted">Sound is not available in this browser. New requests still appear below.</p>}
          {errors.account && <p className="cg-alert" role="alert">{errors.account}</p>}
          {view.stale && (
            <div className="cg-alert cg-banner" role="alert">
              <p>Connection lost. Showing information from {view.secondsSinceUpdate} s ago; new requests may be missing. Actions are paused until the connection returns.</p>
              <div className="cg-row">
                <button type="button" className="button" onClick={() => void client.refresh().catch(() => {})}>Retry now</button>
                <button type="button" className="button button-quiet" onClick={() => dispatch({ type: 'drop' })}>Sign in again</button>
              </div>
            </div>
          )}
          <Requests board={board} wall={wall} busy={busy} blocked={blocked} error={errors.requests}
            onAct={(entry, status) => act(`request:${entry.request.id}`, 'requests',
              () => client.transitionRequest(entry.request.id, entry.request.revision, status),
              () => {
                setLive(`${status === 'acknowledged' ? 'Acknowledged' : 'Completed'}: ${KIND_LABELS[entry.request.kind]} from ${entry.name}.`);
                setFocusKey(status === 'acknowledged' ? `complete:${entry.request.id}` : 'none');
              })} />
          <People board={board} invites={core.invites} mono={mono} busy={busy} blocked={blocked} error={errors.people}
            onAdd={(alias, done) => act('add-person', 'people', () => client.createParticipant(alias), () => { done(); setLive(`Added ${cleanText(alias)}.`); })}
            onInvite={(entry) => act(`invite:${entry.person.id}`, 'people', async () => {
              const invite = await client.createInvite(entry.person.id);
              dispatch({ type: 'invite', id: entry.person.id, token: invite.token, expiresAt: invite.expires_at, mono: clock.mono(), wall: clock.wall() });
            }, () => setLive(`Invitation code created for ${entry.name}. It works once and expires in 10 minutes.`))}
            onHide={(entry) => dispatch({ type: 'hide-invite', id: entry.person.id })}
            onRemove={(entry) => act(`remove:${entry.person.id}`, 'people', () => client.revokeParticipant(entry.person.id), () => setLive(`Removed ${entry.name}.`))}
            onClear={() => act('clear', 'people', () => client.clearGroup(), () => setLive('Everyone was removed and open requests were deleted.'))}
            onCopied={(ok) => setLive(ok ? 'Code copied.' : 'Copying is not available here. Read the code aloud instead.')} />
          <Finished board={board} />
        </>
      )}
    </main>
  );
}

function SignInForm({ client, onBusy, onFailed }: { client: CareClient; onBusy: (busy: boolean) => void; onFailed: (failed: boolean) => void }) {
  const [email, setEmail] = useState('');
  const password = useRef<HTMLInputElement>(null);
  const [error, setErrorState] = useState<string | null>(null);
  const failed = useRef(false);
  const setError = (message: string | null, fromSignIn = false) => {
    setErrorState(message);
    const next = message !== null && fromSignIn;
    if (failed.current !== next) { failed.current = next; onFailed(next); }
  };
  useEffect(() => () => onFailed(false), [onFailed]);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (pending) return;
    const secret = password.current?.value ?? '';
    if (password.current) password.current.value = ''; // never kept in state
    if (!email.trim() || !secret) { setError('Enter the caregiver e-mail and password.'); return; }
    setPending(true); onBusy(true); setError(null);
    try { await client.signIn(email.trim(), secret); }
    catch (cause) { setError(cause instanceof CareError ? cause.message : 'Sign-in could not be completed. Check the account and try again.', true); }
    finally { setPending(false); onBusy(false); }
  }
  return (
    <form className="cg-panel" aria-labelledby="cg-sign-in" onSubmit={(event) => void submit(event)}>
      <h2 id="cg-sign-in" className="cg-heading">Caregiver sign-in</h2>
      <p className="cg-muted">Use the caregiver account you were given. Only people paired with this account appear here.</p>
      <label className="text-field">E-mail
        <input type="email" autoComplete="username" value={email} onChange={(event) => { setEmail(event.target.value); setError(null); }} />
      </label>
      <label className="text-field">Password
        <input ref={password} type="password" autoComplete="current-password" onChange={() => setError(null)} />
      </label>
      {error && <p className="cg-alert" role="alert">{error}</p>}
      <button type="submit" className="button button-primary" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}

function WrongRole({ role, busy, onSignOut, error }: { role: string; busy: boolean; onSignOut: () => void; error?: string }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <section className="cg-panel" aria-labelledby="cg-wrong-role">
      <h2 id="cg-wrong-role" className="cg-heading">This device is not signed in as a caregiver</h2>
      <p>{role === 'revoked' ? 'This device was paired as a person, and that pairing was removed.' : 'This device is set up for a person using Motif, not for a caregiver.'} To use the caregiver dashboard here, sign out of this device first.</p>
      {error && <p className="cg-alert" role="alert">{error}</p>}
      {confirming
        ? <div className="cg-confirm" role="group" aria-label="Confirm sign out">
            <p>This removes this device's pairing. The caregiver must create a new invitation to pair it again.</p>
            <div className="cg-row">
              <button type="button" className="button" disabled={busy} onClick={onSignOut}>Yes, sign out of this device</button>
              <button type="button" className="button button-quiet" onClick={() => setConfirming(false)}>Keep it</button>
            </div>
          </div>
        : <button type="button" className="button" onClick={() => setConfirming(true)}>Sign out of this device</button>}
    </section>
  );
}

function CreateGroup({ busy, error, onCreate }: { busy: boolean; error?: string; onCreate: (name: string) => void }) {
  const [name, setName] = useState('');
  const trimmed = name.trim();
  return (
    <form className="cg-panel" aria-labelledby="cg-create-group" onSubmit={(event) => { event.preventDefault(); if (trimmed) onCreate(trimmed); }}>
      <h2 id="cg-create-group" className="cg-heading">Create your care group</h2>
      <p className="cg-muted">People you pair later receive their own invitation. Names are shown on their devices as who receives their requests.</p>
      <label className="text-field">Group name
        <input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
      </label>
      {error && <p className="cg-alert" role="alert">{error}</p>}
      <button type="submit" className="button button-primary" disabled={busy || !trimmed}>Create group</button>
    </form>
  );
}

const STATUS_TEXT = { sent: 'Waiting — not yet acknowledged', acknowledged: 'Acknowledged — not yet completed' } as const;

function Requests({ board, wall, busy, blocked, error, onAct }: {
  board: Board; wall: number; busy: ReadonlySet<string>; blocked: boolean; error?: string;
  onAct: (entry: BoardRequest, status: 'acknowledged' | 'completed') => void;
}) {
  return (
    <section className="cg-panel" aria-labelledby="cg-requests-heading">
      <h2 id="cg-requests-heading" className="cg-heading" tabIndex={-1}>Open requests ({board.outstanding.length})</h2>
      {error && <p className="cg-alert" role="alert">{error}</p>}
      {!board.outstanding.length && <p className="cg-muted">No open requests.</p>}
      <ul className="cg-list" aria-label="Open requests">
        {board.outstanding.map((entry) => {
          const { request } = entry;
          const action = nextAction(request);
          const kind = KIND_LABELS[request.kind];
          const pending = busy.has(`request:${request.id}`);
          return (
            <li key={request.id} className={request.status === 'sent' ? 'cg-card cg-card-new' : 'cg-card'} data-request-id={request.id}>
              <p className="cg-card-title"><bdi>{entry.name}</bdi> · {kind}{request.status === 'sent' && <span className="cg-new"> New</span>}</p>
              <p className="cg-card-status">{STATUS_TEXT[request.status as 'sent' | 'acknowledged']}</p>
              <p className="cg-muted">Sent {ageLabel(request.created_at, wall)} ago · {clockLabel(request.created_at)}</p>
              {action && (
                <button type="button" className={action === 'acknowledged' ? 'button button-primary' : 'button'}
                  data-focus-key={`${action === 'acknowledged' ? 'acknowledge' : 'complete'}:${request.id}`}
                  aria-label={`${action === 'acknowledged' ? 'Acknowledge' : 'Mark complete'}: ${kind} request from ${entry.name}`}
                  disabled={pending || blocked} onClick={() => onAct(entry, action)}>
                  {pending ? (action === 'acknowledged' ? 'Acknowledging…' : 'Completing…') : action === 'acknowledged' ? 'Acknowledge' : 'Mark complete'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Countdown({ invite, mono }: { invite: Invite; mono: number }) {
  const seconds = Math.max(0, Math.ceil((invite.deadlineMono - mono) / 1_000));
  return <>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</>;
}

function People({ board, invites, mono, busy, blocked, error, onAdd, onInvite, onHide, onRemove, onClear, onCopied }: {
  board: Board; invites: Record<string, Invite>; mono: number; busy: ReadonlySet<string>; blocked: boolean; error?: string;
  onAdd: (alias: string, done: () => void) => void; onInvite: (entry: BoardPerson) => void; onHide: (entry: BoardPerson) => void;
  onRemove: (entry: BoardPerson) => void; onClear: () => void; onCopied: (ok: boolean) => void;
}) {
  const [alias, setAlias] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const trimmed = alias.trim();
  async function copy(token: string): Promise<void> {
    try { await navigator.clipboard.writeText(token); onCopied(true); } catch { onCopied(false); }
  }
  return (
    <section className="cg-panel" aria-labelledby="cg-people-heading">
      <h2 id="cg-people-heading" className="cg-heading">People ({board.people.length})</h2>
      {error && <p className="cg-alert" role="alert">{error}</p>}
      <ul className="cg-list" aria-label="Paired people">
        {board.people.map((entry) => {
          const invite = invites[entry.person.id];
          const id = entry.person.id;
          return (
            <li key={id} className="cg-card">
              <p className="cg-card-title"><bdi>{entry.name}</bdi></p>
              <p className="cg-card-status">{entry.paired ? 'Paired' : 'Waiting for pairing'}</p>
              {!entry.paired && (invite
                ? <div className="cg-invite">
                    <p>Invitation code for <bdi>{entry.name}</bdi> (works once, expires in <Countdown invite={invite} mono={mono} />):</p>
                    <p className="cg-code" aria-label="Invitation code">{invite.token}</p>
                    <div className="cg-row">
                      <button type="button" className="button" onClick={() => void copy(invite.token)}>Copy code</button>
                      <button type="button" className="button button-quiet" onClick={() => onHide(entry)}>Hide code</button>
                    </div>
                  </div>
                : <button type="button" className="button" disabled={blocked || busy.has(`invite:${id}`)} onClick={() => onInvite(entry)}
                    aria-label={`Create invitation for ${entry.name}`}>Create invitation</button>)}
              {removing === id
                ? <div className="cg-confirm" role="group" aria-label={`Confirm removing ${entry.name}`}>
                    <p>Remove <bdi>{entry.name}</bdi>? Their device stops sending requests here and needs a new invitation to pair again.</p>
                    <div className="cg-row">
                      <button type="button" className="button" disabled={blocked || busy.has(`remove:${id}`)} onClick={() => { setRemoving(null); onRemove(entry); }}>Yes, remove <bdi>{entry.name}</bdi></button>
                      <button type="button" className="button button-quiet" onClick={() => setRemoving(null)}>Keep</button>
                    </div>
                  </div>
                : <button type="button" className="button button-quiet" disabled={blocked} onClick={() => setRemoving(id)}
                    aria-label={`Remove ${entry.name}`}>Remove</button>}
            </li>
          );
        })}
      </ul>
      <form className="cg-row cg-add" onSubmit={(event) => { event.preventDefault(); if (trimmed) onAdd(trimmed, () => setAlias('')); }}>
        <label className="text-field">Add a person (name shown to you)
          <input value={alias} maxLength={60} onChange={(event) => setAlias(event.target.value)} />
        </label>
        <button type="submit" className="button" disabled={blocked || !trimmed || busy.has('add-person')}>Add person</button>
      </form>
      {board.removed.length > 0 && (
        <details className="cg-details">
          <summary>Removed people ({board.removed.length})</summary>
          <ul className="cg-list" aria-label="Removed people">
            {board.removed.map((entry) => <li key={entry.person.id} className="cg-card cg-card-quiet"><bdi>{entry.name}</bdi> · removed</li>)}
          </ul>
        </details>
      )}
      {clearing
        ? <div className="cg-confirm" role="group" aria-label="Confirm clearing everything">
            <p>This removes every person from this group and deletes all open requests. Their devices need new invitations.</p>
            <div className="cg-row">
              <button type="button" className="button" disabled={blocked || busy.has('clear')} onClick={() => { setClearing(false); onClear(); }}>Yes, clear everything</button>
              <button type="button" className="button button-quiet" onClick={() => setClearing(false)}>Keep everything</button>
            </div>
          </div>
        : <button type="button" className="button button-quiet" disabled={blocked} onClick={() => setClearing(true)}>Clear everything</button>}
    </section>
  );
}

function Finished({ board }: { board: Board }): ReactNode {
  if (!board.finished.length) return null;
  return (
    <details className="cg-panel cg-details">
      <summary>Recently finished ({board.finished.length})</summary>
      <ul className="cg-list" aria-label="Recently finished requests">
        {board.finished.map(({ request, name }) => (
          <li key={request.id} className="cg-card cg-card-quiet">
            <bdi>{name}</bdi> · {KIND_LABELS[request.kind]} · {request.status === 'completed' ? 'Completed' : 'Cancelled by the person'} · {clockLabel(request.updated_at)}
          </li>
        ))}
      </ul>
    </details>
  );
}
