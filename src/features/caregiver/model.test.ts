import { describe, expect, it } from 'vitest';
import { AlertTracker, ageLabel, boardOf, cleanText, displayNames, mergeRequests, nextAction, scopeToGroup } from './model';
import { OTHER_GROUP_ID, caregiverAccess, group, iso, person, request, snapshot } from './fixtures.test-support';

describe('displayNames', () => {
  it('shows a plain alias for one person and a stable ordinal tag for two or more', () => {
    const solo = person('Alex');
    expect(displayNames([solo]).get(solo.id)).toBe('Alex');
    const a = person('Alex', { created_at: iso(-300) });
    const b = person('Alex', { created_at: iso(-200) });
    const names = displayNames([b, a]);
    expect(names.get(a.id)).toBe('Alex #1');
    expect(names.get(b.id)).toBe('Alex #2');
  });

  it('counts revoked people so removing one never renumbers the others', () => {
    const a = person('Alex', { created_at: iso(-300) });
    const b = person('Alex', { created_at: iso(-200) });
    const c = person('Alex', { created_at: iso(-100) });
    const before = displayNames([a, b, c]).get(c.id);
    const after = displayNames([a, { ...b, revoked_at: iso(0) }, c]).get(c.id);
    expect(before).toBe('Alex #3');
    expect(after).toBe('Alex #3');
  });

  it('removes zero-width and bidi characters and falls back when nothing visible remains', () => {
    expect(cleanText('Al​ex‮')).toBe('Al ex');
    expect(cleanText('  A   B ')).toBe('A B');
    const hidden = person('​‮');
    const other = person('Sam');
    expect(displayNames([hidden, other]).get(hidden.id)).toMatch(/^Unnamed person #\d$/);
  });

  it('caps very long names', () => {
    expect(cleanText('x'.repeat(200)).length).toBe(60);
  });
});

describe('mergeRequests', () => {
  it('never regresses a revision when an older snapshot is replayed', () => {
    const p = person('Alex');
    const sent = request(p);
    const acked = { ...sent, status: 'acknowledged' as const, revision: 2 };
    const first = mergeRequests(new Map(), [acked]);
    const replay = mergeRequests(first, [sent]);
    expect(replay.get(sent.id)?.status).toBe('acknowledged');
    expect(replay.get(sent.id)?.revision).toBe(2);
  });

  it('does not duplicate an id repeated inside one snapshot', () => {
    const r = request(person('Alex'));
    expect(mergeRequests(new Map(), [r, { ...r }]).size).toBe(1);
  });

  it('forgets requests the server no longer reports (cleared group)', () => {
    const r = request(person('Alex'));
    const first = mergeRequests(new Map(), [r]);
    expect(mergeRequests(first, []).size).toBe(0);
  });

  it('lets an equal revision from the newest snapshot win', () => {
    const r = request(person('Alex'));
    const next = { ...r, updated_at: iso(30) };
    expect(mergeRequests(mergeRequests(new Map(), [r]), [next]).get(r.id)?.updated_at).toBe(iso(30));
  });
});

describe('scopeToGroup', () => {
  it('drops participants and requests from another group and requests of unknown people', () => {
    const mine = person('Mine');
    const foreign = person('Foreign', { group_id: OTHER_GROUP_ID });
    const stray = request(person('Nobody'));
    const snap = snapshot({ participants: [mine, foreign], requests: [request(mine), request(foreign), stray] });
    const scoped = scopeToGroup(snap);
    expect(scoped.participants.map((p) => p.alias)).toEqual(['Mine']);
    expect(scoped.requests).toHaveLength(1);
    expect(scoped.requests[0]?.participant_id).toBe(mine.id);
  });

  it('shows nothing for a non-caregiver snapshot', () => {
    const p = person('Alex');
    const snap = snapshot({ access: { ...caregiverAccess(), role: 'participant', group: null }, participants: [p], requests: [request(p)] });
    expect(scopeToGroup(snap)).toEqual({ participants: [], requests: [] });
    expect(boardOf(snap, new Map())).toBeNull();
  });
});

describe('boardOf', () => {
  it('lists waiting requests before acknowledged ones, oldest first, and keeps revoked people out of outstanding', () => {
    const alex = person('Alex');
    const sam = person('Sam');
    const gone = person('Gone', { revoked_at: iso(-10) });
    const late = request(alex, { created_at: iso(-10) });
    const early = request(sam, { created_at: iso(-60) });
    const acked = request(alex, { created_at: iso(-300), status: 'acknowledged', revision: 2 });
    const orphan = request(gone, { created_at: iso(-500) });
    const snap = snapshot({ participants: [alex, sam, gone], requests: [late, early, acked, orphan] });
    const board = boardOf(snap, new Map([late, early, acked, orphan].map((r) => [r.id, r])))!;
    expect(board.outstanding.map((o) => o.request.id)).toEqual([early.id, late.id, acked.id]);
    expect(board.removed.map((p) => p.person.id)).toEqual([gone.id]);
    expect(board.people).toHaveLength(2);
  });

  it('puts only the newest finished requests in the recent list', () => {
    const p = person('Alex');
    const done = Array.from({ length: 14 }, (_, index) => request(p, { status: 'completed', revision: 3, updated_at: iso(index) }));
    const snap = snapshot({ participants: [p], requests: done });
    const board = boardOf(snap, new Map(done.map((r) => [r.id, r])))!;
    expect(board.finished).toHaveLength(10);
    expect(board.finished[0]?.request.updated_at).toBe(iso(13));
  });

  it('cleans group and receiver names', () => {
    const snap = snapshot({ access: caregiverAccess({ group: group({ name: 'Hom​e' }), receiver_name: '‮' }) });
    const board = boardOf(snap, new Map())!;
    expect(board.groupName).toBe('Hom e');
    expect(board.receiverName).toBeNull();
  });
});

describe('ageLabel and nextAction', () => {
  const now = Date.parse(iso(0));
  it('formats ages and clamps clock skew to zero', () => {
    expect(ageLabel(iso(-2), now)).toBe('just now');
    expect(ageLabel(iso(-45), now)).toBe('45 s');
    expect(ageLabel(iso(-7 * 60), now)).toBe('7 min');
    expect(ageLabel(iso(-65 * 60), now)).toBe('1 h 05 min');
    expect(ageLabel(iso(+90), now)).toBe('just now');
    expect(ageLabel('not a date', now)).toBe('just now');
  });

  it('offers only the transitions the server allows', () => {
    const p = person('Alex');
    expect(nextAction(request(p, { status: 'sent' }))).toBe('acknowledged');
    expect(nextAction(request(p, { status: 'acknowledged', revision: 2 }))).toBe('completed');
    expect(nextAction(request(p, { status: 'completed', revision: 3 }))).toBeNull();
    expect(nextAction(request(p, { status: 'cancelled', revision: 2 }))).toBeNull();
  });
});

describe('AlertTracker', () => {
  function boardWith(...requests: ReturnType<typeof request>[]) {
    const p = person('Alex');
    const list = requests.length ? requests : [];
    return boardOf(snapshot({ participants: [p], requests: list.map((r) => ({ ...r, participant_id: p.id })) }), new Map(list.map((r) => [r.id, { ...r, participant_id: p.id }])))!;
  }

  it('baselines silently on first sight, then alerts once per new id', () => {
    const tracker = new AlertTracker();
    const old = request(person('x'));
    expect(tracker.observe(boardWith(old))).toEqual([]);
    expect(tracker.observe(boardWith(old))).toEqual([]);
    const fresh = request(person('y'));
    expect(tracker.observe(boardWith(old, fresh))).toEqual([fresh.id]);
    expect(tracker.observe(boardWith(old, fresh))).toEqual([]);
  });

  it('does not alert for acknowledged requests, and not again after a re-appearance', () => {
    const tracker = new AlertTracker();
    tracker.observe(boardWith());
    const r = request(person('x'));
    expect(tracker.observe(boardWith(r))).toEqual([r.id]);
    expect(tracker.observe(boardWith({ ...r, status: 'acknowledged', revision: 2 }))).toEqual([]);
    expect(tracker.observe(boardWith(r))).toEqual([]);
  });

  it('baseline() marks the current queue as seen without alerting', () => {
    const tracker = new AlertTracker();
    tracker.observe(boardWith());
    const waiting = request(person('x'));
    tracker.baseline(boardWith(waiting));
    expect(tracker.observe(boardWith(waiting))).toEqual([]);
    expect(tracker.has(waiting.id)).toBe(true);
  });
});
