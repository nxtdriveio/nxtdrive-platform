-- Smart Booking Engine - phase 2 preference capture.
--
-- Phase 1 stores requests, generated candidates and optional holds. Phase 2
-- formalizes the canon "lead selects ranked preferences" step so level-1
-- tenants can let backoffice confirm later, while level-2 provisional holds can
-- still build on the selected candidate.

alter table public.booking_requests
  drop constraint if exists booking_requests_status_check;

alter table public.booking_requests
  add constraint booking_requests_status_check check (status in (
    'draft',
    'open',
    'candidates_ready',
    'preference_selected',
    'hold_pending',
    'confirmed',
    'cancelled',
    'expired',
    'failed'
  ));

create table if not exists public.booking_candidate_preferences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  booking_request_id uuid not null references public.booking_requests(id) on delete cascade,
  booking_candidate_id uuid not null references public.booking_candidates(id) on delete cascade,
  preference_rank integer not null,
  requester_type text not null default 'public_lead',
  selected_by_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'selected',
  selected_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (preference_rank between 1 and 10),
  check (requester_type in (
    'public_lead',
    'student',
    'guardian',
    'staff',
    'system'
  )),
  check (status in (
    'selected',
    'superseded',
    'confirmed',
    'expired',
    'cancelled'
  )),
  check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists uq_booking_candidate_preferences_rank_selected
  on public.booking_candidate_preferences (booking_request_id, preference_rank)
  where status = 'selected';

create unique index if not exists uq_booking_candidate_preferences_candidate_selected
  on public.booking_candidate_preferences (booking_request_id, booking_candidate_id)
  where status = 'selected';

create index if not exists idx_booking_candidate_preferences_request_status
  on public.booking_candidate_preferences (booking_request_id, status, preference_rank);

create index if not exists idx_booking_candidate_preferences_tenant_selected
  on public.booking_candidate_preferences (tenant_id, selected_at desc);

drop trigger if exists booking_candidate_preferences_set_updated_at on public.booking_candidate_preferences;
create trigger booking_candidate_preferences_set_updated_at
  before update on public.booking_candidate_preferences
  for each row execute function public.set_updated_at();

create or replace function public._booking_candidate_preference_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_tenant uuid;
  v_request_branch uuid;
  v_candidate_tenant uuid;
  v_candidate_request uuid;
begin
  select tenant_id, branch_id
    into v_request_tenant, v_request_branch
    from public.booking_requests
   where id = new.booking_request_id;

  if v_request_tenant is null then
    raise exception 'booking request % not found', new.booking_request_id;
  end if;

  select tenant_id, booking_request_id
    into v_candidate_tenant, v_candidate_request
    from public.booking_candidates
   where id = new.booking_candidate_id;

  if v_candidate_tenant is null then
    raise exception 'booking candidate % not found', new.booking_candidate_id;
  end if;

  if new.tenant_id <> v_request_tenant
     or v_candidate_tenant <> v_request_tenant
     or v_candidate_request <> new.booking_request_id then
    raise exception 'booking preference tenant/request mismatch';
  end if;

  new.branch_id := coalesce(new.branch_id, v_request_branch);

  if new.branch_id is not null and not exists (
    select 1 from public.branches b
     where b.id = new.branch_id
       and b.tenant_id = new.tenant_id
  ) then
    raise exception 'booking preference branch % does not belong to tenant %',
      new.branch_id,
      new.tenant_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_booking_candidate_preferences_consistency on public.booking_candidate_preferences;
create trigger trg_booking_candidate_preferences_consistency
  before insert or update of tenant_id, branch_id, booking_request_id, booking_candidate_id
  on public.booking_candidate_preferences
  for each row execute function public._booking_candidate_preference_consistency();

alter table public.booking_candidate_preferences enable row level security;

drop policy if exists booking_candidate_preferences_select_members on public.booking_candidate_preferences;
create policy booking_candidate_preferences_select_members on public.booking_candidate_preferences
  for select
  to authenticated
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
    or exists (
      select 1
        from public.booking_requests br
        join public.students s
          on s.id = br.student_id
         and s.tenant_id = br.tenant_id
       where br.id = booking_candidate_preferences.booking_request_id
         and s.user_id = (select auth.uid())
    )
    or exists (
      select 1
        from public.booking_requests br
        join public.student_guardians g
          on g.student_id = br.student_id
         and g.tenant_id = br.tenant_id
       where br.id = booking_candidate_preferences.booking_request_id
         and g.user_id = (select auth.uid())
    )
  );

grant select on public.booking_candidate_preferences to authenticated, service_role;
grant all on public.booking_candidate_preferences to service_role;

create or replace function public.replace_booking_candidate_preferences(
  p_booking_request_id uuid,
  p_tenant_id uuid,
  p_actor uuid,
  p_preferences jsonb
) returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_request public.booking_requests%rowtype;
  v_item jsonb;
  v_candidate public.booking_candidates%rowtype;
  v_count integer := 0;
  v_rank integer;
  v_candidate_id uuid;
  v_status text;
  v_requester_type text;
  v_selected_by uuid;
  v_pref_id uuid;
begin
  if jsonb_typeof(coalesce(p_preferences, '[]'::jsonb)) <> 'array' then
    raise exception 'preferences must be a JSON array';
  end if;

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

  if not public._booking_request_mutation_authorized(
    v_request.requester_type,
    p_actor,
    p_tenant_id,
    v_request.lead_id,
    v_request.student_id
  ) then
    raise exception 'actor is not authorized to replace booking preferences';
  end if;

  update public.booking_candidate_preferences
     set status = 'superseded'
   where booking_request_id = p_booking_request_id
     and tenant_id = p_tenant_id
     and status = 'selected';

  update public.booking_candidates
     set status = 'generated'
   where booking_request_id = p_booking_request_id
     and tenant_id = p_tenant_id
     and status = 'selected';

  for v_item in select value from jsonb_array_elements(p_preferences)
  loop
    v_candidate_id := nullif(v_item->>'booking_candidate_id', '')::uuid;
    v_rank := coalesce(nullif(v_item->>'preference_rank', '')::integer, v_count + 1);
    v_status := coalesce(nullif(v_item->>'status', ''), 'selected');
    v_requester_type := coalesce(nullif(v_item->>'requester_type', ''), v_request.requester_type);
    v_selected_by := coalesce(nullif(v_item->>'selected_by_user_id', '')::uuid, p_actor);

    if v_candidate_id is null then
      raise exception 'preference booking_candidate_id is required';
    end if;
    if v_rank < 1 or v_rank > 10 then
      raise exception 'preference_rank % is outside 1..10', v_rank;
    end if;
    if v_status not in ('selected', 'confirmed') then
      raise exception 'invalid active preference status %', v_status;
    end if;
    if v_requester_type not in ('public_lead', 'student', 'guardian', 'staff', 'system') then
      raise exception 'invalid requester_type %', v_requester_type;
    end if;

    select * into v_candidate
      from public.booking_candidates
     where id = v_candidate_id
       and booking_request_id = p_booking_request_id
       and tenant_id = p_tenant_id
     for update;
    if v_candidate.id is null then
      raise exception 'booking candidate % not found for request %',
        v_candidate_id,
        p_booking_request_id;
    end if;

    insert into public.booking_candidate_preferences (
      tenant_id,
      branch_id,
      booking_request_id,
      booking_candidate_id,
      preference_rank,
      requester_type,
      selected_by_user_id,
      status,
      metadata
    ) values (
      p_tenant_id,
      v_request.branch_id,
      p_booking_request_id,
      v_candidate_id,
      v_rank,
      v_requester_type,
      v_selected_by,
      v_status,
      coalesce(v_item->'metadata', '{}'::jsonb)
    )
    returning id into v_pref_id;

    if v_candidate.status in ('generated', 'selected', 'rejected', 'expired') then
      update public.booking_candidates
         set status = 'selected'
       where id = v_candidate_id
         and tenant_id = p_tenant_id;
    end if;

    perform public._insert_booking_event(
      p_tenant_id,
      v_request.branch_id,
      p_booking_request_id,
      v_candidate_id,
      null,
      p_actor,
      'booking_candidate.preference_selected',
      null,
      jsonb_build_object(
        'preference_id', v_pref_id,
        'preference_rank', v_rank,
        'requester_type', v_requester_type,
        'status', v_status
      ),
      coalesce(v_item->'metadata', '{}'::jsonb)
    );

    v_count := v_count + 1;
  end loop;

  if v_count > 0 and v_request.status in ('draft', 'open', 'candidates_ready') then
    update public.booking_requests
       set status = 'preference_selected'
     where id = p_booking_request_id
       and tenant_id = p_tenant_id;
  end if;

  perform public._insert_booking_event(
    p_tenant_id,
    v_request.branch_id,
    p_booking_request_id,
    null,
    null,
    p_actor,
    'booking_preferences.replaced',
    null,
    jsonb_build_object('count', v_count),
    '{}'::jsonb
  );

  return v_count;
end;
$$;

revoke all on function public._booking_candidate_preference_consistency() from public;
revoke all on function public.replace_booking_candidate_preferences(uuid, uuid, uuid, jsonb) from public;

revoke execute on function public.replace_booking_candidate_preferences(uuid, uuid, uuid, jsonb) from anon, authenticated;
grant execute on function public.replace_booking_candidate_preferences(uuid, uuid, uuid, jsonb) to service_role;

comment on table public.booking_candidate_preferences is
  'Ranked candidate preferences selected by a lead/student/staff member before a booking is confirmed.';
comment on function public.replace_booking_candidate_preferences(uuid, uuid, uuid, jsonb) is
  'Idempotently supersedes active preferences for a booking request and stores the newly selected ranked preferences.';
