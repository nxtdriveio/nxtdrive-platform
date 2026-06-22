-- Smart Booking Engine - phase 3 confirmation flow.
--
-- Adds explicit backoffice/instructor/student confirmation records between a
-- selected candidate and the eventual confirmed booking entity. The existing
-- trial_lesson RPCs remain the authority for proefles rows; this layer records
-- who had to confirm, when they responded, expiry and audit events.

alter table public.booking_requests
  add column if not exists selected_candidate_id uuid references public.booking_candidates(id) on delete set null,
  add column if not exists requires_backoffice_confirmation boolean not null default false,
  add column if not exists requires_instructor_confirmation boolean not null default false,
  add column if not exists requires_student_confirmation boolean not null default false,
  add column if not exists confirmation_deadline_at timestamptz,
  add column if not exists expires_at timestamptz;

drop index if exists idx_booking_requests_selected_candidate;
create index idx_booking_requests_selected_candidate
  on public.booking_requests (selected_candidate_id)
  where selected_candidate_id is not null;

alter table public.booking_requests
  drop constraint if exists booking_requests_status_check;

alter table public.booking_requests
  add constraint booking_requests_status_check check (status in (
    'draft',
    'open',
    'candidates_ready',
    'preference_selected',
    'pending_backoffice',
    'pending_instructor',
    'pending_student',
    'hold_pending',
    'confirmed',
    'declined',
    'cancelled',
    'expired',
    'failed',
    'superseded'
  ));

create table if not exists public.booking_confirmations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  booking_request_id uuid not null references public.booking_requests(id) on delete cascade,
  booking_candidate_id uuid not null references public.booking_candidates(id) on delete cascade,
  booking_hold_id uuid references public.booking_holds(id) on delete set null,
  actor_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  token_hash text,
  status text not null default 'pending',
  required boolean not null default true,
  expires_at timestamptz not null,
  responded_at timestamptz,
  response_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (actor_type in (
    'backoffice',
    'instructor',
    'student',
    'tenant_admin',
    'system'
  )),
  check (status in (
    'pending',
    'accepted',
    'declined',
    'expired',
    'cancelled'
  )),
  check (responded_at is null or status in ('accepted', 'declined')),
  check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists uq_booking_confirmations_pending_actor
  on public.booking_confirmations (booking_request_id, actor_type)
  where status = 'pending';

create index if not exists idx_booking_confirmations_request_status
  on public.booking_confirmations (booking_request_id, status, expires_at);

create index if not exists idx_booking_confirmations_candidate
  on public.booking_confirmations (booking_candidate_id, status);

create index if not exists idx_booking_confirmations_expiry
  on public.booking_confirmations (tenant_id, expires_at)
  where status = 'pending';

drop trigger if exists booking_confirmations_set_updated_at on public.booking_confirmations;
create trigger booking_confirmations_set_updated_at
  before update on public.booking_confirmations
  for each row execute function public.set_updated_at();

create or replace function public._booking_confirmation_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.booking_requests%rowtype;
  v_candidate public.booking_candidates%rowtype;
begin
  select * into v_request
    from public.booking_requests
   where id = new.booking_request_id;
  if v_request.id is null then
    raise exception 'booking request % not found', new.booking_request_id;
  end if;

  select * into v_candidate
    from public.booking_candidates
   where id = new.booking_candidate_id;
  if v_candidate.id is null then
    raise exception 'booking candidate % not found', new.booking_candidate_id;
  end if;

  if new.tenant_id <> v_request.tenant_id
     or v_candidate.tenant_id <> v_request.tenant_id
     or v_candidate.booking_request_id <> v_request.id then
    raise exception 'booking confirmation tenant/request mismatch';
  end if;

  if new.booking_hold_id is not null and not exists (
    select 1
      from public.booking_holds h
     where h.id = new.booking_hold_id
       and h.tenant_id = new.tenant_id
       and h.booking_request_id = new.booking_request_id
       and (
         h.booking_candidate_id = new.booking_candidate_id
         or h.booking_candidate_id is null
       )
  ) then
    raise exception 'booking hold % does not belong to this request/candidate',
      new.booking_hold_id;
  end if;

  new.branch_id := coalesce(new.branch_id, v_request.branch_id);

  if new.branch_id is not null and not exists (
    select 1 from public.branches b
     where b.id = new.branch_id
       and b.tenant_id = new.tenant_id
  ) then
    raise exception 'booking confirmation branch % does not belong to tenant %',
      new.branch_id,
      new.tenant_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_booking_confirmations_consistency on public.booking_confirmations;
create trigger trg_booking_confirmations_consistency
  before insert or update of tenant_id, branch_id, booking_request_id, booking_candidate_id, booking_hold_id
  on public.booking_confirmations
  for each row execute function public._booking_confirmation_consistency();

alter table public.booking_confirmations enable row level security;

drop policy if exists booking_confirmations_select_members on public.booking_confirmations;
create policy booking_confirmations_select_members on public.booking_confirmations
  for select
  to authenticated
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
    or actor_user_id = (select auth.uid())
    or exists (
      select 1
        from public.booking_requests br
        join public.students s
          on s.id = br.student_id
         and s.tenant_id = br.tenant_id
       where br.id = booking_confirmations.booking_request_id
         and s.user_id = (select auth.uid())
    )
    or exists (
      select 1
        from public.booking_requests br
        join public.student_guardians g
          on g.student_id = br.student_id
         and g.tenant_id = br.tenant_id
       where br.id = booking_confirmations.booking_request_id
         and g.user_id = (select auth.uid())
    )
  );

grant select on public.booking_confirmations to authenticated, service_role;
grant all on public.booking_confirmations to service_role;

create or replace function public._booking_request_pending_status(
  p_booking_request_id uuid
) returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.booking_confirmations c
       where c.booking_request_id = p_booking_request_id
         and c.status = 'pending'
         and c.actor_type in ('backoffice', 'tenant_admin')
    ) then 'pending_backoffice'
    when exists (
      select 1 from public.booking_confirmations c
       where c.booking_request_id = p_booking_request_id
         and c.status = 'pending'
         and c.actor_type = 'instructor'
    ) then 'pending_instructor'
    when exists (
      select 1 from public.booking_confirmations c
       where c.booking_request_id = p_booking_request_id
         and c.status = 'pending'
         and c.actor_type = 'student'
    ) then 'pending_student'
    else 'candidates_ready'
  end;
$$;

create or replace function public._booking_confirmation_actor_authorized(
  p_actor_type text,
  p_actor uuid,
  p_tenant_id uuid,
  p_booking_request_id uuid,
  p_booking_candidate_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    case
      when p_actor_type in ('backoffice', 'tenant_admin') then
        p_actor is not null
        and public._tenant_staff_authorized(p_actor, p_tenant_id)
      when p_actor_type = 'instructor' then
        p_actor is not null
        and (
          exists (
            select 1
              from public.booking_candidates c
             where c.id = p_booking_candidate_id
               and c.tenant_id = p_tenant_id
               and c.instructor_id = p_actor
          )
          or public._tenant_staff_authorized(p_actor, p_tenant_id)
        )
      when p_actor_type = 'student' then
        p_actor is not null
        and (
          exists (
            select 1
              from public.booking_requests br
              join public.students s
                on s.id = br.student_id
               and s.tenant_id = br.tenant_id
             where br.id = p_booking_request_id
               and br.tenant_id = p_tenant_id
               and s.user_id = p_actor
          )
          or exists (
            select 1
              from public.booking_requests br
              join public.student_guardians g
                on g.student_id = br.student_id
               and g.tenant_id = br.tenant_id
             where br.id = p_booking_request_id
               and br.tenant_id = p_tenant_id
               and g.user_id = p_actor
          )
          or public._tenant_staff_authorized(p_actor, p_tenant_id)
        )
      when p_actor_type = 'system' then p_actor is null
      else false
    end;
$$;

create or replace function public.create_booking_confirmations_for_candidate(
  p_booking_request_id uuid,
  p_booking_candidate_id uuid,
  p_tenant_id uuid,
  p_actor uuid,
  p_requires_backoffice boolean default true,
  p_requires_instructor boolean default false,
  p_requires_student boolean default false,
  p_backoffice_expires_at timestamptz default null,
  p_instructor_expires_at timestamptz default null,
  p_student_expires_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
) returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_request public.booking_requests%rowtype;
  v_candidate public.booking_candidates%rowtype;
  v_count integer := 0;
  v_deadline timestamptz;
  v_next_status text;
  v_confirmation_id uuid;
begin
  select * into v_request
    from public.booking_requests
   where id = p_booking_request_id
     and tenant_id = p_tenant_id
   for update;
  if v_request.id is null then
    raise exception 'booking request % not found in tenant %',
      p_booking_request_id,
      p_tenant_id;
  end if;

  select * into v_candidate
    from public.booking_candidates
   where id = p_booking_candidate_id
     and booking_request_id = p_booking_request_id
     and tenant_id = p_tenant_id
   for update;
  if v_candidate.id is null then
    raise exception 'booking candidate % not found for request %',
      p_booking_candidate_id,
      p_booking_request_id;
  end if;

  if not (
    public._tenant_staff_authorized(p_actor, p_tenant_id)
    or public._booking_request_mutation_authorized(
      v_request.requester_type,
      p_actor,
      p_tenant_id,
      v_request.lead_id,
      v_request.student_id
    )
  ) then
    raise exception 'actor is not authorized to create booking confirmations';
  end if;

  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'metadata must be an object';
  end if;

  update public.booking_confirmations
     set status = 'cancelled',
         response_reason = 'superseded_by_new_confirmation_set'
   where booking_request_id = p_booking_request_id
     and tenant_id = p_tenant_id
     and status = 'pending';

  if p_requires_backoffice then
    v_deadline := coalesce(p_backoffice_expires_at, now() + interval '24 hours');
    insert into public.booking_confirmations (
      tenant_id,
      branch_id,
      booking_request_id,
      booking_candidate_id,
      actor_type,
      status,
      required,
      expires_at,
      metadata,
      created_by
    ) values (
      p_tenant_id,
      v_request.branch_id,
      p_booking_request_id,
      p_booking_candidate_id,
      'backoffice',
      'pending',
      true,
      v_deadline,
      coalesce(p_metadata, '{}'::jsonb),
      p_actor
    )
    returning id into v_confirmation_id;
    v_count := v_count + 1;
  end if;

  if p_requires_instructor then
    v_deadline := coalesce(p_instructor_expires_at, now() + interval '4 hours');
    insert into public.booking_confirmations (
      tenant_id,
      branch_id,
      booking_request_id,
      booking_candidate_id,
      actor_type,
      actor_user_id,
      status,
      required,
      expires_at,
      metadata,
      created_by
    ) values (
      p_tenant_id,
      v_request.branch_id,
      p_booking_request_id,
      p_booking_candidate_id,
      'instructor',
      v_candidate.instructor_id,
      'pending',
      true,
      v_deadline,
      coalesce(p_metadata, '{}'::jsonb),
      p_actor
    );
    v_count := v_count + 1;
  end if;

  if p_requires_student then
    v_deadline := coalesce(p_student_expires_at, now() + interval '12 hours');
    insert into public.booking_confirmations (
      tenant_id,
      branch_id,
      booking_request_id,
      booking_candidate_id,
      actor_type,
      status,
      required,
      expires_at,
      metadata,
      created_by
    ) values (
      p_tenant_id,
      v_request.branch_id,
      p_booking_request_id,
      p_booking_candidate_id,
      'student',
      'pending',
      true,
      v_deadline,
      coalesce(p_metadata, '{}'::jsonb),
      p_actor
    );
    v_count := v_count + 1;
  end if;

  update public.booking_candidates
     set status = case
       when status in ('held', 'confirmed') then status
       else 'selected'
     end
   where id = p_booking_candidate_id
     and tenant_id = p_tenant_id;

  v_next_status := public._booking_request_pending_status(p_booking_request_id);

  update public.booking_requests
     set selected_candidate_id = p_booking_candidate_id,
         requires_backoffice_confirmation = p_requires_backoffice,
         requires_instructor_confirmation = p_requires_instructor,
         requires_student_confirmation = p_requires_student,
         confirmation_deadline_at = (
           select min(c.expires_at)
             from public.booking_confirmations c
            where c.booking_request_id = p_booking_request_id
              and c.status = 'pending'
         ),
         expires_at = (
           select min(c.expires_at)
             from public.booking_confirmations c
            where c.booking_request_id = p_booking_request_id
              and c.status = 'pending'
         ),
         status = case
           when status in ('confirmed', 'cancelled') then status
           else v_next_status
         end
   where id = p_booking_request_id
     and tenant_id = p_tenant_id;

  perform public._insert_booking_event(
    p_tenant_id,
    v_request.branch_id,
    p_booking_request_id,
    p_booking_candidate_id,
    null,
    p_actor,
    'booking_confirmations.created',
    null,
    jsonb_build_object(
      'count', v_count,
      'requires_backoffice', p_requires_backoffice,
      'requires_instructor', p_requires_instructor,
      'requires_student', p_requires_student,
      'next_status', v_next_status
    ),
    coalesce(p_metadata, '{}'::jsonb)
  );

  return v_count;
end;
$$;

create or replace function public.expire_booking_confirmations(
  p_tenant_id uuid default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_confirmation public.booking_confirmations%rowtype;
  v_count integer := 0;
begin
  for v_confirmation in
    select *
      from public.booking_confirmations
     where status = 'pending'
       and expires_at <= now()
       and (p_tenant_id is null or tenant_id = p_tenant_id)
     for update skip locked
  loop
    update public.booking_confirmations
       set status = 'expired'
     where id = v_confirmation.id;

    update public.booking_requests
       set status = 'expired',
           expires_at = coalesce(expires_at, v_confirmation.expires_at)
     where id = v_confirmation.booking_request_id
       and tenant_id = v_confirmation.tenant_id
       and status in ('pending_backoffice', 'pending_instructor', 'pending_student');

    update public.booking_candidates
       set status = 'expired'
     where id = v_confirmation.booking_candidate_id
       and tenant_id = v_confirmation.tenant_id
       and status = 'selected';

    perform public._insert_booking_event(
      v_confirmation.tenant_id,
      v_confirmation.branch_id,
      v_confirmation.booking_request_id,
      v_confirmation.booking_candidate_id,
      v_confirmation.booking_hold_id,
      null,
      'booking_confirmation.expired',
      to_jsonb(v_confirmation),
      null,
      '{}'::jsonb
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.respond_booking_confirmation(
  p_booking_confirmation_id uuid,
  p_tenant_id uuid,
  p_actor uuid,
  p_response text,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb
) returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_confirmation public.booking_confirmations%rowtype;
  v_request public.booking_requests%rowtype;
  v_next_status text;
begin
  if p_response not in ('accepted', 'declined') then
    raise exception 'invalid confirmation response %', p_response;
  end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'metadata must be an object';
  end if;

  perform public.expire_booking_confirmations(p_tenant_id);

  select * into v_confirmation
    from public.booking_confirmations
   where id = p_booking_confirmation_id
     and tenant_id = p_tenant_id
   for update;
  if v_confirmation.id is null then
    raise exception 'booking confirmation % not found in tenant %',
      p_booking_confirmation_id,
      p_tenant_id;
  end if;

  select * into v_request
    from public.booking_requests
   where id = v_confirmation.booking_request_id
     and tenant_id = p_tenant_id
   for update;
  if v_request.id is null then
    raise exception 'booking request % not found', v_confirmation.booking_request_id;
  end if;

  if v_confirmation.status <> 'pending' then
    return v_confirmation.status;
  end if;
  if v_confirmation.expires_at <= now() then
    update public.booking_confirmations
       set status = 'expired'
     where id = v_confirmation.id;
    update public.booking_requests
       set status = 'expired'
     where id = v_confirmation.booking_request_id
       and tenant_id = p_tenant_id
       and status in ('pending_backoffice', 'pending_instructor', 'pending_student');
    return 'expired';
  end if;

  if not public._booking_confirmation_actor_authorized(
    v_confirmation.actor_type,
    p_actor,
    p_tenant_id,
    v_confirmation.booking_request_id,
    v_confirmation.booking_candidate_id
  ) then
    raise exception 'actor is not authorized to respond to this confirmation';
  end if;

  if p_response = 'declined' then
    update public.booking_confirmations
       set status = 'declined',
           responded_at = now(),
           response_reason = nullif(p_reason, '')
     where id = v_confirmation.id;

    update public.booking_confirmations
       set status = 'cancelled',
           response_reason = 'cancelled_after_decline'
     where booking_request_id = v_confirmation.booking_request_id
       and tenant_id = p_tenant_id
       and status = 'pending'
       and id <> v_confirmation.id;

    update public.booking_candidates
       set status = 'rejected'
     where id = v_confirmation.booking_candidate_id
       and tenant_id = p_tenant_id
       and status in ('generated', 'selected', 'held');

    update public.booking_holds
       set status = 'released',
           released_at = now()
     where booking_request_id = v_confirmation.booking_request_id
       and tenant_id = p_tenant_id
       and status = 'active';

    update public.booking_requests
       set status = 'declined',
           confirmation_deadline_at = null
     where id = v_confirmation.booking_request_id
       and tenant_id = p_tenant_id
       and status not in ('confirmed', 'cancelled');

    perform public._insert_booking_event(
      p_tenant_id,
      v_confirmation.branch_id,
      v_confirmation.booking_request_id,
      v_confirmation.booking_candidate_id,
      v_confirmation.booking_hold_id,
      p_actor,
      'booking_confirmation.declined',
      to_jsonb(v_confirmation),
      jsonb_build_object('reason', p_reason),
      coalesce(p_metadata, '{}'::jsonb)
    );

    return 'declined';
  end if;

  update public.booking_confirmations
     set status = 'accepted',
         responded_at = now(),
         response_reason = nullif(p_reason, '')
   where id = v_confirmation.id;

  perform public._insert_booking_event(
    p_tenant_id,
    v_confirmation.branch_id,
    v_confirmation.booking_request_id,
    v_confirmation.booking_candidate_id,
    v_confirmation.booking_hold_id,
    p_actor,
    'booking_confirmation.accepted',
    to_jsonb(v_confirmation),
    jsonb_build_object('actor_type', v_confirmation.actor_type),
    coalesce(p_metadata, '{}'::jsonb)
  );

  v_next_status := public._booking_request_pending_status(
    v_confirmation.booking_request_id
  );

  update public.booking_requests
     set status = case
           when status in ('confirmed', 'cancelled') then status
           else v_next_status
         end,
         confirmation_deadline_at = (
           select min(c.expires_at)
             from public.booking_confirmations c
            where c.booking_request_id = v_confirmation.booking_request_id
              and c.status = 'pending'
         ),
         expires_at = (
           select min(c.expires_at)
             from public.booking_confirmations c
            where c.booking_request_id = v_confirmation.booking_request_id
              and c.status = 'pending'
         )
   where id = v_confirmation.booking_request_id
     and tenant_id = p_tenant_id;

  if v_next_status = 'candidates_ready' then
    perform public._insert_booking_event(
      p_tenant_id,
      v_confirmation.branch_id,
      v_confirmation.booking_request_id,
      v_confirmation.booking_candidate_id,
      v_confirmation.booking_hold_id,
      p_actor,
      'booking_confirmations.completed',
      null,
      jsonb_build_object('status', v_next_status),
      '{}'::jsonb
    );
  end if;

  return v_next_status;
end;
$$;

revoke all on function public._booking_confirmation_consistency() from public;
revoke all on function public._booking_request_pending_status(uuid) from public;
revoke all on function public._booking_confirmation_actor_authorized(text, uuid, uuid, uuid, uuid) from public;
revoke all on function public.create_booking_confirmations_for_candidate(uuid, uuid, uuid, uuid, boolean, boolean, boolean, timestamptz, timestamptz, timestamptz, jsonb) from public;
revoke all on function public.expire_booking_confirmations(uuid) from public;
revoke all on function public.respond_booking_confirmation(uuid, uuid, uuid, text, text, jsonb) from public;

revoke execute on function public.create_booking_confirmations_for_candidate(uuid, uuid, uuid, uuid, boolean, boolean, boolean, timestamptz, timestamptz, timestamptz, jsonb) from anon, authenticated;
revoke execute on function public.expire_booking_confirmations(uuid) from anon, authenticated;
revoke execute on function public.respond_booking_confirmation(uuid, uuid, uuid, text, text, jsonb) from anon, authenticated;

grant execute on function public.create_booking_confirmations_for_candidate(uuid, uuid, uuid, uuid, boolean, boolean, boolean, timestamptz, timestamptz, timestamptz, jsonb) to service_role;
grant execute on function public.expire_booking_confirmations(uuid) to service_role;
grant execute on function public.respond_booking_confirmation(uuid, uuid, uuid, text, text, jsonb) to service_role;

comment on table public.booking_confirmations is
  'Required confirmation steps for a selected booking candidate before a booking is finalized.';
comment on function public.create_booking_confirmations_for_candidate(uuid, uuid, uuid, uuid, boolean, boolean, boolean, timestamptz, timestamptz, timestamptz, jsonb) is
  'Creates a fresh pending confirmation set for a selected booking candidate.';
comment on function public.respond_booking_confirmation(uuid, uuid, uuid, text, text, jsonb) is
  'Accepts or declines one pending booking confirmation and advances the request state.';
