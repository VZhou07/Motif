import type { PGlite } from '@electric-sql/pglite';
import { CareService } from '../../care/client';
import type { CareCredential, CareTransport } from '../../care/client';
import { CareError } from '../../care';
import type { CareRequest } from '../../care';
import { asIdentity, createCareDatabase, rpc, type DatabaseIdentity } from '../../care/database.test-support';

/**
 * Test-only backend: the real CareService over Agent 3's PGlite harness, so every read and
 * mutation runs the actual SQL functions and row-level security. Only hosted Auth JWT
 * verification is simulated, exactly as in the foundation's own tests.
 */
export interface Faults {
  /** Every transport call rejects like a dropped connection. */
  offline: boolean;
  /** The next N list calls reject. */
  failLists: number;
  /** After the next successful send RPC, the client's reload list fails (stored, but not confirmed). */
  failListAfterSend: boolean;
  /** RPCs with this name reject like a dropped connection, before reaching the database. */
  failRpc: string | null;
  /** When set, RPCs with this name wait for the gate before reaching the database. */
  hold: { name: string; gate: Promise<void> } | null;
}

export interface Device {
  client: CareService;
  transport: CareTransport;
  faults: Faults;
  /** Fires an SDK-style auth event without changing the credential (e.g. hourly token refresh). */
  tokenRefresh(): void;
  credential(): CareCredential | null;
  /** Another tab changed the shared browser session: adopt that credential and fire an auth event. */
  adopt(credential: CareCredential | null): void;
  /** Sign this device in as a caregiver account (pre-provisioned demo account). */
  signInCaregiver(owner: Caregiver): void;
}

export interface Caregiver { identity: DatabaseIdentity; groupName: string }

let counter = 0;
const nextUuid = () => `00000000-0000-4000-9000-${(++counter).toString(16).padStart(12, '0')}`;

export function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

export async function settle(rounds = 40): Promise<void> {
  for (let i = 0; i < rounds; i++) await new Promise((done) => setTimeout(done, 0));
}

export async function createCareWorld() {
  const db: PGlite = await createCareDatabase();
  const tokens = new Map<string, DatabaseIdentity>();
  const devices: Device[] = [];

  async function caregiver(groupName: string): Promise<Caregiver> {
    const identity: DatabaseIdentity = { id: nextUuid(), anonymous: false };
    await rpc(db, identity, 'motif_create_group', [groupName]);
    return { identity, groupName };
  }

  async function invite(owner: Caregiver, alias: string): Promise<{ participantId: string; token: string }> {
    const created = await rpc<{ participant: { id: string } }>(db, owner.identity, 'motif_create_participant', [alias]);
    const invitation = await rpc<{ token: string }>(db, owner.identity, 'motif_create_invite', [created.participant.id]);
    return { participantId: created.participant.id, token: invitation.token };
  }

  async function transition(owner: Caregiver, id: string, status: 'acknowledged' | 'completed'): Promise<CareRequest> {
    const [current] = await asIdentity<{ revision: number }>(db, owner.identity, 'select revision from public.care_requests where id = $1', [id]);
    if (!current) throw new Error('Request not visible to this caregiver.');
    const result = await rpc<{ request: CareRequest }>(db, owner.identity, 'motif_transition_request', [id, current.revision, status]);
    return result.request;
  }

  async function revoke(owner: Caregiver, participantId: string): Promise<void> {
    await rpc(db, owner.identity, 'motif_revoke_participant', [participantId]);
  }

  async function rows(): Promise<CareRequest[]> {
    const result = await db.query<CareRequest>('select * from public.care_requests order by created_at');
    return result.rows;
  }

  function device(): Device {
    let current: CareCredential | null = null;
    const callbacks = new Set<() => void>();
    const emit = () => { for (const callback of callbacks) callback(); };
    const faults: Faults = { offline: false, failLists: 0, failListAfterSend: false, failRpc: null, hold: null };
    let armedListFailure = false;
    const identityFor = (token: string): DatabaseIdentity => {
      const identity = tokens.get(token);
      if (!identity) throw new CareError('request_failed', 'The care service refused this operation (401). Refresh your account and try again.');
      return identity;
    };
    const transport: CareTransport = {
      auth: {
        credential: async () => {
          if (faults.offline) throw new TypeError('Failed to fetch');
          return current;
        },
        signIn: async () => { throw new CareError('auth_failed', 'Participant devices do not use passwords in these tests.'); },
        signInAnonymous: async () => {
          if (faults.offline) throw new TypeError('Failed to fetch');
          const userId = nextUuid();
          const token = `token-${userId}`;
          tokens.set(token, { id: userId, anonymous: true });
          current = { token, userId, anonymous: true };
          emit();
        },
        signOut: async () => { current = null; emit(); },
        onChange: (callback) => { callbacks.add(callback); return () => callbacks.delete(callback); },
      },
      rpc: async (name, args, token) => {
        if (faults.offline) throw new TypeError('Failed to fetch');
        if (faults.hold?.name === name) await faults.hold.gate;
        if (faults.offline || faults.failRpc === name) throw new TypeError('Failed to fetch');
        if (!/^motif_[a-z_]+$/.test(name)) throw new Error('Unexpected RPC name.');
        const keys = Object.keys(args);
        if (!keys.every((key) => /^p_[a-z_]+$/.test(key))) throw new Error('Unexpected RPC argument.');
        const call = `select public.${name}(${keys.map((key, index) => `${key} => $${index + 1}`).join(', ')}) as result`;
        try {
          const [row] = await asIdentity<{ result: unknown }>(db, identityFor(token), call, keys.map((key) => args[key]));
          if (name === 'motif_send_request' && faults.failListAfterSend) { faults.failListAfterSend = false; armedListFailure = true; }
          return row!.result;
        } catch (error) {
          if (error instanceof CareError) throw error;
          throw new CareError('request_failed', 'The care service refused this operation (400). Refresh your account and try again.');
        }
      },
      list: async (table, token) => {
        if (faults.offline) throw new TypeError('Failed to fetch');
        if (armedListFailure) { armedListFailure = false; throw new TypeError('Failed to fetch'); }
        if (faults.failLists > 0) { faults.failLists -= 1; throw new TypeError('Failed to fetch'); }
        if (table !== 'participants' && table !== 'care_requests') throw new Error('Unexpected table.');
        // PostgREST returns JSON, so timestamps arrive as strings exactly as in the real adapter.
        const [row] = await asIdentity<{ rows: unknown }>(db, identityFor(token),
          `select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb) as rows from public.${table} t`);
        return row!.rows;
      },
    };
    const client = new CareService(transport);
    const result: Device = {
      client, transport, faults, tokenRefresh: emit, credential: () => current,
      adopt: (credential) => { current = credential; emit(); },
      signInCaregiver: (owner) => {
        const token = `token-caregiver-${owner.identity.id}`;
        tokens.set(token, owner.identity);
        current = { token, userId: owner.identity.id!, anonymous: false };
        emit();
      },
    };
    devices.push(result);
    return result;
  }

  async function close(): Promise<void> {
    for (const entry of devices) entry.faults.hold = null;
    await Promise.all(devices.map((entry) => entry.client.dispose().catch(() => {})));
    await db.close();
  }

  return { db, caregiver, invite, transition, revoke, rows, device, close };
}
