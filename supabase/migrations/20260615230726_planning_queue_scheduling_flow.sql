-- Sprint 5: planning queue scheduling flow.

alter table public.planning_queue_items
  add column if not exists pickup_address_id text,
  add column if not exists required_vehicle_capability_ids jsonb not null default '[]'::jsonb,
  add column if not exists preferred_vehicle_capability_ids jsonb not null default '[]'::jsonb,
  add column if not exists scheduled_entity_type text,
  add column if not exists scheduled_entity_id uuid,
  add column if not exists scheduled_at timestamptz,
  add column if not exists scheduled_by uuid references auth.users(id) on delete set null,
  add column if not exists last_validation jsonb;

alter table public.planning_queue_items
  drop constraint if exists planning_queue_items_required_vehicle_capability_ids_json_ck;
alter table public.planning_queue_items
  add constraint planning_queue_items_required_vehicle_capability_ids_json_ck
    check (jsonb_typeof(required_vehicle_capability_ids) = 'array');

alter table public.planning_queue_items
  drop constraint if exists planning_queue_items_preferred_vehicle_capability_ids_json_ck;
alter table public.planning_queue_items
  add constraint planning_queue_items_preferred_vehicle_capability_ids_json_ck
    check (jsonb_typeof(preferred_vehicle_capability_ids) = 'array');

alter table public.planning_queue_items
  drop constraint if exists planning_queue_items_scheduled_entity_type_ck;
alter table public.planning_queue_items
  add constraint planning_queue_items_scheduled_entity_type_ck
    check (
      scheduled_entity_type is null
      or scheduled_entity_type in ('agenda_appointment', 'lesson', 'trial_lesson')
    );

create index if not exists idx_planning_queue_items_service_area
  on public.planning_queue_items (tenant_id, pickup_service_area_id, status)
  where pickup_service_area_id is not null;

create or replace function public._planning_queue_actor_authorized(
  p_actor uuid,
  p_tenant_id uuid,
  p_branch_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public._tenant_admin_authorized(p_actor, p_tenant_id)
    or exists (
      select 1
        from public.memberships m
       where m.user_id = p_actor
         and m.tenant_id = p_tenant_id
         and m.role = 'franchise_admin'
         and (
           p_branch_id is null
           or coalesce(m.branch_scope_type, 'all') = 'all'
           or exists (
             select 1
               from public.membership_branches mb
              where mb.membership_id = m.id
                and mb.branch_id = p_branch_id
           )
         )
    )
    or (
      p_branch_id is not null
      and exists (
        select 1
          from public.memberships m
         where m.user_id = p_actor
           and m.tenant_id = p_tenant_id
           and m.role in ('branch_manager', 'planner')
           and (
             coalesce(m.branch_scope_type, 'all') = 'all'
             or exists (
               select 1
                 from public.membership_branches mb
                where mb.membership_id = m.id
                  and mb.branch_id = p_branch_id
             )
           )
      )
    );
$$;

revoke all on function public._planning_queue_actor_authorized(uuid, uuid, uuid) from public;
revoke execute on function public._planning_queue_actor_authorized(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public._planning_queue_actor_authorized(uuid, uuid, uuid) to service_role;

create or replace function public.upsert_planning_queue_item(
  p_tenant_id uuid,
  p_actor uuid,
  p_id uuid,
  p_branch_id uuid,
  p_student_id uuid,
  p_lead_id uuid,
  p_appointment_type text,
  p_duration_minutes integer,
  p_required_transmission text,
  p_preferred_instructor_id uuid,
  p_pickup_address_id text,
  p_pickup_service_area_id uuid,
  p_desired_date_from date,
  p_desired_date_until date,
  p_priority text,
  p_required_capabilities jsonb,
  p_preferred_capabilities jsonb,
  p_required_vehicle_capability_ids jsonb,
  p_preferred_vehicle_capability_ids jsonb,
  p_notes text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  if not public._planning_queue_actor_authorized(p_actor, p_tenant_id, p_branch_id) then
    raise exception 'actor % not authorized to manage planning queue in tenant %', p_actor, p_tenant_id;
  end if;
  if p_branch_id is not null and not exists (
    select 1 from public.branches b
     where b.id = p_branch_id and b.tenant_id = p_tenant_id
  ) then
    raise exception 'branch % is not part of tenant %', p_branch_id, p_tenant_id;
  end if;
  if p_student_id is not null and not exists (
    select 1 from public.students s
     where s.id = p_student_id and s.tenant_id = p_tenant_id
       and (p_branch_id is null or s.branch_id is null or s.branch_id = p_branch_id)
  ) then
    raise exception 'student % is not part of this planning scope', p_student_id;
  end if;
  if p_lead_id is not null and not exists (
    select 1 from public.leads l
     where l.id = p_lead_id and l.tenant_id = p_tenant_id
       and (p_branch_id is null or l.branch_id is null or l.branch_id = p_branch_id)
  ) then
    raise exception 'lead % is not part of this planning scope', p_lead_id;
  end if;
  if p_student_id is not null and p_lead_id is not null then
    raise exception 'planning queue item cannot target both student and lead';
  end if;
  if p_pickup_service_area_id is not null and not exists (
    select 1 from public.service_areas sa
     where sa.id = p_pickup_service_area_id
       and sa.tenant_id = p_tenant_id
       and (sa.branch_id is null or p_branch_id is null or sa.branch_id = p_branch_id)
  ) then
    raise exception 'service area % is not part of this planning scope', p_pickup_service_area_id;
  end if;
  if p_preferred_instructor_id is not null and not exists (
    select 1 from public.memberships m
     where m.user_id = p_preferred_instructor_id
       and m.tenant_id = p_tenant_id
       and m.role in ('instructor', 'tenant_admin')
  ) then
    raise exception 'preferred instructor % is not part of tenant %', p_preferred_instructor_id, p_tenant_id;
  end if;
  if p_appointment_type is null or trim(p_appointment_type) = '' then
    raise exception 'appointment_type is required';
  end if;
  if p_duration_minutes is null or p_duration_minutes < 15 or p_duration_minutes > 720 then
    raise exception 'duration_minutes must be between 15 and 720';
  end if;
  if coalesce(jsonb_typeof(p_required_capabilities), 'array') <> 'array'
    or coalesce(jsonb_typeof(p_preferred_capabilities), 'array') <> 'array'
    or coalesce(jsonb_typeof(p_required_vehicle_capability_ids), 'array') <> 'array'
    or coalesce(jsonb_typeof(p_preferred_vehicle_capability_ids), 'array') <> 'array' then
    raise exception 'capability inputs must be arrays';
  end if;
  if exists (
    select 1
      from jsonb_array_elements_text(coalesce(p_required_capabilities, '[]'::jsonb)) cap(id)
     where not exists (
       select 1 from public.capability_definitions cd
        where cd.id = cap.id::uuid
          and cd.tenant_id = p_tenant_id
          and cd.applies_to in ('instructor', 'appointment', 'queue_item')
     )
  ) or exists (
    select 1
      from jsonb_array_elements_text(coalesce(p_preferred_capabilities, '[]'::jsonb)) cap(id)
     where not exists (
       select 1 from public.capability_definitions cd
        where cd.id = cap.id::uuid
          and cd.tenant_id = p_tenant_id
          and cd.applies_to in ('instructor', 'appointment', 'queue_item')
     )
  ) then
    raise exception 'instructor capability ids must belong to tenant %', p_tenant_id;
  end if;
  if exists (
    select 1
      from jsonb_array_elements_text(coalesce(p_required_vehicle_capability_ids, '[]'::jsonb)) cap(id)
     where not exists (
       select 1 from public.capability_definitions cd
        where cd.id = cap.id::uuid
          and cd.tenant_id = p_tenant_id
          and cd.applies_to = 'vehicle'
     )
  ) or exists (
    select 1
      from jsonb_array_elements_text(coalesce(p_preferred_vehicle_capability_ids, '[]'::jsonb)) cap(id)
     where not exists (
       select 1 from public.capability_definitions cd
        where cd.id = cap.id::uuid
          and cd.tenant_id = p_tenant_id
          and cd.applies_to = 'vehicle'
     )
  ) then
    raise exception 'vehicle capability ids must belong to tenant %', p_tenant_id;
  end if;

  if p_id is not null then
    select to_jsonb(q.*) into v_before
      from public.planning_queue_items q
     where q.id = p_id and q.tenant_id = p_tenant_id
     for update;
    if v_before is null then
      raise exception 'planning queue item % not found in tenant %', p_id, p_tenant_id;
    end if;
    if (v_before->>'status') in ('scheduled', 'cancelled') then
      raise exception 'planning queue item % cannot be edited with status %', p_id, v_before->>'status';
    end if;
  end if;

  if p_id is null then
    insert into public.planning_queue_items (
      tenant_id, branch_id, student_id, lead_id, appointment_type,
      duration_minutes, required_transmission, preferred_instructor_id,
      pickup_address_id, pickup_service_area_id, desired_date_from,
      desired_date_until, priority, status, required_capabilities,
      preferred_capabilities, required_vehicle_capability_ids,
      preferred_vehicle_capability_ids, notes, created_by
    ) values (
      p_tenant_id, p_branch_id, p_student_id, p_lead_id, trim(p_appointment_type),
      p_duration_minutes, p_required_transmission, p_preferred_instructor_id,
      nullif(trim(coalesce(p_pickup_address_id, '')), ''), p_pickup_service_area_id,
      p_desired_date_from, p_desired_date_until, coalesce(p_priority, 'normal'),
      'open', coalesce(p_required_capabilities, '[]'::jsonb),
      coalesce(p_preferred_capabilities, '[]'::jsonb),
      coalesce(p_required_vehicle_capability_ids, '[]'::jsonb),
      coalesce(p_preferred_vehicle_capability_ids, '[]'::jsonb),
      nullif(trim(coalesce(p_notes, '')), ''), p_actor
    )
    returning id into v_id;
  else
    update public.planning_queue_items
       set branch_id = p_branch_id,
           student_id = p_student_id,
           lead_id = p_lead_id,
           appointment_type = trim(p_appointment_type),
           duration_minutes = p_duration_minutes,
           required_transmission = p_required_transmission,
           preferred_instructor_id = p_preferred_instructor_id,
           pickup_address_id = nullif(trim(coalesce(p_pickup_address_id, '')), ''),
           pickup_service_area_id = p_pickup_service_area_id,
           desired_date_from = p_desired_date_from,
           desired_date_until = p_desired_date_until,
           priority = coalesce(p_priority, 'normal'),
           required_capabilities = coalesce(p_required_capabilities, '[]'::jsonb),
           preferred_capabilities = coalesce(p_preferred_capabilities, '[]'::jsonb),
           required_vehicle_capability_ids = coalesce(p_required_vehicle_capability_ids, '[]'::jsonb),
           preferred_vehicle_capability_ids = coalesce(p_preferred_vehicle_capability_ids, '[]'::jsonb),
           notes = nullif(trim(coalesce(p_notes, '')), ''),
           status = case when status = 'suggested' then 'open' else status end
     where id = p_id and tenant_id = p_tenant_id
    returning id into v_id;
  end if;

  select to_jsonb(q.*) into v_after
    from public.planning_queue_items q
   where q.id = v_id and q.tenant_id = p_tenant_id;

  insert into public.planning_audit_log (
    tenant_id, branch_id, actor_user_id, actor_role, scope_type, scope_ref_id,
    action, entity_type, entity_id, before_json, after_json
  ) values (
    p_tenant_id, p_branch_id, p_actor, null,
    case when p_branch_id is null then 'tenant' else 'branch' end,
    coalesce(p_branch_id, p_tenant_id),
    case when p_id is null then 'planning_queue.created' else 'planning_queue.updated' end,
    'planning_queue_item', v_id, v_before, v_after
  );

  return v_id;
end;
$$;

revoke all on function public.upsert_planning_queue_item(
  uuid, uuid, uuid, uuid, uuid, uuid, text, integer, text, uuid, text, uuid,
  date, date, text, jsonb, jsonb, jsonb, jsonb, text
) from public;
revoke execute on function public.upsert_planning_queue_item(
  uuid, uuid, uuid, uuid, uuid, uuid, text, integer, text, uuid, text, uuid,
  date, date, text, jsonb, jsonb, jsonb, jsonb, text
) from anon, authenticated;
grant execute on function public.upsert_planning_queue_item(
  uuid, uuid, uuid, uuid, uuid, uuid, text, integer, text, uuid, text, uuid,
  date, date, text, jsonb, jsonb, jsonb, jsonb, text
) to service_role;

create or replace function public.cancel_planning_queue_item(
  p_tenant_id uuid,
  p_actor uuid,
  p_id uuid,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_before jsonb;
  v_after jsonb;
begin
  select *, to_jsonb(planning_queue_items.*) as before_json
    into v_item
    from public.planning_queue_items
   where id = p_id and tenant_id = p_tenant_id
   for update;
  if v_item.id is null then
    raise exception 'planning queue item % not found', p_id;
  end if;
  if not public._planning_queue_actor_authorized(p_actor, p_tenant_id, v_item.branch_id) then
    raise exception 'actor % not authorized to cancel planning queue item %', p_actor, p_id;
  end if;
  if v_item.status = 'scheduled' then
    raise exception 'scheduled planning queue item % cannot be cancelled', p_id;
  end if;

  v_before := v_item.before_json;
  update public.planning_queue_items
     set status = 'cancelled',
         notes = coalesce(notes, '') || case when p_reason is null then '' else E'\nAnnulering: ' || p_reason end
   where id = p_id and tenant_id = p_tenant_id;

  select to_jsonb(q.*) into v_after
    from public.planning_queue_items q
   where q.id = p_id and q.tenant_id = p_tenant_id;

  insert into public.planning_audit_log (
    tenant_id, branch_id, actor_user_id, scope_type, scope_ref_id, action,
    entity_type, entity_id, before_json, after_json, reason
  ) values (
    p_tenant_id, v_item.branch_id, p_actor,
    case when v_item.branch_id is null then 'tenant' else 'branch' end,
    coalesce(v_item.branch_id, p_tenant_id), 'planning_queue.cancelled',
    'planning_queue_item', p_id, v_before, v_after, p_reason
  );
end;
$$;

revoke all on function public.cancel_planning_queue_item(uuid, uuid, uuid, text) from public;
revoke execute on function public.cancel_planning_queue_item(uuid, uuid, uuid, text) from anon, authenticated;
grant execute on function public.cancel_planning_queue_item(uuid, uuid, uuid, text) to service_role;

create or replace function public.mark_planning_queue_item_suggested(
  p_tenant_id uuid,
  p_actor uuid,
  p_id uuid,
  p_validation jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
begin
  select *
    into v_item
    from public.planning_queue_items
   where id = p_id and tenant_id = p_tenant_id
   for update;
  if v_item.id is null then
    raise exception 'planning queue item % not found', p_id;
  end if;
  if not public._planning_queue_actor_authorized(p_actor, p_tenant_id, v_item.branch_id) then
    raise exception 'actor % not authorized to suggest planning queue item %', p_actor, p_id;
  end if;
  if v_item.status not in ('open', 'suggested') then
    raise exception 'planning queue item % cannot be suggested with status %', p_id, v_item.status;
  end if;

  update public.planning_queue_items
     set status = 'suggested',
         last_validation = p_validation
   where id = p_id and tenant_id = p_tenant_id;
end;
$$;

revoke all on function public.mark_planning_queue_item_suggested(uuid, uuid, uuid, jsonb) from public;
revoke execute on function public.mark_planning_queue_item_suggested(uuid, uuid, uuid, jsonb) from anon, authenticated;
grant execute on function public.mark_planning_queue_item_suggested(uuid, uuid, uuid, jsonb) to service_role;

create or replace function public.mark_planning_queue_item_scheduled(
  p_tenant_id uuid,
  p_actor uuid,
  p_id uuid,
  p_scheduled_entity_type text,
  p_scheduled_entity_id uuid,
  p_validation jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_before jsonb;
  v_after jsonb;
begin
  select *, to_jsonb(planning_queue_items.*) as before_json
    into v_item
    from public.planning_queue_items
   where id = p_id and tenant_id = p_tenant_id
   for update;
  if v_item.id is null then
    raise exception 'planning queue item % not found', p_id;
  end if;
  if not public._planning_queue_actor_authorized(p_actor, p_tenant_id, v_item.branch_id) then
    raise exception 'actor % not authorized to schedule planning queue item %', p_actor, p_id;
  end if;
  if v_item.status not in ('open', 'suggested') then
    raise exception 'planning queue item % cannot be scheduled with status %', p_id, v_item.status;
  end if;
  if p_scheduled_entity_type not in ('agenda_appointment', 'lesson', 'trial_lesson') then
    raise exception 'invalid scheduled entity type %', p_scheduled_entity_type;
  end if;

  v_before := v_item.before_json;
  update public.planning_queue_items
     set status = 'scheduled',
         scheduled_entity_type = p_scheduled_entity_type,
         scheduled_entity_id = p_scheduled_entity_id,
         scheduled_at = now(),
         scheduled_by = p_actor,
         last_validation = p_validation
   where id = p_id and tenant_id = p_tenant_id;

  select to_jsonb(q.*) into v_after
    from public.planning_queue_items q
   where q.id = p_id and q.tenant_id = p_tenant_id;

  insert into public.planning_audit_log (
    tenant_id, branch_id, actor_user_id, scope_type, scope_ref_id, action,
    entity_type, entity_id, before_json, after_json
  ) values (
    p_tenant_id, v_item.branch_id, p_actor,
    case when v_item.branch_id is null then 'tenant' else 'branch' end,
    coalesce(v_item.branch_id, p_tenant_id), 'planning_queue.scheduled',
    'planning_queue_item', p_id, v_before, v_after
  );
end;
$$;

revoke all on function public.mark_planning_queue_item_scheduled(uuid, uuid, uuid, text, uuid, jsonb) from public;
revoke execute on function public.mark_planning_queue_item_scheduled(uuid, uuid, uuid, text, uuid, jsonb) from anon, authenticated;
grant execute on function public.mark_planning_queue_item_scheduled(uuid, uuid, uuid, text, uuid, jsonb) to service_role;
