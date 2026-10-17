// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asIdentity, createCareDatabase, rpc, type DatabaseIdentity } from './database.test-support';

interface Group { id: string; owner_id: string; name: string; created_at: string }
interface Participant { id: string; group_id: string; alias: string; user_id: string | null; revoked_at: string | null; created_at: string }
interface Request { id: string; group_id: string; participant_id: string; kind: string; status: string; revision: number; created_at: string; updated_at: string }
interface Access { version: 1; role: string; group: Group | null; participant: Participant | null; receiver_name: string | null }
interface Invite { version: 1; token: string; expires_at: string; participant_id: string }
interface Redeem { version: 1; ok: boolean; code?: string; participant?: Participant }
const person = (anonymous: boolean): DatabaseIdentity => ({ id: randomUUID(), anonymous });

describe('care foundation in PostgreSQL: roles, RLS and RPCs', () => {
  let db: PGlite;
  let ownerA: DatabaseIdentity, ownerB: DatabaseIdentity, a1: DatabaseIdentity, a2: DatabaseIdentity, b1: DatabaseIdentity;
  let groupA: Group, groupB: Group, participantA1: Participant, participantA2: Participant, participantB1: Participant;
  const invoke = <T = Record<string, unknown>>(who: DatabaseIdentity, name: string, args: unknown[] = []) => rpc<T>(db, who, name, args);
  const send = async (who = a1, kind = 'water', id: string = randomUUID()) =>
    (await invoke<{ version: 1; request: Request }>(who, 'motif_send_request', [id, kind])).request;
  const transition = async (who: DatabaseIdentity, request: Request, status: string) =>
    (await invoke<{ version: 1; request: Request }>(who, 'motif_transition_request', [request.id, request.revision, status])).request;
  async function makeParticipant(owner: DatabaseIdentity, alias: string, device?: DatabaseIdentity) {
    const { participant } = await invoke<{ version: 1; participant: Participant }>(owner, 'motif_create_participant', [alias]);
    if (!device) return participant;
    const invitation = await invoke<Invite>(owner, 'motif_create_invite', [participant.id]);
    const paired = await invoke<Redeem>(device, 'motif_redeem_invite', [invitation.token]);
    expect(paired.ok).toBe(true);
    return paired.participant!;
  }

  beforeAll(async () => { db = await createCareDatabase(); }, 30_000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec('truncate table public.care_groups, public.participants, public.care_requests, care_private.invites, care_private.invite_attempts cascade');
    ownerA = person(false); ownerB = person(false); a1 = person(true); a2 = person(true); b1 = person(true);
    groupA = (await invoke<{ group: Group }>(ownerA, 'motif_create_group', ['Care A'])).group;
    groupB = (await invoke<{ group: Group }>(ownerB, 'motif_create_group', ['Care B'])).group;
    participantA1 = await makeParticipant(ownerA, 'Alex', a1);
    participantA2 = await makeParticipant(ownerA, 'Alex', a2);
    participantB1 = await makeParticipant(ownerB, 'Other person', b1);
  });

  it('executes RLS as authenticated/anon roles, never as a client superuser', async () => {
    expect(await asIdentity(db, a1, 'select current_user as name')).toEqual([{ name: 'authenticated' }]);
    await expect(asIdentity(db, { id: null, role: 'anon' }, 'select * from public.care_requests')).rejects.toThrow(/permission denied/);
    await expect(invoke({ id: null, role: 'anon' }, 'motif_access')).rejects.toThrow(/permission denied/);
  });

  it('requires explicit signed anonymous claims and ignores user metadata roles', async () => {
    await expect(invoke({ id: randomUUID(), metadata: { is_anonymous: false, role: 'caregiver' } }, 'motif_create_group', ['Fake'])).rejects.toThrow(/verified authenticated identity/);
    await expect(invoke({ id: randomUUID(), anonymous: 'false' }, 'motif_create_group', ['Fake'])).rejects.toThrow(/verified authenticated identity/);
    await expect(invoke(a1, 'motif_create_group', ['Fake'])).rejects.toThrow(/caregiver account/);
    await expect(invoke({ id: null, anonymous: false }, 'motif_access')).rejects.toThrow(/verified authenticated identity/);
    expect(await invoke<Access>(person(false), 'motif_access')).toMatchObject({ version: 1, role: 'caregiver', group: null, participant: null, receiver_name: null });
    expect(await invoke<Access>(person(true), 'motif_access')).toMatchObject({ version: 1, role: 'unpaired', group: null, participant: null });
    expect(await asIdentity(db, { id: ownerA.id }, 'select * from public.care_groups')).toEqual([]);
    expect(await asIdentity(db, { id: a1.id, anonymous: 'true' }, 'select * from public.care_requests')).toEqual([]);
  });

  it('limits caregivers to their group and participants to their own binding/requests', async () => {
    const one = await send(a1); const two = await send(a2); const other = await send(b1);
    const ids = async (who: DatabaseIdentity, table: string) => (await asIdentity<{ id: string }>(db, who, `select id from public.${table} order by id`)).map((row) => row.id).sort();
    expect(await ids(ownerA, 'care_groups')).toEqual([groupA.id]);
    expect(await ids(ownerB, 'care_groups')).toEqual([groupB.id]);
    expect(await ids(a1, 'care_groups')).toEqual([]);
    expect(await ids(ownerA, 'participants')).toEqual([participantA1.id, participantA2.id].sort());
    expect(await ids(a1, 'participants')).toEqual([participantA1.id]);
    expect(await ids(ownerA, 'care_requests')).toEqual([one.id, two.id].sort());
    expect(await ids(a1, 'care_requests')).toEqual([one.id]);
    expect(await ids(a2, 'care_requests')).toEqual([two.id]);
    expect(await ids(ownerB, 'care_requests')).toEqual([other.id]);
    expect(await asIdentity(db, a1, 'select * from public.care_requests where id = $1', [two.id])).toEqual([]);
    expect(await invoke<Access>(a1, 'motif_access')).toMatchObject({ role: 'participant', group: null, participant: participantA1, receiver_name: 'Care A' });
  });

  it('denies direct writes and all private invitation/attempt reads', async () => {
    for (const who of [ownerA, a1]) {
      await expect(asIdentity(db, who, 'update public.participants set user_id = $1 where id = $2', [a1.id, participantB1.id])).rejects.toThrow(/permission denied/);
      await expect(asIdentity(db, who, 'delete from public.care_requests')).rejects.toThrow(/permission denied/);
      await expect(asIdentity(db, who, 'insert into public.care_groups(owner_id,name) values ($1,$2)', [who.id, 'Fake'])).rejects.toThrow(/permission denied/);
      await expect(asIdentity(db, who, 'select * from care_private.invites')).rejects.toThrow(/permission denied/);
      await expect(asIdentity(db, who, 'select * from care_private.invite_attempts')).rejects.toThrow(/permission denied/);
      await expect(asIdentity(db, who, 'select care_private.owner_group()')).rejects.toThrow(/permission denied/);
    }
  });

  it('does not let another caregiver create invitations or revoke foreign participants', async () => {
    const waiting = await makeParticipant(ownerA, 'Waiting');
    await expect(invoke(ownerB, 'motif_create_invite', [waiting.id])).rejects.toThrow(/your group/);
    await expect(invoke(ownerB, 'motif_revoke_participant', [participantA1.id])).rejects.toThrow(/your group/);
    await expect(invoke(a1, 'motif_create_participant', ['Someone'])).rejects.toThrow(/caregiver account/);
    await expect(invoke(ownerA, 'motif_create_invite', [participantA1.id])).rejects.toThrow(/unpaired participant/);
    await expect(invoke(ownerA, 'motif_redeem_invite', ['a'.repeat(64)])).rejects.toThrow(/anonymous participant/);
  });

  it('stores only hashed invitations and makes replacement/single-use invitations real', async () => {
    const waiting = await makeParticipant(ownerA, 'New person');
    const first = await invoke<Invite>(ownerA, 'motif_create_invite', [waiting.id]);
    const second = await invoke<Invite>(ownerA, 'motif_create_invite', [waiting.id]);
    expect(second.token).toMatch(/^[0-9a-f]{64}$/);
    expect(second.token).not.toBe(first.token);
    expect(Date.parse(second.expires_at) - Date.now()).toBeGreaterThan(9 * 60_000);
    const stored = await db.query<{ token_hash: string }>('select token_hash from care_private.invites where participant_id=$1', [waiting.id]);
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]!.token_hash).not.toBe(second.token);
    const device = person(true);
    expect(await invoke<Redeem>(device, 'motif_redeem_invite', [first.token])).toMatchObject({ ok: false, code: 'invalid_invite' });
    expect(await invoke<Redeem>(device, 'motif_redeem_invite', [second.token])).toMatchObject({ ok: true, participant: { id: waiting.id, user_id: device.id } });
    expect(await invoke<Redeem>(person(true), 'motif_redeem_invite', [second.token])).toMatchObject({ ok: false, code: 'invalid_invite' });
    expect(await invoke<Redeem>(a1, 'motif_redeem_invite', [second.token])).toMatchObject({ ok: false, code: 'already_paired' });
  });

  it('expires invitations and commits bounded failed-attempt accounting', async () => {
    const waiting = await makeParticipant(ownerA, 'Waiting');
    const invite = await invoke<Invite>(ownerA, 'motif_create_invite', [waiting.id]);
    await db.query("update care_private.invites set expires_at=now()-interval '1 second' where participant_id=$1", [waiting.id]);
    const device = person(true);
    expect(await invoke<Redeem>(device, 'motif_redeem_invite', [invite.token])).toMatchObject({ ok: false, code: 'invalid_invite' });
    for (let index = 0; index < 9; index++) expect(await invoke<Redeem>(device, 'motif_redeem_invite', ['invalid'])).toMatchObject({ code: 'invalid_invite' });
    const fresh = await invoke<Invite>(ownerA, 'motif_create_invite', [waiting.id]);
    expect(await invoke<Redeem>(device, 'motif_redeem_invite', [fresh.token])).toMatchObject({ code: 'rate_limited' });
    expect((await db.query<{ attempts: number }>('select attempts from care_private.invite_attempts where user_id=$1', [device.id])).rows[0]!.attempts).toBe(11);
    await db.query("update care_private.invite_attempts set window_start=now()-interval '11 minutes' where user_id=$1", [device.id]);
    expect(await invoke<Redeem>(device, 'motif_redeem_invite', [fresh.token])).toMatchObject({ ok: true });
  });

  it('permits the tenth pairing attempt and invalidates an unused invite on explicit revocation', async () => {
    const waiting = await makeParticipant(ownerA, 'Waiting');
    const invite = await invoke<Invite>(ownerA, 'motif_create_invite', [waiting.id]);
    const device = person(true);
    for (let index = 0; index < 9; index++) await invoke<Redeem>(device, 'motif_redeem_invite', ['bad']);
    expect(await invoke<Redeem>(device, 'motif_redeem_invite', [invite.token])).toMatchObject({ ok: true });
    const another = await makeParticipant(ownerA, 'Another');
    const next = await invoke<Invite>(ownerA, 'motif_create_invite', [another.id]);
    await invoke(ownerA, 'motif_revoke_participant', [another.id]);
    expect(await invoke<Redeem>(person(true), 'motif_redeem_invite', [next.token])).toMatchObject({ ok: false, code: 'invalid_invite' });
    await expect(invoke(ownerA, 'motif_create_invite', [another.id])).rejects.toThrow(/unpaired participant/);
  });

  it('derives request identity server-side and retries the original ID without duplication', async () => {
    const first = await send();
    expect(first).toMatchObject({ participant_id: participantA1.id, group_id: groupA.id, status: 'sent', revision: 1 });
    expect(Object.keys(first).sort()).toEqual(['id', 'group_id', 'participant_id', 'kind', 'status', 'revision', 'created_at', 'updated_at'].sort());
    expect(await send(a1, 'water', first.id)).toEqual(first);
    await expect(send(a1, 'help', first.id)).rejects.toThrow(/cannot be reused/);
    await expect(send(a2, 'water', first.id)).rejects.toThrow(/cannot be reused/);
    await expect(send(b1, 'water', first.id)).rejects.toThrow(/cannot be reused/);
    await expect(send(ownerA)).rejects.toThrow(/active participant/);
    await expect(send(person(true))).rejects.toThrow(/active participant/);
    await expect(send(a1, 'emergency')).rejects.toThrow(/supported request kind/);
    expect((await asIdentity(db, ownerA, 'select * from public.care_requests')).length).toBe(1);
  });

  it('enforces state transitions, role permissions, revisions and terminal states', async () => {
    const sent = await send();
    await expect(transition(a2, sent, 'cancelled')).rejects.toThrow(/not available/);
    await expect(transition(ownerB, sent, 'acknowledged')).rejects.toThrow(/not available/);
    await expect(transition(a1, sent, 'acknowledged')).rejects.toThrow(/not allowed/);
    await expect(transition(ownerA, sent, 'completed')).rejects.toThrow(/not allowed/);
    await expect(transition(ownerA, sent, 'cancelled')).rejects.toThrow(/not allowed/);
    const acknowledged = await transition(ownerA, sent, 'acknowledged');
    expect(acknowledged).toMatchObject({ status: 'acknowledged', revision: 2 });
    await expect(transition(a1, sent, 'cancelled')).rejects.toThrow(/request changed/);
    const completed = await transition(ownerA, acknowledged, 'completed');
    expect(completed).toMatchObject({ status: 'completed', revision: 3 });
    await expect(transition(a1, completed, 'cancelled')).rejects.toThrow(/not allowed/);
    await expect(transition(ownerA, completed, 'acknowledged')).rejects.toThrow(/not allowed/);
    expect(await send(a1, 'water', sent.id)).toEqual(completed);
  });

  it('lets only the sender cancel a nonterminal request and rejects stale acknowledgement races', async () => {
    const sent = await send();
    const cancelled = await transition(a1, sent, 'cancelled');
    expect(cancelled).toMatchObject({ status: 'cancelled', revision: 2 });
    await expect(transition(ownerA, sent, 'acknowledged')).rejects.toThrow(/request changed/);
    await expect(transition(ownerA, cancelled, 'acknowledged')).rejects.toThrow(/not allowed/);
    const second = await transition(ownerA, await send(a1, 'help'), 'acknowledged');
    expect(await transition(a1, second, 'cancelled')).toMatchObject({ status: 'cancelled', revision: 3 });
  });

  it('enforces revocation against the same still-valid participant JWT', async () => {
    const request = await send();
    const revoked = await invoke<{ participant: Participant }>(ownerA, 'motif_revoke_participant', [participantA1.id]);
    expect(revoked.participant.revoked_at).not.toBeNull();
    expect(await invoke<Access>(a1, 'motif_access')).toMatchObject({ role: 'revoked', group: null, participant: revoked.participant, receiver_name: null });
    expect(await asIdentity(db, a1, 'select * from public.care_requests')).toEqual([]);
    expect(await asIdentity(db, a1, 'select * from public.participants')).toEqual([expect.objectContaining({ id: participantA1.id })]);
    await expect(send(a1, 'water', request.id)).rejects.toThrow(/revoked/);
    await expect(transition(a1, request, 'cancelled')).rejects.toThrow(/not available/);
    expect(await asIdentity(db, ownerA, 'select * from public.care_requests')).toHaveLength(1);
    expect(await send(a2)).toMatchObject({ participant_id: participantA2.id });
  });

  it('revokes unused invitations and clears only the owning group with retained revoked bindings', async () => {
    await send(); await send(a2); const other = await send(b1);
    const waiting = await makeParticipant(ownerA, 'Not yet paired');
    const invite = await invoke<Invite>(ownerA, 'motif_create_invite', [waiting.id]);
    await expect(invoke(a1, 'motif_clear_group')).rejects.toThrow(/caregiver account/);
    expect(await invoke(ownerA, 'motif_clear_group')).toEqual({ version: 1, cleared: true });
    expect(await asIdentity(db, ownerA, 'select * from public.care_requests')).toEqual([]);
    expect(await asIdentity(db, ownerB, 'select * from public.care_requests')).toEqual([expect.objectContaining({ id: other.id })]);
    expect(await asIdentity(db, ownerA, 'select * from public.care_groups')).toHaveLength(1);
    expect(await asIdentity(db, ownerA, 'select * from public.participants')).toHaveLength(3);
    expect(await invoke<Access>(a1, 'motif_access')).toMatchObject({ role: 'revoked' });
    expect(await invoke<Redeem>(person(true), 'motif_redeem_invite', [invite.token])).toMatchObject({ code: 'invalid_invite' });
    expect((await db.query('select * from care_private.invite_attempts where user_id=$1', [a1.id])).rows).toEqual([]);
    await expect(invoke(ownerA, 'motif_create_invite', [participantA1.id])).rejects.toThrow(/unpaired participant/);
    expect(await makeParticipant(ownerA, 'Fresh setup')).toMatchObject({ revoked_at: null, user_id: null });
  });

  it('uses hardened definer RPCs without publishing any table or granting anonymous execution', async () => {
    const functions = (await db.query<{ proname: string; prosecdef: boolean; proconfig: string[]; authenticated: boolean; anonymous: boolean }>(
      `select proname, prosecdef, proconfig, has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
        has_function_privilege('anon', p.oid, 'EXECUTE') as anonymous
        from pg_proc p join pg_namespace n on n.oid=pronamespace where n.nspname='public' and proname like 'motif_%'`,
    )).rows;
    expect(functions).toHaveLength(9);
    for (const fn of functions) {
      expect(fn.prosecdef).toBe(true);
      expect(fn.proconfig).toContain('search_path=""');
      expect(fn.authenticated).toBe(true);
      expect(fn.anonymous).toBe(false);
    }
    const helpers = (await db.query<{ authenticated: boolean; anonymous: boolean }>(
      `select has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
        has_function_privilege('anon', p.oid, 'EXECUTE') as anonymous
        from pg_proc p join pg_namespace n on n.oid=pronamespace where n.nspname='care_private'`,
    )).rows;
    expect(helpers).toHaveLength(2);
    expect(helpers.every((helper) => !helper.authenticated && !helper.anonymous)).toBe(true);
    expect((await db.query("select * from pg_publication_tables where tablename in ('care_groups','participants','care_requests')")).rows).toEqual([]);
    await expect(invoke({ id: null, role: 'anon' }, 'motif_clear_group')).rejects.toThrow(/permission denied/);
  });
});
