-- 0009_leads_hardening.sql
-- Address Phase 2B code review findings:
--   1. Enforce tenant consistency at the DB level for lead_events.
--   2. Remove direct UPDATE policy on leads — all writes go via service-role RPCs.
--   3. Wrap every lead mutation in a single transactional SECURITY DEFINER RPC
--      so leads, lead_events and audit_log always succeed or fail together.

-- 1. Tenant-consistency: lead_events.(lead_id, tenant_id) must reference an
--    existing (lead.id, lead.tenant_id) pair. Requires a unique key on leads
--    over (id, tenant_id) — id alone is already unique so this is a no-op
--    for row counts but adds the index needed for the composite FK.
alter table public.leads
  drop constraint if exists leads_id_tenant_unique;
alter table public.leads
  add constraint leads_id_tenant_unique unique (id, tenant_id);

alter table public.lead_events
  drop constraint if exists lead_events_lead_id_fkey;
alter table public.lead_events
  drop constraint if exists lead_events_lead_tenant_fkey;
alter table public.lead_events
  add constraint lead_events_lead_tenant_fkey
  foreign key (lead_id, tenant_id)
  references public.leads (id, tenant_id)
  on delete cascade;

-- 2. Remove the authenticated UPDATE policy on leads. Backoffice mutations
--    go through server actions that call the RPCs below as service_role.
drop policy if exists leads_update_members on public.leads;

-- 3. Transactional RPCs. SECURITY DEFINER so they run as the function owner,
--    with search_path pinned. Execute granted only to service_role so the
--    anon and authenticated PostgREST roles cannot invoke them directly.

-- create_lead: used by the public intake server action.
create or replace function public.create_lead(
  p_tenant_id    uuid,
  p_source       public.lead_source,
  p_full_name    text,
  p_email        text,
  p_phone        text,
  p_postcode     text,
  p_message      text,
  p_submitted_ip inet,
  p_user_agent   text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
begin
  insert into public.leads (
    tenant_id, status, source, full_name, email, phone, postcode, message,
    submitted_ip, user_agent
  ) values (
    p_tenant_id, 'new', p_source, p_full_name, p_email, p_phone, p_postcode,
    p_message, p_submitted_ip, p_user_agent
  )
  returning id into v_lead_id;

  insert into public.lead_events (lead_id, tenant_id, event_type, payload)
  values (
    v_lead_id, p_tenant_id, 'created',
    jsonb_build_object('source', p_source::text, 'via', 'public_intake')
  );

  insert into public.audit_log (tenant_id, action, target_type, target_id, payload)
  values (
    p_tenant_id, 'lead.created', 'lead', v_lead_id::text,
    jsonb_build_object('source', p_source::text, 'via', 'public_intake')
  );

  return v_lead_id;
end;
$$;

revoke all on function public.create_lead(uuid, public.lead_source, text, text, text, text, text, inet, text) from public;
grant execute on function public.create_lead(uuid, public.lead_source, text, text, text, text, text, inet, text) to service_role;

-- update_lead_status: status change with paired event + audit row.
create or replace function public.update_lead_status(
  p_lead_id   uuid,
  p_tenant_id uuid,
  p_actor     uuid,
  p_to        public.lead_status
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from public.lead_status;
begin
  select status
    into v_from
    from public.leads
   where id = p_lead_id and tenant_id = p_tenant_id
   for update;

  if v_from is null then
    raise exception 'lead % not found in tenant %', p_lead_id, p_tenant_id;
  end if;

  if v_from = p_to then
    return;
  end if;

  update public.leads
     set status = p_to
   where id = p_lead_id and tenant_id = p_tenant_id;

  insert into public.lead_events (lead_id, tenant_id, actor_user_id, event_type, payload)
  values (
    p_lead_id, p_tenant_id, p_actor, 'status_changed',
    jsonb_build_object('from', v_from::text, 'to', p_to::text)
  );

  insert into public.audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_tenant_id, 'lead.status_changed', 'lead', p_lead_id::text,
    jsonb_build_object('from', v_from::text, 'to', p_to::text)
  );
end;
$$;

revoke all on function public.update_lead_status(uuid, uuid, uuid, public.lead_status) from public;
grant execute on function public.update_lead_status(uuid, uuid, uuid, public.lead_status) to service_role;

-- add_lead_note: insert-only note event + paired audit row + touch updated_at.
create or replace function public.add_lead_note(
  p_lead_id   uuid,
  p_tenant_id uuid,
  p_actor     uuid,
  p_note      text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.leads
     where id = p_lead_id and tenant_id = p_tenant_id
  ) then
    raise exception 'lead % not found in tenant %', p_lead_id, p_tenant_id;
  end if;

  insert into public.lead_events (lead_id, tenant_id, actor_user_id, event_type, payload)
  values (
    p_lead_id, p_tenant_id, p_actor, 'note',
    jsonb_build_object('note', p_note)
  );

  update public.leads
     set updated_at = now()
   where id = p_lead_id and tenant_id = p_tenant_id;

  insert into public.audit_log (actor_user_id, tenant_id, action, target_type, target_id, payload)
  values (
    p_actor, p_tenant_id, 'lead.note_added', 'lead', p_lead_id::text,
    jsonb_build_object('note', p_note)
  );
end;
$$;

revoke all on function public.add_lead_note(uuid, uuid, uuid, text) from public;
grant execute on function public.add_lead_note(uuid, uuid, uuid, text) to service_role;
