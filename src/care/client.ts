import { createClient } from '@supabase/supabase-js';
import type { CareConfig } from './config';
import { parseCareConfig } from './config';
import { CareError, envelope, parseAccess, parseGroup, parseInvitation, parseParticipant, parseRequest, rows, signedOutAccess } from './contracts';
import type { CareAccess, CareClient, CareGroup, CareRequest, CareSnapshot, Invitation, Participant, RequestKind } from './contracts';

export interface CareCredential { token: string; userId: string; anonymous: boolean }
export interface CareAuthAdapter {
  credential(): Promise<CareCredential | null>;
  signIn(email: string, password: string): Promise<void>;
  signInAnonymous(): Promise<void>;
  signOut(): Promise<void>;
  onChange(callback: () => void): () => void;
}
export interface CareTransport {
  auth: CareAuthAdapter;
  rpc(name: string, args: Record<string, unknown>, token: string, signal: AbortSignal): Promise<unknown>;
  list(table: 'participants' | 'care_requests', token: string, signal: AbortSignal): Promise<unknown>;
}
const changed = () => new CareError('session_changed', 'The active care account changed. Try again in the current account.');
const safeMessage = (error: unknown) => error instanceof CareError ? error.message : 'The care service could not be reached. Your local communication still works.';

/** One serialized authority for Auth and data. No queued action follows a new identity. */
export class CareService implements CareClient {
  private epoch = 0;
  private credential: CareCredential | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private mutatingAuth = false;
  private pollQueued = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private listeners = new Set<(snapshot: CareSnapshot) => void>();
  private unsubscribeAuth: () => void;
  private state: CareSnapshot = { epoch: 0, access: signedOutAccess(), participants: [], requests: [], connection: 'idle', error: null };

  constructor(private readonly transport: CareTransport) {
    this.unsubscribeAuth = transport.auth.onChange(() => {
      if (this.disposed || this.mutatingAuth) return;
      this.invalidate();
      // SDK callbacks must return without awaiting Auth; never apply their old payload.
      queueMicrotask(() => { if (!this.disposed) void this.refresh().catch(() => {}); });
    });
  }
  get snapshot(): CareSnapshot { return structuredClone(this.state); }
  private publish(patch: Partial<CareSnapshot>): void {
    this.state = { ...this.state, ...patch, epoch: this.epoch };
    if (this.listeners.size && !this.disposed && (this.state.connection === 'offline' || !['signed-out', 'revoked'].includes(this.state.access.role))) {
      this.timer ??= setInterval(() => this.poll(), 2_000);
    } else if (this.timer) { clearInterval(this.timer); this.timer = undefined; }
    for (const listener of this.listeners) { try { listener(this.snapshot); } catch { /* A consumer cannot break account cleanup. */ } }
  }
  private invalidate(): number {
    this.epoch += 1;
    this.credential = null;
    this.publish({ access: signedOutAccess(), participants: [], requests: [], connection: 'loading', error: null });
    return this.epoch;
  }
  private check(epoch: number): void { if (this.disposed || epoch !== this.epoch) throw changed(); }
  private serial<T>(task: () => Promise<T>): Promise<T> {
    if (this.disposed) return Promise.reject(new CareError('disposed', 'The care client is closed.'));
    const operation = this.queue.then(task);
    this.queue = operation.catch(() => {});
    return operation;
  }
  private async call<T>(epoch: number, token: string, name: string, args: Record<string, unknown>, parse: (value: unknown) => T): Promise<T> {
    this.check(epoch);
    const result = await this.transport.rpc(name, args, token, AbortSignal.timeout(15_000));
    this.check(epoch);
    return parse(result);
  }
  private async load(epoch: number): Promise<CareSnapshot> {
    this.check(epoch);
    const credential = await this.transport.auth.credential();
    this.check(epoch);
    if (!credential) {
      this.credential = null;
      this.publish({ access: signedOutAccess(), participants: [], requests: [], connection: 'idle', error: null });
      return this.snapshot;
    }
    if (this.credential && this.credential.userId !== credential.userId) {
      this.invalidate();
      queueMicrotask(() => { if (!this.disposed) void this.refresh().catch(() => {}); });
      throw changed();
    }
    const access = await this.call(epoch, credential.token, 'motif_access', {}, (r) => parseAccess(r, credential.userId, credential.anonymous));
    const active = access.role === 'caregiver' || access.role === 'participant';
    let participants: Participant[] = [];
    let requests: CareRequest[] = [];
    if (active) {
      participants = rows(await this.transport.list('participants', credential.token, AbortSignal.timeout(15_000)), parseParticipant);
      this.check(epoch);
      requests = rows(await this.transport.list('care_requests', credential.token, AbortSignal.timeout(15_000)), parseRequest);
      this.check(epoch);
      // Defense against accidental backend/client contract regressions. DB RLS is authority.
      if (access.role === 'participant' && (participants.some((p) => p.id !== access.participant!.id)
        || requests.some((r) => r.participant_id !== access.participant!.id))) throw new CareError('invalid_response', 'The request list does not match this participant.');
      if (access.role === 'caregiver' && (participants.some((p) => p.group_id !== access.group?.id)
        || requests.some((r) => r.group_id !== access.group?.id))) throw new CareError('invalid_response', 'The request list does not match this care group.');
    }
    if (access.role === 'revoked' && this.state.access.role !== 'revoked') this.epoch += 1;
    this.credential = active || access.role === 'unpaired' ? credential : null;
    this.publish({ access, participants, requests, connection: 'online', error: null });
    return this.snapshot;
  }
  refresh(): Promise<CareSnapshot> {
    const epoch = this.epoch;
    return this.serial(async () => {
      try { return await this.load(epoch); }
      catch (error) {
        if (epoch === this.epoch && !this.disposed) {
          this.credential = null;
          this.publish({ access: signedOutAccess(), participants: [], requests: [], connection: 'offline', error: safeMessage(error) });
        }
        throw error;
      }
    });
  }
  private authChange(action: (epoch: number) => Promise<void>): Promise<CareSnapshot> {
    const epoch = this.invalidate();
    return this.serial(async () => {
      this.check(epoch);
      this.mutatingAuth = true;
      try { await action(epoch); this.check(epoch); return await this.load(epoch); }
      catch (error) {
        if (epoch === this.epoch && !this.disposed) this.publish({ connection: 'offline', error: safeMessage(error) });
        throw error;
      } finally { this.mutatingAuth = false; }
    });
  }
  signIn(email: string, password: string): Promise<CareSnapshot> { return this.authChange(() => this.transport.auth.signIn(email, password)); }
  pair(token: string): Promise<CareSnapshot> {
    return this.authChange(async (epoch) => {
      let credential = await this.transport.auth.credential();
      this.check(epoch);
      if (credential && !credential.anonymous) throw new CareError('wrong_role', 'Sign out of the caregiver account before pairing this device.');
      if (!credential) { await this.transport.auth.signInAnonymous(); credential = await this.transport.auth.credential(); }
      this.check(epoch);
      if (!credential) throw new CareError('auth_required', 'Participant sign-in did not complete.');
      const result = envelope(await this.transport.rpc('motif_redeem_invite', { p_token: token }, credential.token, AbortSignal.timeout(15_000)));
      if (result.ok !== true) throw new CareError(typeof result.code === 'string' ? result.code : 'pairing_failed', 'Pairing did not complete. Check the invitation or ask for a new one.');
      parseParticipant(result.participant);
    });
  }
  async signOut(): Promise<void> { await this.authChange(() => this.transport.auth.signOut()); }
  private operation<T>(name: string, args: Record<string, unknown>, parse: (value: unknown, access: CareAccess) => T): Promise<T> {
    const epoch = this.epoch;
    const credential = this.credential;
    const access = structuredClone(this.state.access);
    return this.serial(async () => {
      this.check(epoch);
      if (!credential) throw new CareError('auth_required', 'Sign in or pair this device before sending requests.');
      // Explicit token binding prevents SDK session changes from changing the sender.
      const result = await this.call(epoch, credential.token, name, args, (value) => parse(value, access));
      await this.load(epoch);
      this.check(epoch);
      return result;
    });
  }
  private matches(condition: boolean): void { if (!condition) throw new CareError('invalid_response', 'The care response does not match the requested action and account.'); }
  private scopedRequest(value: unknown, access: CareAccess): CareRequest {
    const result = parseRequest(envelope(value).request);
    this.matches(access.role === 'caregiver' ? result.group_id === access.group?.id
      : access.role === 'participant' && result.participant_id === access.participant?.id && result.group_id === access.participant?.group_id);
    return result;
  }
  createGroup(name: string): Promise<CareGroup> {
    const normalized = name.trim();
    return this.operation('motif_create_group', { p_name: normalized }, (r) => {
      const result = parseGroup(envelope(r).group);
      this.matches(result.owner_id === this.credential?.userId && result.name === normalized); return result;
    });
  }
  createParticipant(alias: string): Promise<Participant> {
    const normalized = alias.trim();
    return this.operation('motif_create_participant', { p_alias: normalized }, (r, access) => {
      const result = parseParticipant(envelope(r).participant);
      this.matches(access.role === 'caregiver' && result.group_id === access.group?.id && result.alias === normalized && result.user_id === null && result.revoked_at === null); return result;
    });
  }
  createInvite(participantId: string): Promise<Invitation> {
    return this.operation('motif_create_invite', { p_participant_id: participantId }, (r, access) => {
      const result = parseInvitation(r);
      this.matches(access.role === 'caregiver' && result.participant_id === participantId); return result;
    });
  }
  revokeParticipant(participantId: string): Promise<Participant> {
    return this.operation('motif_revoke_participant', { p_participant_id: participantId }, (r, access) => {
      const result = parseParticipant(envelope(r).participant);
      this.matches(access.role === 'caregiver' && result.group_id === access.group?.id && result.id === participantId && result.revoked_at !== null); return result;
    });
  }
  sendRequest(id: string, kind: RequestKind): Promise<CareRequest> {
    return this.operation('motif_send_request', { p_request_id: id, p_kind: kind }, (r, access) => {
      const result = this.scopedRequest(r, access);
      this.matches(access.role === 'participant' && result.id === id && result.kind === kind); return result;
    });
  }
  transitionRequest(id: string, revision: number, status: 'acknowledged' | 'completed' | 'cancelled'): Promise<CareRequest> {
    return this.operation('motif_transition_request', { p_request_id: id, p_revision: revision, p_status: status }, (r, access) => {
      const result = this.scopedRequest(r, access);
      this.matches(result.id === id && result.status === status && result.revision === revision + 1); return result;
    });
  }
  clearGroup(): Promise<void> { return this.operation('motif_clear_group', {}, (r) => { if (envelope(r).cleared !== true) throw new CareError('invalid_response', 'The care group was not cleared.'); }); }
  watch(listener: (snapshot: CareSnapshot) => void): () => void {
    if (this.disposed) throw new CareError('disposed', 'The care client is closed.');
    this.listeners.add(listener);
    listener(this.snapshot);
    this.poll();
    return () => { this.listeners.delete(listener); if (!this.listeners.size && this.timer) { clearInterval(this.timer); this.timer = undefined; } };
  }
  private poll(): void {
    if (this.pollQueued || this.disposed) return;
    this.pollQueued = true;
    void this.refresh().catch(() => {}).finally(() => { this.pollQueued = false; });
  }
  async dispose(): Promise<void> {
    if (!this.disposed) {
      this.invalidate(); this.disposed = true; this.unsubscribeAuth();
      if (this.timer) clearInterval(this.timer);
      this.timer = undefined; this.listeners.clear();
    }
    await this.queue;
  }
}

const instances = new Map<string, CareClient>();
/** Create once per control surface; await dispose before creating a replacement. */
export function createSupabaseCareClient(config: CareConfig): CareClient {
  const parsed = parseCareConfig({ VITE_SUPABASE_URL: config.url, VITE_SUPABASE_PUBLISHABLE_KEY: config.publishableKey });
  if (parsed.status !== 'ready') throw new CareError('not_configured', 'Provide a valid Supabase URL and public publishable key before connecting.');
  config = parsed.config;
  if (instances.has(config.url)) throw new CareError('client_exists', 'Reuse the existing care client, or await its disposal before creating another.');
  const sdk = createClient(config.url, config.publishableKey, {
    auth: { storageKey: `motif-care-auth-v1:${new URL(config.url).host}`, detectSessionInUrl: false, persistSession: true, autoRefreshToken: true },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(15_000) }) },
  });
  let verified: CareCredential | null = null;
  const checkError = (error: { message: string } | null) => { if (error) throw new CareError('auth_failed', 'Care account sign-in could not be completed. Check the account and project setup.'); };
  const auth: CareAuthAdapter = {
    async credential() {
      const { data, error } = await sdk.auth.getSession(); checkError(error);
      if (!data.session) { verified = null; return null; }
      const token = data.session.access_token;
      if (verified?.token === token) return verified;
      const user = await sdk.auth.getUser(token); checkError(user.error);
      if (!user.data.user || typeof user.data.user.is_anonymous !== 'boolean') throw new CareError('auth_failed', 'The care account identity could not be verified.');
      verified = { token, userId: user.data.user.id, anonymous: user.data.user.is_anonymous };
      return verified;
    },
    async signIn(email, password) { const result = await sdk.auth.signInWithPassword({ email, password }); checkError(result.error); },
    async signInAnonymous() { const result = await sdk.auth.signInAnonymously(); checkError(result.error); },
    async signOut() { const result = await sdk.auth.signOut(); verified = null; checkError(result.error); },
    onChange(callback) { const result = sdk.auth.onAuthStateChange(() => { verified = null; callback(); }); return () => result.data.subscription.unsubscribe(); },
  };
  const request = async (path: string, token: string, signal: AbortSignal, body?: Record<string, unknown>) => {
    const response = await fetch(`${config.url}/rest/v1/${path}`, { method: body ? 'POST' : 'GET', redirect: 'error', signal,
      headers: { apikey: config.publishableKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw new CareError('request_failed', `The care service refused this operation (${response.status}). Refresh your account and try again.`);
    return response.json() as Promise<unknown>;
  };
  const service = new CareService({ auth, rpc: (name, args, token, signal) => request(`rpc/${name}`, token, signal, args),
    list: (table, token, signal) => request(`${table}?select=*&order=created_at.asc`, token, signal) });
  const dispose = service.dispose.bind(service);
  let disposing: Promise<void> | undefined;
  service.dispose = () => disposing ??= (async () => {
    await dispose();
    // Construction initializes Auth asynchronously and can start its timer later.
    // Settle that work before final cleanup and before releasing the factory guard.
    await sdk.auth.initialize();
    await sdk.auth.dispose();
    if (instances.get(config.url) === service) instances.delete(config.url);
  })();
  instances.set(config.url, service);
  return service;
}
