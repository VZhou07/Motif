import type { CareAccess, CareGroup, CareRequest, CareSnapshot, Participant, RequestKind, RequestStatus } from '../../care';

/** Test-only builders. Fixtures never become the delivery path (the screen always takes a real client). */
export const OWNER = '00000000-0000-4000-8000-0000000000a1';
export const GROUP_ID = '00000000-0000-4000-8000-0000000000b1';
export const OTHER_GROUP_ID = '00000000-0000-4000-8000-0000000000b2';
const BASE = Date.parse('2026-10-17T12:00:00Z');

let counter = 0;
export function uid(prefix = 'c'): string {
  counter += 1;
  return `00000000-0000-4000-8${prefix.charCodeAt(0).toString(16).padStart(3, '0').slice(-3)}-${String(counter).padStart(12, '0')}`;
}
export const iso = (offsetSeconds = 0) => new Date(BASE + offsetSeconds * 1_000).toISOString();

export function group(over: Partial<CareGroup> = {}): CareGroup {
  return { id: GROUP_ID, owner_id: OWNER, name: 'Demo group', created_at: iso(-3600), ...over };
}
export function person(alias: string, over: Partial<Participant> = {}): Participant {
  return { id: uid('p'), group_id: GROUP_ID, alias, user_id: uid('u'), revoked_at: null, created_at: iso(-600 + counter), ...over };
}
export function request(participant: Participant, over: Partial<CareRequest> & { kind?: RequestKind; status?: RequestStatus } = {}): CareRequest {
  return { id: uid('r'), group_id: participant.group_id, participant_id: participant.id, kind: 'water', status: 'sent', revision: 1,
    created_at: iso(0), updated_at: iso(0), ...over };
}
export function caregiverAccess(over: Partial<CareAccess> = {}): CareAccess {
  return { version: 1, role: 'caregiver', group: group(), participant: null, receiver_name: 'Demo group', ...over };
}
export function snapshot(over: Partial<CareSnapshot> = {}): CareSnapshot {
  return { epoch: 1, access: caregiverAccess(), participants: [], requests: [], connection: 'online', error: null, ...over };
}
export function signedOut(over: Partial<CareSnapshot> = {}): CareSnapshot {
  return snapshot({ access: { version: 1, role: 'signed-out', group: null, participant: null, receiver_name: null }, connection: 'idle', ...over });
}
