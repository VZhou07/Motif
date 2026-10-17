import type { CareAccess, CareRequest, CareSnapshot } from '../../care';
import { AlertTracker, STALE_AFTER_MS, STALE_RETENTION_MS, boardOf, mergeRequests, scopeToGroup, type Board } from './model';

/** Pure state machine for the caregiver dashboard (design revision 3). No React, no timers, no network. */
export interface Invite { token: string; expiresAt: string; deadlineMono: number }
export interface CaregiverSession { groupId: string; tracker: AlertTracker }

export interface Core {
  ready: boolean;
  maxEpoch: number;
  snapshot: CareSnapshot | null;
  requests: Map<string, CareRequest>;
  lastGood: Board | null;
  lastOnlineAt: number | null;
  /** Survives outages and epoch bumps; see the discard rules in `reduce`. */
  session: CaregiverSession | null;
  invites: Record<string, Invite>;
  dropped: boolean;
  notice: string | null;
  hadBoard: boolean;
  expectSignOut: boolean;
  /** Increments with every applied ONLINE caregiver snapshot; effects key on it. */
  boardVersion: number;
}

export type DashboardEvent =
  | { type: 'snapshot'; snapshot: CareSnapshot; mono: number }
  | { type: 'settled' }
  | { type: 'tick'; mono: number }
  | { type: 'drop' }
  | { type: 'expect-sign-out' }
  | { type: 'invite'; id: string; token: string; expiresAt: string; mono: number; wall: number }
  | { type: 'hide-invite'; id: string };

export type View =
  | { kind: 'loading' }
  | { kind: 'signed-out'; notice: string | null }
  | { kind: 'unreachable'; message: string | null }
  | { kind: 'wrong-role'; role: CareAccess['role'] }
  | { kind: 'no-group' }
  | { kind: 'board'; board: Board; offline: boolean; stale: boolean; secondsSinceUpdate: number; boardVersion: number };

export const SESSION_LOST = 'Connection or session lost for over 2 minutes. Sign in again.';
export const SESSION_ENDED = 'Your session ended. Sign in again.';
const INVITE_MAX_MS = 10 * 60_000;

export function initialCore(): Core {
  return { ready: false, maxEpoch: -1, snapshot: null, requests: new Map(), lastGood: null, lastOnlineAt: null, session: null,
    invites: {}, dropped: false, notice: null, hadBoard: false, expectSignOut: false, boardVersion: 0 };
}

function dropBoard(core: Core, notice: string): Core {
  return { ...core, lastGood: null, lastOnlineAt: null, requests: new Map(), invites: {}, dropped: true, notice };
}

export function reduce(core: Core, event: DashboardEvent): Core {
  switch (event.type) {
    case 'settled': return core.ready ? core : { ...core, ready: true };
    case 'expect-sign-out': return { ...core, expectSignOut: true };
    case 'drop': return core.lastGood ? dropBoard(core, 'Sign in again to continue.') : core;
    case 'hide-invite': {
      if (!(event.id in core.invites)) return core;
      const { [event.id]: _hidden, ...rest } = core.invites;
      return { ...core, invites: rest };
    }
    case 'invite': {
      const remaining = Math.min(INVITE_MAX_MS, Math.max(0, Date.parse(event.expiresAt) - event.wall));
      return { ...core, invites: { ...core.invites, [event.id]: { token: event.token, expiresAt: event.expiresAt, deadlineMono: event.mono + (Number.isFinite(remaining) ? remaining : 0) } } };
    }
    case 'tick':
      // Anchored to the last ONLINE caregiver snapshot, so an epoch bump or a hung poll cannot extend retention.
      return core.lastGood && core.lastOnlineAt !== null && event.mono - core.lastOnlineAt > STALE_RETENTION_MS
        ? dropBoard(core, SESSION_LOST) : core;
    case 'snapshot': return applySnapshot(core, event.snapshot, event.mono);
  }
}

function applySnapshot(core: Core, snapshot: CareSnapshot, mono: number): Core {
  if (snapshot.epoch < core.maxEpoch) return core; // a late delivery from a previous identity
  let next: Core = { ...core, snapshot, maxEpoch: snapshot.epoch, ready: core.ready || snapshot.connection !== 'idle' };
  if (snapshot.epoch > core.maxEpoch) next = { ...next, requests: new Map(), lastGood: null, lastOnlineAt: null };

  if (snapshot.connection === 'online') {
    const access = snapshot.access;
    if (access.role === 'caregiver' && access.group) {
      const sameGroup = next.session?.groupId === access.group.id;
      const session = sameGroup ? next.session! : { groupId: access.group.id, tracker: new AlertTracker() };
      const requests = mergeRequests(sameGroup ? next.requests : new Map(), scopeToGroup(snapshot).requests);
      const board = boardOf(snapshot, requests);
      if (!board) return next;
      const people = new Map(board.people.map((entry) => [entry.person.id, entry]));
      // A code is dropped as soon as its person is paired or removed.
      const invites = Object.fromEntries(Object.entries(sameGroup ? next.invites : {}).filter(([id]) => {
        const entry = people.get(id);
        return entry !== undefined && !entry.paired;
      }));
      return { ...next, session, requests, invites, lastGood: board, lastOnlineAt: mono, dropped: false, notice: null,
        hadBoard: true, expectSignOut: false, boardVersion: next.boardVersion + 1 };
    }
    // An ONLINE snapshot that is not a caregiver with a group: nothing of the old caregiver view may remain.
    return { ...next, session: null, invites: {}, requests: new Map(), lastGood: null, lastOnlineAt: null, dropped: false, notice: null };
  }
  if (snapshot.connection === 'idle') {
    // Genuine sign-out or an absent/expired credential.
    return { ...next, session: null, invites: {}, requests: new Map(), lastGood: null, lastOnlineAt: null, dropped: false };
  }
  // 'offline' and 'loading' never discard the session; same-epoch offline keeps the last authoritative board.
  return next;
}

export function viewOf(core: Core, mono: number): View {
  const snapshot = core.snapshot;
  if (!core.ready || !snapshot || snapshot.connection === 'loading') return { kind: 'loading' };
  if (core.dropped) return { kind: 'signed-out', notice: core.notice };
  if (snapshot.connection === 'offline') {
    return core.lastGood
      ? { kind: 'board', board: core.lastGood, offline: true, stale: true, secondsSinceUpdate: secondsSince(core, mono), boardVersion: core.boardVersion }
      : { kind: 'unreachable', message: snapshot.error };
  }
  if (snapshot.connection === 'idle') {
    return { kind: 'signed-out', notice: core.hadBoard && !core.expectSignOut ? SESSION_ENDED : core.notice };
  }
  const access = snapshot.access;
  if (access.role === 'caregiver' && access.group && core.lastGood) {
    const stale = core.lastOnlineAt !== null && mono - core.lastOnlineAt > STALE_AFTER_MS;
    return { kind: 'board', board: core.lastGood, offline: false, stale, secondsSinceUpdate: secondsSince(core, mono), boardVersion: core.boardVersion };
  }
  if (access.role === 'caregiver') return { kind: 'no-group' };
  return { kind: 'wrong-role', role: access.role };
}

function secondsSince(core: Core, mono: number): number {
  return core.lastOnlineAt === null ? 0 : Math.max(0, Math.floor((mono - core.lastOnlineAt) / 1_000));
}
