/** Shared version 1 contract. Network identity is separate from local calibration. */
export const CARE_CONTRACT_VERSION = 1 as const;
export const REQUEST_KINDS = ['water', 'bathroom', 'reposition', 'help'] as const;
export type RequestKind = typeof REQUEST_KINDS[number];
export type RequestStatus = 'sent' | 'acknowledged' | 'completed' | 'cancelled';
export interface CareGroup { id: string; owner_id: string; name: string; created_at: string }
export interface Participant { id: string; group_id: string; alias: string; user_id: string | null; revoked_at: string | null; created_at: string }
export interface CareRequest { id: string; group_id: string; participant_id: string; kind: RequestKind; status: RequestStatus; revision: number; created_at: string; updated_at: string }
export interface CareAccess {
  version: 1;
  role: 'signed-out' | 'unpaired' | 'caregiver' | 'participant' | 'revoked';
  group: CareGroup | null;
  participant: Participant | null;
  receiver_name: string | null;
}
export interface Invitation { version: 1; participant_id: string; token: string; expires_at: string }
export interface CareSnapshot {
  epoch: number;
  access: CareAccess;
  participants: Participant[];
  requests: CareRequest[];
  connection: 'idle' | 'loading' | 'online' | 'offline';
  error: string | null;
}
export interface CareClient {
  readonly snapshot: CareSnapshot;
  refresh(): Promise<CareSnapshot>;
  signIn(email: string, password: string): Promise<CareSnapshot>;
  pair(token: string): Promise<CareSnapshot>;
  signOut(): Promise<void>;
  createGroup(name: string): Promise<CareGroup>;
  createParticipant(alias: string): Promise<Participant>;
  createInvite(participantId: string): Promise<Invitation>;
  revokeParticipant(participantId: string): Promise<Participant>;
  sendRequest(id: string, kind: RequestKind): Promise<CareRequest>;
  transitionRequest(id: string, revision: number, status: 'acknowledged' | 'completed' | 'cancelled'): Promise<CareRequest>;
  clearGroup(): Promise<void>;
  /** Authorized polling, every two seconds. Unsubscribe stops the timer. */
  watch(listener: (snapshot: CareSnapshot) => void): () => void;
  /** Await before creating a replacement sharing the same persisted Auth storage. */
  dispose(): Promise<void>;
}
export class CareError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'CareError'; }
}
export const signedOutAccess = (): CareAccess => ({ version: 1, role: 'signed-out', group: null, participant: null, receiver_name: null });

type Row = Record<string, unknown>;
export function row(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CareError('invalid_response', 'The care service returned an invalid response.');
  return value as Row;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.length || value.length > 512) throw new CareError('invalid_response', 'The care service returned an invalid value.');
  return value;
}
export function uuid(value: unknown): string {
  const result = text(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result)) throw new CareError('invalid_response', 'The care service returned an invalid ID.');
  return result;
}
function date(value: unknown): string {
  const result = text(value);
  if (!Number.isFinite(Date.parse(result))) throw new CareError('invalid_response', 'The care service returned an invalid date.');
  return result;
}
export function envelope(value: unknown): Row {
  const result = row(value);
  if (result.version !== 1) throw new CareError('invalid_response', 'The care service uses a different contract version.');
  return result;
}
export function parseGroup(value: unknown): CareGroup {
  const r = row(value);
  return { id: uuid(r.id), owner_id: uuid(r.owner_id), name: text(r.name), created_at: date(r.created_at) };
}
export function parseParticipant(value: unknown): Participant {
  const r = row(value);
  return { id: uuid(r.id), group_id: uuid(r.group_id), alias: text(r.alias), user_id: r.user_id === null ? null : uuid(r.user_id),
    revoked_at: r.revoked_at === null ? null : date(r.revoked_at), created_at: date(r.created_at) };
}
export function parseRequest(value: unknown): CareRequest {
  const r = row(value);
  if (!REQUEST_KINDS.includes(r.kind as RequestKind) || !['sent', 'acknowledged', 'completed', 'cancelled'].includes(r.status as string)
    || !Number.isSafeInteger(r.revision) || (r.revision as number) < 1) throw new CareError('invalid_response', 'The care service returned an invalid request.');
  return { id: uuid(r.id), group_id: uuid(r.group_id), participant_id: uuid(r.participant_id), kind: r.kind as RequestKind,
    status: r.status as RequestStatus, revision: r.revision as number, created_at: date(r.created_at), updated_at: date(r.updated_at) };
}
export function parseAccess(value: unknown, userId: string, anonymous: boolean): CareAccess {
  const r = envelope(value);
  if (!['unpaired', 'caregiver', 'participant', 'revoked'].includes(r.role as string)) throw new CareError('invalid_response', 'Unknown care account role.');
  const group = r.group === null ? null : parseGroup(r.group);
  const participant = r.participant === null ? null : parseParticipant(r.participant);
  const role = r.role as CareAccess['role'];
  if (role === 'caregiver' ? anonymous || participant !== null || (group !== null && group.owner_id !== userId)
    : !anonymous || group !== null || (role === 'unpaired' ? participant !== null
      : participant?.user_id !== userId || (role === 'participant' ? participant.revoked_at !== null : participant.revoked_at === null))) {
    throw new CareError('invalid_response', 'The care account does not match the authenticated identity.');
  }
  return { version: 1, role, group, participant, receiver_name: r.receiver_name === null ? null : text(r.receiver_name) };
}
export function parseInvitation(value: unknown): Invitation {
  const r = envelope(value);
  return { version: 1, participant_id: uuid(r.participant_id), token: text(r.token), expires_at: date(r.expires_at) };
}
export function rows<T>(value: unknown, parse: (input: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new CareError('invalid_response', 'The care service returned an invalid list.');
  return value.map(parse);
}
