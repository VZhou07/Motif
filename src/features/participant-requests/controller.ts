import { CareError, REQUEST_KINDS } from '../../care';
import type { CareClient, CareRequest, CareSnapshot, RequestKind, RequestStatus } from '../../care';

/**
 * Participant request state (design P1 revision 3). Pending and Failed are local and mean
 * "not confirmed"; Sent, Acknowledged, Completed and Cancelled come only from the server.
 * Only `activate('request:*')`, `retry` and `cancel` call the network; nothing here reads
 * the message, speech or camera data.
 */
export type DisplayStatus = 'pending' | 'failed' | RequestStatus;
export type RequestTargetId = `request:${RequestKind}` | 'request:cancel';
export interface RequestTarget { id: RequestTargetId; label: string; kind: 'control' }
export interface RequestCard {
  id: string; kind: RequestKind; status: DisplayStatus; revision: number | null;
  stale: boolean; reason: string | null; seq: number;
}
export type IdentityState = 'not-configured' | 'connecting' | 'signed-out' | 'unpaired' | 'caregiver' | 'participant' | 'revoked';
export interface ParticipantRequestsView {
  identity: { state: IdentityState; alias: string | null; receiver: string | null; stale: boolean };
  connection: CareSnapshot['connection'] | 'none';
  cards: RequestCard[];
  targets: readonly RequestTarget[];
  cancelSubject: string | null;
  identityGeneration: number;
  pairing: { busy: boolean; error: string | null };
}
export interface ControllerOptions {
  client: CareClient | null;
  newId?: () => string;
  announce?: (text: string) => void;
}

export const KIND_NAMES: Record<RequestKind, string> = {
  water: 'Water', bathroom: 'Bathroom assistance', reposition: 'Help changing position', help: 'General help',
};
const ASK_LABELS: Record<RequestKind, string> = {
  water: 'Ask for water', bathroom: 'Ask for bathroom assistance', reposition: 'Ask for help changing position', help: 'Ask for general help',
};
const lower = (kind: RequestKind) => KIND_NAMES[kind].toLowerCase();
const OPEN: readonly DisplayStatus[] = ['pending', 'failed', 'sent', 'acknowledged'];
const OFFLINE_SEND = "Can't reach the caregiver service right now. Nothing was sent.";
const OFFLINE_CANCEL = "Can't reach the caregiver service right now. Nothing was cancelled.";

/** Plain reason for a send that was not confirmed. A rejected send may still have been stored. */
export function reasonFor(error: unknown): string {
  // Fetch failures and timeouts are not CareErrors.
  if (!(error instanceof CareError)) return 'the caregiver service could not be reached';
  switch (error.code) {
    case 'auth_required': return 'the caregiver service could not be reached';
    case 'session_changed': return 'the account changed during sending';
    case 'request_failed': return 'the service refused it';
    case 'disposed': return 'the request screen was closed';
    default: return 'it could not be confirmed';
  }
}

function pairingMessage(error: unknown): string {
  const code = error instanceof CareError ? error.code : '';
  switch (code) {
    case 'already_paired': return 'This device is already paired.';
    case 'wrong_role': return 'Signed in as a caregiver. Sign out before pairing.';
    case 'rate_limited': return 'Too many pairing attempts. Try again later.';
    case 'invalid_invite': return 'That invitation code is not valid or has expired. Ask for a new one.';
    default: return 'Pairing did not complete. Check the code or ask for a new one.';
  }
}

/** Card text: never claims more than the server confirmed. */
export function statusText(card: Pick<RequestCard, 'status' | 'reason' | 'stale'>, receiver: string | null): string {
  const who = receiver ?? 'Your caregiver';
  const text = {
    pending: 'Sending — not confirmed yet.',
    failed: `Not confirmed — it may not have reached your caregiver (${card.reason ?? 'it could not be confirmed'}). Select it to try again; this will not create a duplicate.`,
    sent: 'Sent — your caregiver has not responded yet.',
    acknowledged: `${who} acknowledged it.`,
    completed: 'Done.',
    cancelled: 'Cancelled.',
  }[card.status];
  return card.stale ? `${text} (last known, not confirmed right now)` : text;
}

interface Owner { participantId: string; alias: string; receiver: string | null }
interface LocalEntry { kind: RequestKind; phase: 'pending' | 'failed'; owner: string; reason: string | null; quiet?: boolean }

export class ParticipantRequestController {
  private readonly client: CareClient | null;
  private readonly newId: () => string;
  private readonly announceText: (text: string) => void;
  private active = false;
  private disposed = false;
  private owner: Owner | null = null;
  private roleState: IdentityState;
  private connection: ParticipantRequestsView['connection'];
  private generation = 0;
  private lastKnown: CareRequest[] = [];
  private readonly local = new Map<string, LocalEntry>();
  private readonly seqs = new Map<string, number>();
  private nextSeq = 1;
  private subject: string | null = null;
  private readonly cancelling = new Set<string>();
  private readonly lastStatus = new Map<string, DisplayStatus>();
  private pairing = { busy: false, error: null as string | null };
  private readonly listeners = new Set<(view: ParticipantRequestsView) => void>();
  private readonly queued: string[] = [];
  private targetsCache: readonly RequestTarget[] = [];
  private current: ParticipantRequestsView;
  private unwatch: (() => void) | null = null;

  constructor(options: ControllerOptions) {
    this.client = options.client;
    this.newId = options.newId ?? (() => crypto.randomUUID());
    this.announceText = options.announce ?? (() => {});
    this.roleState = this.client ? 'connecting' : 'not-configured';
    this.connection = this.client ? 'idle' : 'none';
    this.current = this.build();
    if (this.client) {
      try { this.unwatch = this.client.watch((snapshot) => this.onSnapshot(snapshot)); }
      catch { this.connection = 'offline'; this.update(); }
    }
  }

  get view(): ParticipantRequestsView { return this.current; }

  subscribe(listener: (view: ParticipantRequestsView) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** The session sets this true only while its stage is `communication`. */
  setActive(active: boolean): void { this.active = active; }

  /** Integration hook: true for every `request:*` id (handled even when refused), false otherwise. */
  activate(targetId: string): boolean {
    if (!targetId.startsWith('request:')) return false;
    if (!this.active || this.disposed) return true;
    if (targetId === 'request:cancel') this.cancelSubject();
    else {
      const kind = targetId.slice('request:'.length) as RequestKind;
      if (REQUEST_KINDS.includes(kind)) this.requestKind(kind);
    }
    this.update();
    return true;
  }

  /** Helper button on one card: retry an unconfirmed request with its same id. */
  retry(requestId: string): void {
    if (!this.active || this.disposed) return;
    const entry = this.local.get(requestId);
    if (!this.owner || !entry || entry.phase !== 'failed') return;
    this.subject = requestId;
    if (this.connection !== 'online') { this.say(OFFLINE_SEND); this.update(); return; }
    this.retryEntry(requestId, entry);
    this.update();
  }

  /** Helper button on one card: the helper chose this request explicitly. */
  cancel(requestId: string): void {
    if (!this.active || this.disposed) return;
    if (!this.local.has(requestId) && !this.lastKnown.some((request) => request.id === requestId)) return;
    this.subject = requestId;
    this.cancelSubject();
    this.update();
  }

  async pair(token: string): Promise<boolean> {
    if (!this.client || this.disposed || this.pairing.busy) return false;
    this.pairing = { busy: true, error: null };
    this.update();
    try {
      // A revoked device still holds the identity bound to the removed pairing; the server
      // refuses to bind it again, so pairing with a new invitation starts from a fresh sign-in.
      if (this.roleState === 'revoked') await this.client.signOut();
      await this.client.pair(token.trim());
      this.pairing = { busy: false, error: null };
      this.update();
      return true;
    } catch (error) {
      this.pairing = { busy: false, error: pairingMessage(error) };
      this.update();
      return false;
    }
  }

  /** Clears this person's cards and unsent requests before the client finishes signing out. */
  async signOut(): Promise<void> {
    if (!this.client || this.disposed) return;
    this.resetIdentity(null);
    this.roleState = 'signed-out';
    this.pairing = { busy: true, error: null };
    this.update();
    try { await this.client.signOut(); this.pairing = { busy: false, error: null }; }
    catch { this.pairing = { busy: false, error: 'Sign-out did not finish. Try again.' }; }
    this.update();
  }

  /** Stops listening. The shared client is owned and disposed by the integrator. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unwatch?.();
    this.unwatch = null;
    this.listeners.clear();
  }

  // ── Snapshots and identity ───────────────────────────────────────────────

  private onSnapshot(snapshot: CareSnapshot): void {
    if (this.disposed) return;
    this.connection = snapshot.connection;
    const authoritative = snapshot.connection === 'online' || (snapshot.connection === 'idle' && snapshot.access.role === 'signed-out');
    if (authoritative) {
      const participant = snapshot.access.role === 'participant' ? snapshot.access.participant : null;
      if (participant) {
        const next: Owner = { participantId: participant.id, alias: participant.alias, receiver: snapshot.access.receiver_name };
        if (this.owner?.participantId !== participant.id) this.resetIdentity(next);
        else this.owner = next;
        this.roleState = 'participant';
        this.absorb(snapshot.requests.filter((request) => request.participant_id === participant.id));
        // A failure caused by an account change is announced only once the same person is confirmed again.
        for (const entry of this.local.values()) {
          if (entry.phase === 'failed' && entry.quiet) { entry.quiet = false; this.announceStatus(entry.kind, 'failed', entry.reason); }
        }
      } else {
        if (this.owner) this.resetIdentity(null);
        this.roleState = snapshot.access.role;
      }
    }
    this.update();
  }

  private resetIdentity(next: Owner | null): void {
    this.local.clear();
    this.lastKnown = [];
    this.seqs.clear();
    this.subject = null;
    this.cancelling.clear();
    this.lastStatus.clear();
    this.owner = next;
    this.generation += 1;
  }

  /** Server rows win over local entries; announce each status change once. */
  private absorb(requests: CareRequest[]): void {
    const fresh = requests.filter((request) => !this.seqs.has(request.id))
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    for (const request of fresh) this.seqs.set(request.id, this.nextSeq++);
    this.lastKnown = requests;
    for (const request of requests) {
      this.local.delete(request.id);
      const before = this.lastStatus.get(request.id);
      if (before !== undefined && before !== request.status) this.announceStatus(request.kind, request.status);
      this.lastStatus.set(request.id, request.status);
    }
  }

  private announceStatus(kind: RequestKind, status: DisplayStatus, reason?: string | null): void {
    const who = this.owner?.receiver ?? 'Your caregiver';
    const name = lower(kind);
    const text: Partial<Record<DisplayStatus, string>> = {
      sent: `${KIND_NAMES[kind]} request sent to ${who}.`,
      acknowledged: `${who} acknowledged your ${name} request.`,
      completed: `Your ${name} request is done.`,
      cancelled: `${KIND_NAMES[kind]} request cancelled.`,
      failed: `${KIND_NAMES[kind]} request not confirmed: ${reason ?? 'it could not be confirmed'}. It may not have reached your caregiver.`,
    };
    const message = text[status];
    if (message) this.say(message);
  }

  // ── Requests ─────────────────────────────────────────────────────────────

  private statusOf(id: string): DisplayStatus | undefined {
    const entry = this.local.get(id);
    if (entry) return entry.phase;
    return this.lastKnown.find((request) => request.id === id)?.status;
  }

  private kindOf(id: string): RequestKind | undefined {
    return this.local.get(id)?.kind ?? this.lastKnown.find((request) => request.id === id)?.kind;
  }

  /** The newest open request of a kind, if any. */
  private openFor(kind: RequestKind): string | undefined {
    const ids = [...this.local.entries()].filter(([, entry]) => entry.kind === kind).map(([id]) => id)
      .concat(this.lastKnown.filter((request) => request.kind === kind && OPEN.includes(request.status)).map((request) => request.id));
    return ids.sort((a, b) => (this.seqs.get(b) ?? 0) - (this.seqs.get(a) ?? 0))[0];
  }

  private requestKind(kind: RequestKind): void {
    const owner = this.owner;
    if (!owner) { this.say('Pair this device with a caregiver first.'); return; }
    if (this.connection !== 'online') { this.say(OFFLINE_SEND); return; }
    const open = this.openFor(kind);
    if (open) {
      this.subject = open;
      const status = this.statusOf(open);
      const entry = this.local.get(open);
      if (status === 'pending') this.say(`Still sending the ${lower(kind)} request.`);
      else if (status === 'failed' && entry) this.retryEntry(open, entry);
      else {
        const who = owner.receiver ?? 'your caregiver';
        this.say(status === 'acknowledged'
          ? `${who} acknowledged your ${lower(kind)} request. Select Cancel to cancel it.`
          : `${KIND_NAMES[kind]} is waiting for ${who}. Select Cancel to cancel it.`);
      }
      return;
    }
    let id: string;
    try { id = this.newId(); } catch { id = ''; }
    if (!id) { this.say('This device cannot create a request ID. Nothing was sent.'); return; }
    this.local.set(id, { kind, phase: 'pending', owner: owner.participantId, reason: null });
    this.seqs.set(id, this.nextSeq++);
    this.lastStatus.set(id, 'pending');
    this.subject = id;
    this.say(`Sending ${lower(kind)} request.`);
    this.send(id, kind, owner.participantId);
  }

  private retryEntry(id: string, entry: LocalEntry): void {
    entry.phase = 'pending';
    entry.reason = null;
    entry.quiet = false;
    this.lastStatus.set(id, 'pending');
    this.say(`Trying the ${lower(entry.kind)} request again.`);
    this.send(id, entry.kind, entry.owner);
  }

  private send(id: string, kind: RequestKind, ownerId: string): void {
    const client = this.client;
    if (!client) return;
    client.sendRequest(id, kind).then(() => {
      // The client reloads before resolving, so the snapshot has normally confirmed it already.
      this.update();
    }, (error: unknown) => {
      const entry = this.local.get(id);
      // An identity change deletes entries, so an old session's result is never applied.
      if (this.disposed || !entry || entry.owner !== ownerId || this.owner?.participantId !== ownerId || entry.phase !== 'pending') return;
      entry.phase = 'failed';
      entry.reason = reasonFor(error);
      this.lastStatus.set(id, 'failed');
      if (error instanceof CareError && error.code === 'session_changed') entry.quiet = true;
      else this.announceStatus(kind, 'failed', entry.reason);
      this.update();
    });
  }

  private cancelSubject(): void {
    const owner = this.owner;
    if (!owner) { this.say('Pair this device with a caregiver first.'); return; }
    const id = this.subject;
    if (!id) { this.say('Select the request you want to cancel first, then Cancel.'); return; }
    const kind = this.kindOf(id);
    const status = this.statusOf(id);
    if (!kind || !status || status === 'completed' || status === 'cancelled') {
      this.subject = null;
      this.say(kind ? `The ${lower(kind)} request is already done. Nothing was cancelled.` : 'That request is no longer open. Nothing was cancelled.');
      return;
    }
    if (this.connection !== 'online') { this.say(OFFLINE_CANCEL); return; }
    if (status === 'pending') { this.say(`Wait until the ${lower(kind)} request finishes sending.`); return; }
    if (status === 'failed') {
      this.local.delete(id);
      this.lastStatus.delete(id);
      this.seqs.delete(id);
      this.subject = null;
      this.say(`Removed the unconfirmed ${lower(kind)} request. If it did reach your caregiver it will show here again.`);
      return;
    }
    if (this.cancelling.has(id)) { this.say(`Already cancelling the ${lower(kind)} request.`); return; }
    const request = this.lastKnown.find((entry) => entry.id === id)!;
    this.cancelling.add(id);
    this.say(`Cancelling the ${lower(kind)} request.`);
    const generation = this.generation;
    this.client!.transitionRequest(request.id, request.revision, 'cancelled').then(() => {
      if (generation !== this.generation) return;
      this.cancelling.delete(id);
      this.update();
    }, async (error: unknown) => {
      if (this.disposed || generation !== this.generation) return;
      try { await this.client!.refresh(); } catch { /* The status shown stays last known. */ }
      if (this.disposed || generation !== this.generation) return;
      this.cancelling.delete(id);
      const now = this.lastKnown.find((entry) => entry.id === id);
      if (now && (now.revision !== request.revision || now.status !== request.status)) {
        this.say(`The ${lower(kind)} request changed before it could be cancelled. It is now ${now.status}.`);
      } else {
        this.say(`Could not cancel the ${lower(kind)} request: ${reasonFor(error)}. It is still ${request.status}.`);
      }
      this.update();
    });
  }

  // ── View ─────────────────────────────────────────────────────────────────

  private say(text: string): void { this.queued.push(text); }

  private kindLabel(kind: RequestKind): string {
    const open = this.openFor(kind);
    const status = open ? this.statusOf(open) : undefined;
    const name = KIND_NAMES[kind];
    switch (status) {
      case 'pending': return `${name}: sending`;
      case 'failed': return `${name}: not confirmed, select to try again`;
      case 'sent': return `${name}: sent, waiting`;
      case 'acknowledged': return `${name}: ${this.owner?.receiver ?? 'caregiver'} acknowledged`;
      default: return ASK_LABELS[kind];
    }
  }

  private buildTargets(): readonly RequestTarget[] {
    if (!this.owner) return this.targetsCache.length ? (this.targetsCache = []) : this.targetsCache;
    const subjectKind = this.subject ? this.kindOf(this.subject) : undefined;
    const subjectStatus = this.subject ? this.statusOf(this.subject) : undefined;
    const next: RequestTarget[] = [
      ...REQUEST_KINDS.map((kind) => ({ id: `request:${kind}` as RequestTargetId, label: this.kindLabel(kind), kind: 'control' as const })),
      { id: 'request:cancel', kind: 'control', label: subjectKind && subjectStatus && OPEN.includes(subjectStatus)
        ? `Cancel ${lower(subjectKind)} request` : 'Cancel: select a request first' },
    ];
    const same = next.length === this.targetsCache.length
      && next.every((target, index) => target.id === this.targetsCache[index]!.id && target.label === this.targetsCache[index]!.label);
    if (!same) this.targetsCache = next;
    return this.targetsCache;
  }

  private build(): ParticipantRequestsView {
    const stale = this.connection !== 'online';
    const cards: RequestCard[] = [
      ...[...this.local.entries()].map(([id, entry]) => ({ id, kind: entry.kind, status: entry.phase as DisplayStatus, revision: null,
        stale, reason: entry.reason, seq: this.seqs.get(id) ?? 0 })),
      ...this.lastKnown.map((request) => ({ id: request.id, kind: request.kind, status: request.status as DisplayStatus, revision: request.revision,
        stale, reason: null, seq: this.seqs.get(request.id) ?? 0 })),
    ].sort((a, b) => b.seq - a.seq);
    const state: IdentityState = !this.client ? 'not-configured' : this.owner ? 'participant'
      : stale && this.connection !== 'idle' ? 'connecting' : this.roleState;
    return {
      identity: { state, alias: this.owner?.alias ?? null, receiver: this.owner?.receiver ?? null, stale: Boolean(this.owner) && stale },
      connection: this.connection,
      cards,
      targets: this.buildTargets(),
      cancelSubject: this.subject,
      identityGeneration: this.generation,
      pairing: { ...this.pairing },
    };
  }

  /** Announce first, then notify, so the session publishes with the announcement in place. */
  private update(): void {
    if (this.disposed) return;
    this.current = this.build();
    const messages = this.queued.splice(0);
    for (const message of messages) { try { this.announceText(message); } catch { /* never block state */ } }
    for (const listener of this.listeners) { try { listener(this.current); } catch { /* a consumer cannot break state */ } }
  }
}
