import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

export interface DatabaseIdentity { id: string | null; anonymous?: boolean | string; role?: 'anon' | 'authenticated'; metadata?: object }

/** Actual PostgreSQL roles/policies. Auth JWT verification itself belongs to hosted Supabase. */
export async function createCareDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as
      $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on all functions in schema auth to anon, authenticated;
  `);
  await db.exec(await readFile(new URL('../../supabase/migrations/202610170001_care_foundation.sql', import.meta.url), 'utf8'));
  return db;
}

export async function asIdentity<T = Record<string, unknown>>(
  db: PGlite, identity: DatabaseIdentity, sql: string, params: unknown[] = [],
): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${identity.role ?? 'authenticated'}`);
    const claims = { sub: identity.id, role: identity.role ?? 'authenticated',
      ...(identity.anonymous === undefined ? {} : { is_anonymous: identity.anonymous }),
      user_metadata: identity.metadata ?? {} };
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    const result = await tx.query<T>(sql, params);
    return result.rows;
  });
}

export async function rpc<T = Record<string, unknown>>(
  db: PGlite, identity: DatabaseIdentity, name: string, args: unknown[] = [],
): Promise<T> {
  if (!/^motif_[a-z_]+$/.test(name)) throw new Error('Test RPC name must be fixed and safe.');
  const params = args.map((_, index) => `$${index + 1}`).join(',');
  const rows = await asIdentity<{ result: T }>(db, identity, `select public.${name}(${params}) as result`, args);
  return rows[0]!.result;
}
