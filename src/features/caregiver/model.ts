import type { CareRequest, CareSnapshot, Participant, RequestKind } from '../../care';

/** Pure view model for the caregiver dashboard (workstream caregiver-dashboard, design revision 3). */
export const STALE_AFTER_MS = 6_000;
export const STALE_RETENTION_MS = 120_000;
export const FINISHED_LIMIT = 10;

export const KIND_LABELS: Record<RequestKind, string> = {
  water: 'Water',
  bathroom: 'Bathroom assistance',
  reposition: 'Change position',
  help: 'General help',
};

/** Control, format and separator characters (zero-width, bidi overrides, line breaks) never reach the screen. */
const HIDDEN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

export function cleanText(raw: string, max = 60): string {
  const text = raw.replace(HIDDEN, ' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const byCreated = (a: { created_at: string; id: string }, b: { created_at: string; id: string }) =>
  Date.parse(a.created_at) - Date.parse(b.created_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Stable per-person labels. With two or more people in the group every alias carries an ordinal tag,
 * counted over ALL participants (revoked included) so removing someone never renumbers the others.
 */
export function displayNames(participants: readonly Participant[]): Map<string, string> {
  const ordered = [...participants].sort(byCreated);
  const names = new Map<string, string>();
  ordered.forEach((person, index) => {
    const alias = cleanText(person.alias) || 'Unnamed person';
    names.set(person.id, ordered.length > 1 ? `${alias} #${index + 1}` : alias);
  });
  return names;
}

/** Keep, per id, the higher revision; the result holds ONLY the incoming ids, so cleared requests disappear. */
export function mergeRequests(previous: ReadonlyMap<string, CareRequest>, incoming: readonly CareRequest[]): Map<string, CareRequest> {
  const merged = new Map<string, CareRequest>();
  for (const request of incoming) {
    const known = previous.get(request.id) ?? merged.get(request.id);
    merged.set(request.id, known && known.revision > request.revision ? known : request);
  }
  return merged;
}

/** Presentation hygiene only (RLS is the enforcement): drop rows that do not belong to the signed-in group. */
export function scopeToGroup(snapshot: CareSnapshot): { participants: Participant[]; requests: CareRequest[] } {
  const groupId = snapshot.access.group?.id;
  if (snapshot.access.role !== 'caregiver' || !groupId) return { participants: [], requests: [] };
  const participants = snapshot.participants.filter((person) => person.group_id === groupId);
  const known = new Set(participants.map((person) => person.id));
  const requests = snapshot.requests.filter((request) => request.group_id === groupId && known.has(request.participant_id));
  return { participants, requests };
}

export interface BoardRequest { request: CareRequest; name: string }
export interface BoardPerson { person: Participant; name: string; paired: boolean }
export interface Board {
  groupId: string;
  groupName: string;
  receiverName: string | null;
  people: BoardPerson[];
  removed: BoardPerson[];
  outstanding: BoardRequest[];
  finished: BoardRequest[];
}

export function boardOf(snapshot: CareSnapshot, requests: ReadonlyMap<string, CareRequest>): Board | null {
  const group = snapshot.access.group;
  if (snapshot.access.role !== 'caregiver' || !group) return null;
  const { participants } = scopeToGroup(snapshot);
  const names = displayNames(participants);
  const nameOf = (id: string) => names.get(id) ?? 'Unnamed person';
  const person = (p: Participant): BoardPerson => ({ person: p, name: nameOf(p.id), paired: p.user_id !== null });
  const active = new Set(participants.filter((p) => p.revoked_at === null).map((p) => p.id));
  const list = [...requests.values()].filter((r) => r.group_id === group.id && participants.some((p) => p.id === r.participant_id));
  const rank = (r: CareRequest) => (r.status === 'sent' ? 0 : 1);
  return {
    groupId: group.id,
    groupName: cleanText(group.name) || 'Care group',
    receiverName: snapshot.access.receiver_name === null ? null : cleanText(snapshot.access.receiver_name) || null,
    people: participants.filter((p) => p.revoked_at === null).sort(byCreated).map(person),
    removed: participants.filter((p) => p.revoked_at !== null).sort(byCreated).map(person),
    outstanding: list
      .filter((r) => (r.status === 'sent' || r.status === 'acknowledged') && active.has(r.participant_id))
      .sort((a, b) => rank(a) - rank(b) || byCreated(a, b))
      .map((request) => ({ request, name: nameOf(request.participant_id) })),
    finished: list
      .filter((r) => r.status === 'completed' || r.status === 'cancelled')
      .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at) || byCreated(b, a))
      .slice(0, FINISHED_LIMIT)
      .map((request) => ({ request, name: nameOf(request.participant_id) })),
  };
}

export function ageLabel(createdAt: string, wallNow: number): string {
  const seconds = Math.max(0, Math.floor((wallNow - Date.parse(createdAt)) / 1_000));
  if (!Number.isFinite(seconds) || seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

export function clockLabel(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
}

/** Which action a caregiver may take. The server allows exactly sent→acknowledged and acknowledged→completed. */
export function nextAction(request: CareRequest): 'acknowledged' | 'completed' | null {
  return request.status === 'sent' ? 'acknowledged' : request.status === 'acknowledged' ? 'completed' : null;
}

/**
 * Per-session record of which requests have already alerted. It holds ids only. `observe` returns the ids of
 * outstanding `sent` requests never seen before (and remembers them); the first call silently baselines.
 */
export class AlertTracker {
  private readonly seen = new Set<string>();
  private baselined = false;

  /** Mark everything currently waiting as seen without alerting (first snapshot, or enabling sound). */
  baseline(board: Board): void {
    for (const { request } of board.outstanding) this.seen.add(request.id);
    this.baselined = true;
  }

  observe(board: Board): string[] {
    if (!this.baselined) { this.baseline(board); return []; }
    const fresh: string[] = [];
    for (const { request } of board.outstanding) {
      if (request.status !== 'sent' || this.seen.has(request.id)) continue;
      this.seen.add(request.id);
      fresh.push(request.id);
    }
    return fresh;
  }

  has(id: string): boolean { return this.seen.has(id); }
}
