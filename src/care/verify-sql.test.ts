// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { createCareDatabase, rpc } from './database.test-support';

vi.setConfig({ testTimeout: 30_000 });

/** The pasteable Supabase check (supabase/checks/verify-care.sql) runs and reports the real migration as correct. */
async function setup() {
  const db = await createCareDatabase();
  // Hosted Supabase provides auth.users and a Realtime publication; the harness adds minimal stand-ins.
  await db.exec(`create table auth.users (id uuid primary key, is_anonymous boolean not null default false, email_confirmed_at timestamptz);
    create publication supabase_realtime;`);
  const sql = await readFile(new URL('../../supabase/checks/verify-care.sql', import.meta.url), 'utf8');
  const run = async () => (await db.query<{ check: string; ok: boolean; detail: string | null }>(sql)).rows;
  return { db, run };
}

describe('database check script', () => {
  it('passes every rule on the real migration and summarizes the data', async () => {
    const { db, run } = await setup();
    const owner = '00000000-0000-4000-8000-0000000000aa';
    await db.query(`insert into auth.users (id, email_confirmed_at) values ($1, now())`, [owner]);
    await rpc(db, { id: owner, anonymous: false }, 'motif_create_group', ['GG']);
    await rpc(db, { id: owner, anonymous: false }, 'motif_create_participant', ['Alex']);
    const rows = await run();
    expect(rows.filter((row) => !row.ok)).toEqual([]);
    expect(rows.find((row) => row.check === 'data: care groups')?.detail).toBe('GG (1 active people)');
    expect(rows.find((row) => row.check === 'data: people paired / waiting / removed')?.detail).toBe('0 / 1 / 0');
    expect(rows.find((row) => row.check === 'data: confirmed caregiver accounts')?.detail).toBe('1');
    await db.close();
  });

  it('fails the matching rules when security is loosened', async () => {
    const { db, run } = await setup();
    await db.exec(`alter table public.care_requests disable row level security;
      grant select on public.participants to anon;
      grant insert on public.care_requests to authenticated;
      grant execute on function public.motif_access() to anon;
      alter publication supabase_realtime add table public.care_requests;`);
    const failed = (await run()).filter((row) => !row.ok).map((row) => row.check);
    expect(failed).toEqual([
      'row-level security is on for all three',
      'signed-out callers (anon) cannot read the tables',
      'signed-in callers can only read, never write directly',
      'functions: signed-in may call, signed-out may not',
      'no care table is in a Realtime publication',
    ]);
    await db.close();
  });
});
