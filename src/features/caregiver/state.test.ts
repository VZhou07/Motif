import { describe, expect, it } from 'vitest';
import { STALE_RETENTION_MS } from './model';
import { SESSION_ENDED, SESSION_LOST, initialCore, reduce, viewOf, type Core, type DashboardEvent } from './state';
import { OTHER_GROUP_ID, caregiverAccess, group, iso, person, request, signedOut, snapshot } from './fixtures.test-support';

const offline = (epoch = 1) => signedOut({ epoch, connection: 'offline', error: 'The care service could not be reached.' });
function run(events: DashboardEvent[], core: Core = initialCore()): Core { return events.reduce(reduce, core); }
const at = (snap: ReturnType<typeof snapshot>, mono = 0): DashboardEvent => ({ type: 'snapshot', snapshot: snap, mono });

describe('ready and cold start', () => {
  it('stays loading on the immediate idle snapshot until refresh settles', () => {
    const core = run([at(signedOut())]);
    expect(viewOf(core, 0).kind).toBe('loading');
    expect(viewOf(reduce(core, { type: 'settled' }), 0)).toEqual({ kind: 'signed-out', notice: null });
  });

  it('becomes ready on a non-idle snapshot and shows loading while the client is loading', () => {
    expect(viewOf(run([at(snapshot({ connection: 'loading' }))]), 0).kind).toBe('loading');
    expect(viewOf(run([at(snapshot())]), 0).kind).toBe('board');
  });
});

describe('epochs and replays', () => {
  it('ignores a late snapshot from an older epoch and discards board data on an epoch increase', () => {
    const alex = person('Alex');
    const core = run([at(snapshot({ epoch: 2, participants: [alex], requests: [request(alex)] }))]);
    const late = reduce(core, at(snapshot({ epoch: 1, participants: [], requests: [] })));
    expect(late).toBe(core);
    const bumped = reduce(core, at(snapshot({ epoch: 3, connection: 'loading' })));
    expect(bumped.lastGood).toBeNull();
    expect(bumped.requests.size).toBe(0);
    expect(viewOf(bumped, 0).kind).toBe('loading');
  });

  it('a replayed older revision does not regress a card', () => {
    const alex = person('Alex');
    const sent = request(alex);
    const acked = { ...sent, status: 'acknowledged' as const, revision: 2 };
    const core = run([at(snapshot({ participants: [alex], requests: [acked] })), at(snapshot({ participants: [alex], requests: [sent] }))]);
    const view = viewOf(core, 0);
    expect(view.kind === 'board' && view.board.outstanding.map((o) => o.request.status)).toEqual(['acknowledged']);
  });
});

describe('outages', () => {
  it('keeps the last board, marked offline and stale, on a same-epoch failed refresh', () => {
    const alex = person('Alex');
    const core = run([at(snapshot({ participants: [alex], requests: [request(alex)] }), 1_000), at(offline(), 5_000)]);
    const view = viewOf(core, 9_000);
    expect(view).toMatchObject({ kind: 'board', offline: true, stale: true, secondsSinceUpdate: 8 });
  });

  it('shows unreachable (not the board of anyone) when nothing was retained', () => {
    expect(viewOf(run([at(offline())]), 0)).toEqual({ kind: 'unreachable', message: 'The care service could not be reached.' });
    // a failed sign-in publishes offline in a NEW epoch: nothing old is shown
    const core = run([at(snapshot({ epoch: 1 }), 0), at(offline(2), 10)]);
    expect(viewOf(core, 20).kind).toBe('unreachable');
  });

  it('marks an online board stale after three missed polls', () => {
    const core = run([at(snapshot(), 0)]);
    expect(viewOf(core, 6_000)).toMatchObject({ kind: 'board', stale: false });
    expect(viewOf(core, 6_500)).toMatchObject({ kind: 'board', stale: true, offline: false });
  });

  it('drops the board after the retention cap, anchored to the last online snapshot, and keeps the tracker', () => {
    const alex = person('Alex');
    let core = run([at(snapshot({ participants: [alex], requests: [request(alex)] }), 0)]);
    const tracker = core.session!.tracker;
    core = run([at(offline(), 1_000), at(offline(), 60_000), { type: 'tick', mono: STALE_RETENTION_MS }], core);
    expect(core.dropped).toBe(false);
    core = reduce(core, { type: 'tick', mono: STALE_RETENTION_MS + 1 });
    expect(viewOf(core, STALE_RETENTION_MS + 1)).toEqual({ kind: 'signed-out', notice: SESSION_LOST });
    expect(core.requests.size).toBe(0);
    expect(core.session?.tracker).toBe(tracker);
    // a later online caregiver snapshot simply brings the board back
    core = reduce(core, at(snapshot({ epoch: 2, participants: [alex] }), STALE_RETENTION_MS + 5_000));
    expect(viewOf(core, STALE_RETENTION_MS + 5_000).kind).toBe('board');
  });

  it('a token-refresh epoch bump followed by an offline poll shows nothing old but keeps the tracker', () => {
    const alex = person('Alex');
    let core = run([at(snapshot({ participants: [alex], requests: [request(alex)] }), 0)]);
    const tracker = core.session!.tracker;
    core = reduce(core, at(offline(2), 2_000));
    expect(viewOf(core, 2_000).kind).toBe('unreachable');
    expect(core.requests.size).toBe(0);
    expect(core.session?.tracker).toBe(tracker);
  });

  it('Sign in again drops the board and invites at once but leaves the tracker', () => {
    const alex = person('Alex', { user_id: null });
    let core = run([at(snapshot({ participants: [alex] }), 0), { type: 'invite', id: alex.id, token: 'CODE', expiresAt: iso(600), mono: 0, wall: Date.parse(iso(0)) }]);
    const tracker = core.session!.tracker;
    core = run([at(offline(), 1_000), { type: 'drop' }], core);
    expect(core.invites).toEqual({});
    expect(core.session?.tracker).toBe(tracker);
    expect(viewOf(core, 1_000).kind).toBe('signed-out');
  });
});

describe('caregiver session discard rules', () => {
  const alex = person('Alex');
  const online = (over = {}) => at(snapshot({ participants: [alex], ...over }));

  it('survives offline, loading and an epoch bump within the same group', () => {
    let core = run([online()]);
    const tracker = core.session!.tracker;
    core = run([at(offline()), at(snapshot({ epoch: 2, connection: 'loading' })), at(offline(2)), online({ epoch: 2 })], core);
    expect(core.session?.tracker).toBe(tracker);
  });

  it('is discarded by a genuine sign-out (idle), an online non-caregiver snapshot, or another group', () => {
    const base = run([online()]);
    expect(reduce(base, at(signedOut({ epoch: 2 }))).session).toBeNull();
    const participantView = snapshot({ epoch: 2, access: { ...caregiverAccess(), role: 'participant', group: null } });
    expect(reduce(base, at(participantView)).session).toBeNull();
    const other = reduce(base, at(snapshot({ epoch: 2, access: caregiverAccess({ group: group({ id: OTHER_GROUP_ID }) }) })));
    expect(other.session?.groupId).toBe(OTHER_GROUP_ID);
    expect(other.session?.tracker).not.toBe(base.session!.tracker);
  });

  it('says the session ended only when the caregiver did not sign out deliberately', () => {
    const base = run([online()]);
    expect(viewOf(reduce(base, at(signedOut({ epoch: 2 }))), 0)).toEqual({ kind: 'signed-out', notice: SESSION_ENDED });
    const deliberate = run([{ type: 'expect-sign-out' }, at(signedOut({ epoch: 2 }))], base);
    expect(viewOf(deliberate, 0)).toEqual({ kind: 'signed-out', notice: null });
  });

  it('shows wrong-role and no-group views without any data', () => {
    const participant = run([at(snapshot({ access: { ...caregiverAccess(), role: 'revoked', group: null } }))]);
    expect(viewOf(participant, 0)).toEqual({ kind: 'wrong-role', role: 'revoked' });
    expect(viewOf(run([at(snapshot({ access: caregiverAccess({ group: null }) }))]), 0)).toEqual({ kind: 'no-group' });
  });
});

describe('invitations', () => {
  it('clamps the deadline to ten minutes from receipt and drops it once the person is paired or removed', () => {
    const waiting = person('Alex', { user_id: null });
    let core = run([at(snapshot({ participants: [waiting] }), 0),
      { type: 'invite', id: waiting.id, token: 'CODE', expiresAt: iso(99_999), mono: 500, wall: Date.parse(iso(0)) }]);
    expect(core.invites[waiting.id]?.deadlineMono).toBe(500 + 10 * 60_000);
    expect(reduce(core, at(snapshot({ participants: [waiting] }))).invites[waiting.id]).toBeDefined();
    expect(reduce(core, at(snapshot({ participants: [{ ...waiting, user_id: 'x' }] }))).invites).toEqual({});
    expect(reduce(core, at(snapshot({ participants: [{ ...waiting, revoked_at: iso(1) }] }))).invites).toEqual({});
    core = reduce(core, { type: 'hide-invite', id: waiting.id });
    expect(core.invites).toEqual({});
  });

  it('an invite from a clock-skewed server never gets a negative or unbounded deadline', () => {
    const waiting = person('Alex', { user_id: null });
    const core = run([at(snapshot({ participants: [waiting] }), 0),
      { type: 'invite', id: waiting.id, token: 'CODE', expiresAt: iso(-60), mono: 100, wall: Date.parse(iso(0)) }]);
    expect(core.invites[waiting.id]?.deadlineMono).toBe(100);
  });
});
