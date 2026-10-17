-- Motif request-only foundation. No tables are added to Realtime publications:
-- Postgres Changes DELETE notifications cannot enforce row-level privacy.
begin;
create schema if not exists care_private;
revoke all on schema care_private from public, anon, authenticated;

create table public.care_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique,
  name text not null check (length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);
create table public.participants (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.care_groups(id),
  alias text not null check (length(btrim(alias)) between 1 and 60),
  user_id uuid unique,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, group_id)
);
create table public.care_requests (
  id uuid primary key,
  group_id uuid not null references public.care_groups(id),
  participant_id uuid not null,
  kind text not null check (kind in ('water', 'bathroom', 'reposition', 'help')),
  status text not null default 'sent' check (status in ('sent', 'acknowledged', 'completed', 'cancelled')),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (participant_id, group_id) references public.participants(id, group_id)
);
create index care_requests_group on public.care_requests(group_id, created_at);
create index care_requests_participant on public.care_requests(participant_id, created_at);
create index participants_group on public.participants(group_id);

create table care_private.invites (
  token_hash text primary key,
  participant_id uuid not null references public.participants(id),
  expires_at timestamptz not null,
  redeemed_at timestamptz
);
create index invites_participant on care_private.invites(participant_id);
create table care_private.invite_attempts (
  user_id uuid primary key,
  window_start timestamptz not null,
  attempts integer not null check (attempts > 0)
);

alter table public.care_groups enable row level security;
alter table public.participants enable row level security;
alter table public.care_requests enable row level security;
revoke all on public.care_groups, public.participants, public.care_requests from public, anon, authenticated;
grant select on public.care_groups, public.participants, public.care_requests to authenticated;
revoke all on all tables in schema care_private from public, anon, authenticated;

create policy care_group_owner on public.care_groups for select to authenticated using (
  owner_id = (select auth.uid()) and (select auth.jwt()->'is_anonymous') = 'false'::jsonb
);
create policy care_participant_reader on public.participants for select to authenticated using (
  (user_id = (select auth.uid()) and (select auth.jwt()->'is_anonymous') = 'true'::jsonb)
  or exists (select 1 from public.care_groups g where g.id = group_id)
);
create policy care_request_reader on public.care_requests for select to authenticated using (
  exists (select 1 from public.care_groups g where g.id = group_id)
  or exists (select 1 from public.participants p where p.id = participant_id
    and p.user_id = (select auth.uid()) and p.revoked_at is null
    and (select auth.jwt()->'is_anonymous') = 'true'::jsonb)
);

-- Signed top-level claims only; missing/malformed anonymous claims fail closed.
create function care_private.actor() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or auth.jwt()->'is_anonymous' is null
    or auth.jwt()->'is_anonymous' not in ('true'::jsonb, 'false'::jsonb) then
    raise exception 'A verified authenticated identity is required.' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

create function care_private.owner_group() returns public.care_groups
language plpgsql security definer set search_path = '' as $$
declare g public.care_groups;
begin
  perform care_private.actor();
  if auth.jwt()->'is_anonymous' <> 'false'::jsonb then
    raise exception 'A caregiver account is required.' using errcode = '42501';
  end if;
  select * into g from public.care_groups where owner_id = auth.uid() for update;
  if not found then raise exception 'Create a care group first.' using errcode = '42501'; end if;
  return g;
end $$;

create function public.motif_access() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare g public.care_groups; p public.participants; receiver text;
begin
  perform care_private.actor();
  if auth.jwt()->'is_anonymous' = 'false'::jsonb then
    select * into g from public.care_groups where owner_id = auth.uid();
    return jsonb_build_object('version', 1, 'role', 'caregiver', 'group',
      case when g.id is null then null else to_jsonb(g) end, 'participant', null, 'receiver_name', g.name);
  end if;
  select * into p from public.participants where user_id = auth.uid();
  if not found then
    return jsonb_build_object('version', 1, 'role', 'unpaired', 'group', null, 'participant', null, 'receiver_name', null);
  end if;
  if p.revoked_at is null then select name into receiver from public.care_groups where id = p.group_id; end if;
  return jsonb_build_object('version', 1, 'role', case when p.revoked_at is null then 'participant' else 'revoked' end,
    'group', null, 'participant', to_jsonb(p), 'receiver_name', receiver);
end $$;

create function public.motif_create_group(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.care_groups;
begin
  perform care_private.actor();
  if auth.jwt()->'is_anonymous' <> 'false'::jsonb then
    raise exception 'A caregiver account is required.' using errcode = '42501';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 60 then
    raise exception 'Group name must contain 1 to 60 characters.' using errcode = '22023';
  end if;
  insert into public.care_groups(owner_id, name) values (auth.uid(), btrim(p_name)) returning * into g;
  return jsonb_build_object('version', 1, 'group', to_jsonb(g));
end $$;

create function public.motif_create_participant(p_alias text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.care_groups; p public.participants;
begin
  g := care_private.owner_group();
  if p_alias is null or length(btrim(p_alias)) not between 1 and 60 then
    raise exception 'Participant alias must contain 1 to 60 characters.' using errcode = '22023';
  end if;
  insert into public.participants(group_id, alias) values (g.id, btrim(p_alias)) returning * into p;
  return jsonb_build_object('version', 1, 'participant', to_jsonb(p));
end $$;

create function public.motif_create_invite(p_participant_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.care_groups; p public.participants; token text; expires timestamptz;
begin
  g := care_private.owner_group();
  select * into p from public.participants where id = p_participant_id and group_id = g.id for update;
  if not found or p.user_id is not null or p.revoked_at is not null then
    raise exception 'An unpaired participant in your group is required.' using errcode = '42501';
  end if;
  -- Two independent UUIDs give approximately 244 random bits. Only SHA-256 is retained.
  token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  expires := now() + interval '10 minutes';
  delete from care_private.invites where participant_id = p.id;
  insert into care_private.invites(token_hash, participant_id, expires_at)
    values (encode(sha256(convert_to(token, 'UTF8')), 'hex'), p.id, expires);
  return jsonb_build_object('version', 1, 'participant_id', p.id, 'token', token, 'expires_at', expires);
end $$;

create function public.motif_redeem_invite(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor_id uuid; attempt care_private.invite_attempts; inv care_private.invites;
  p public.participants; g public.care_groups; token_digest text;
begin
  actor_id := care_private.actor();
  if auth.jwt()->'is_anonymous' <> 'true'::jsonb then
    raise exception 'Use an anonymous participant device identity to pair.' using errcode = '42501';
  end if;
  insert into care_private.invite_attempts(user_id, window_start, attempts) values (actor_id, now(), 1)
  on conflict (user_id) do update set
    attempts = case when care_private.invite_attempts.window_start <= now() - interval '10 minutes'
      then 1 else care_private.invite_attempts.attempts + 1 end,
    window_start = case when care_private.invite_attempts.window_start <= now() - interval '10 minutes'
      then now() else care_private.invite_attempts.window_start end
  returning * into attempt;
  if attempt.attempts > 10 then
    return jsonb_build_object('version', 1, 'ok', false, 'code', 'rate_limited', 'message', 'Too many pairing attempts. Try again later.');
  end if;
  if exists (select 1 from public.participants where user_id = actor_id) then
    return jsonb_build_object('version', 1, 'ok', false, 'code', 'already_paired', 'message', 'This device identity is already bound. Sign out before pairing another person.');
  end if;
  if p_token is null or length(p_token) <> 64 or p_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('version', 1, 'ok', false, 'code', 'invalid_invite', 'message', 'This invitation is invalid or no longer available.');
  end if;
  token_digest := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  select * into inv from care_private.invites where token_hash = token_digest;
  if not found then
    return jsonb_build_object('version', 1, 'ok', false, 'code', 'invalid_invite', 'message', 'This invitation is invalid or no longer available.');
  end if;
  -- Serialize mutations consistently: group, then participant, then invite. Recheck under locks.
  select cg.* into g from public.care_groups cg join public.participants cp on cp.group_id = cg.id
    where cp.id = inv.participant_id for update of cg;
  select * into p from public.participants where id = inv.participant_id for update;
  select * into inv from care_private.invites where token_hash = token_digest for update;
  if not found or inv.expires_at <= now() or inv.redeemed_at is not null
    or p.id is null or p.user_id is not null or p.revoked_at is not null then
    return jsonb_build_object('version', 1, 'ok', false, 'code', 'invalid_invite', 'message', 'This invitation is invalid or no longer available.');
  end if;
  update public.participants set user_id = actor_id where id = p.id returning * into p;
  update care_private.invites set redeemed_at = now() where token_hash = token_digest;
  return jsonb_build_object('version', 1, 'ok', true, 'participant', to_jsonb(p));
end $$;

create function public.motif_revoke_participant(p_participant_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.care_groups; p public.participants;
begin
  g := care_private.owner_group();
  select * into p from public.participants where id = p_participant_id and group_id = g.id for update;
  if not found then raise exception 'Participant is not in your group.' using errcode = '42501'; end if;
  update public.participants set revoked_at = coalesce(revoked_at, now()) where id = p.id returning * into p;
  delete from care_private.invites where participant_id = p.id;
  return jsonb_build_object('version', 1, 'participant', to_jsonb(p));
end $$;

create function public.motif_send_request(p_request_id uuid, p_kind text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor_id uuid; p public.participants; r public.care_requests;
begin
  actor_id := care_private.actor();
  if auth.jwt()->'is_anonymous' <> 'true'::jsonb then
    raise exception 'An active participant device is required.' using errcode = '42501';
  end if;
  select * into p from public.participants where user_id = actor_id;
  if not found then raise exception 'An active participant device is required.' using errcode = '42501'; end if;
  perform 1 from public.care_groups where id = p.group_id for update;
  select * into p from public.participants where user_id = actor_id for update;
  if p.revoked_at is not null then raise exception 'This pairing has been revoked.' using errcode = '42501'; end if;
  if p_request_id is null or p_kind is null or p_kind not in ('water', 'bathroom', 'reposition', 'help') then
    raise exception 'A request ID and supported request kind are required.' using errcode = '22023';
  end if;
  insert into public.care_requests(id, participant_id, group_id, kind)
    values (p_request_id, p.id, p.group_id, p_kind) on conflict (id) do nothing;
  select * into r from public.care_requests where id = p_request_id;
  if r.participant_id <> p.id or r.kind <> p_kind then
    raise exception 'Request ID cannot be reused for this send.' using errcode = '42501';
  end if;
  return jsonb_build_object('version', 1, 'request', to_jsonb(r));
end $$;

create function public.motif_transition_request(p_request_id uuid, p_revision integer, p_status text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor_id uuid; r public.care_requests; is_owner boolean; is_sender boolean;
begin
  actor_id := care_private.actor();
  select * into r from public.care_requests where id = p_request_id;
  if not found then raise exception 'Request is not available.' using errcode = '42501'; end if;
  perform 1 from public.care_groups where id = r.group_id for update;
  select * into r from public.care_requests where id = p_request_id for update;
  if not found then raise exception 'Request is not available.' using errcode = '42501'; end if;
  is_owner := auth.jwt()->'is_anonymous' = 'false'::jsonb and exists
    (select 1 from public.care_groups where id = r.group_id and owner_id = actor_id);
  is_sender := auth.jwt()->'is_anonymous' = 'true'::jsonb and exists
    (select 1 from public.participants where id = r.participant_id and user_id = actor_id and revoked_at is null);
  if not is_owner and not is_sender then raise exception 'Request is not available.' using errcode = '42501'; end if;
  if p_revision is null or r.revision <> p_revision then
    raise exception 'The request changed. Refresh before trying again.' using errcode = '40001';
  end if;
  if p_status is null or r.status in ('completed', 'cancelled') or not (
    (is_sender and p_status = 'cancelled')
    or (is_owner and r.status = 'sent' and p_status = 'acknowledged')
    or (is_owner and r.status = 'acknowledged' and p_status = 'completed')
  ) then raise exception 'This request transition is not allowed.' using errcode = '22023'; end if;
  update public.care_requests set status = p_status, revision = revision + 1, updated_at = now()
    where id = r.id returning * into r;
  return jsonb_build_object('version', 1, 'request', to_jsonb(r));
end $$;

create function public.motif_clear_group() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.care_groups;
begin
  g := care_private.owner_group();
  update public.participants set revoked_at = coalesce(revoked_at, now()) where group_id = g.id;
  delete from public.care_requests where group_id = g.id;
  delete from care_private.invites where participant_id in (select id from public.participants where group_id = g.id);
  delete from care_private.invite_attempts where user_id in (select user_id from public.participants where group_id = g.id);
  -- Retain the group and revoked bindings so old credentials remain explicitly revoked.
  return jsonb_build_object('version', 1, 'cleared', true);
end $$;

revoke all on all functions in schema care_private from public, anon, authenticated;
revoke all on function public.motif_access(), public.motif_create_group(text), public.motif_create_participant(text),
  public.motif_create_invite(uuid), public.motif_redeem_invite(text), public.motif_revoke_participant(uuid),
  public.motif_send_request(uuid, text), public.motif_transition_request(uuid, integer, text), public.motif_clear_group()
  from public, anon, authenticated;
grant execute on function public.motif_access(), public.motif_create_group(text), public.motif_create_participant(text),
  public.motif_create_invite(uuid), public.motif_redeem_invite(text), public.motif_revoke_participant(uuid),
  public.motif_send_request(uuid, text), public.motif_transition_request(uuid, integer, text), public.motif_clear_group()
  to authenticated;
commit;
