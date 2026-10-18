-- Motif care database check. Read-only: paste into the Supabase SQL Editor and Run.
-- Every row should say ok = true; the "data:" rows describe what is stored right now.
with
tables as (
  select c.relname, c.relrowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('care_groups', 'participants', 'care_requests')
),
funcs as (
  select p.oid, p.proname, p.prosecdef
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('motif_access', 'motif_create_group', 'motif_create_participant',
    'motif_create_invite', 'motif_redeem_invite', 'motif_revoke_participant', 'motif_send_request',
    'motif_transition_request', 'motif_clear_group')
),
checks(sort, name, ok, detail) as (
  select 1, 'the three care tables exist', (select count(*) = 3 from tables),
    (select string_agg(relname, ', ' order by relname) from tables)
  union all
  select 2, 'row-level security is on for all three', (select count(*) = 3 and bool_and(relrowsecurity) from tables), null
  union all
  select 3, 'exactly the three reader policies exist',
    (select count(*) = 3 from pg_policies where schemaname = 'public'
      and policyname in ('care_group_owner', 'care_participant_reader', 'care_request_reader')),
    (select string_agg(policyname, ', ' order by policyname) from pg_policies where schemaname = 'public'
      and tablename in ('care_groups', 'participants', 'care_requests'))
  union all
  select 4, 'signed-out callers (anon) cannot read the tables',
    (select bool_and(not has_table_privilege('anon', format('public.%I', relname), 'select')) from tables), null
  union all
  select 5, 'signed-in callers can only read, never write directly',
    (select bool_and(has_table_privilege('authenticated', format('public.%I', relname), 'select')
      and not has_table_privilege('authenticated', format('public.%I', relname), 'insert')
      and not has_table_privilege('authenticated', format('public.%I', relname), 'update')
      and not has_table_privilege('authenticated', format('public.%I', relname), 'delete')) from tables), null
  union all
  select 6, 'invitations are private (no access to care_private)',
    not has_schema_privilege('anon', 'care_private', 'usage') and not has_schema_privilege('authenticated', 'care_private', 'usage'), null
  union all
  select 7, 'all nine motif_ functions exist and run as definer', (select count(*) = 9 and bool_and(prosecdef) from funcs),
    (select count(*)::text || ' found' from funcs)
  union all
  select 8, 'functions: signed-in may call, signed-out may not',
    (select bool_and(has_function_privilege('authenticated', oid, 'execute') and not has_function_privilege('anon', oid, 'execute')) from funcs), null
  union all
  select 9, 'no care table is in a Realtime publication',
    not exists (select 1 from pg_publication_tables where schemaname = 'public' and tablename in ('care_groups', 'participants', 'care_requests')), null
  union all
  select 10, 'every care group belongs to a confirmed e-mail account',
    not exists (select 1 from public.care_groups g left join auth.users u on u.id = g.owner_id
      where u.id is null or u.is_anonymous or u.email_confirmed_at is null), null
  union all
  select 20, 'data: confirmed caregiver accounts', true,
    (select count(*)::text from auth.users where not is_anonymous and email_confirmed_at is not null)
  union all
  select 21, 'data: care groups', true,
    (select coalesce(string_agg(name || ' (' || (select count(*) from public.participants p where p.group_id = g.id and p.revoked_at is null) || ' active people)', ', '), 'none') from public.care_groups g)
  union all
  select 22, 'data: people paired / waiting / removed', true,
    (select count(*) filter (where user_id is not null and revoked_at is null) || ' / ' || count(*) filter (where user_id is null and revoked_at is null)
      || ' / ' || count(*) filter (where revoked_at is not null) from public.participants)
  union all
  select 23, 'data: requests sent / acknowledged / completed / cancelled', true,
    (select count(*) filter (where status = 'sent') || ' / ' || count(*) filter (where status = 'acknowledged') || ' / '
      || count(*) filter (where status = 'completed') || ' / ' || count(*) filter (where status = 'cancelled') from public.care_requests)
  union all
  select 24, 'data: unused invitations still valid', true,
    (select count(*)::text from care_private.invites where redeemed_at is null and expires_at > now())
)
select name as check, ok, detail from checks order by sort;
