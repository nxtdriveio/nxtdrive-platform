-- 0013_credits_hardening.sql
-- Address code-review findings on Phase 2C:
--   1. Conversion must be idempotent — a lead can convert to at most one student.
--   2. students.lead_id must enforce tenant consistency at the DB level.
--   3. student_credit_balance view must respect RLS (security_invoker), and
--      privileges must be explicit so anon cannot read it.

-- 1 + 2 --------------------------------------------------------------------
-- Replace lead_id FK with a composite FK to (id, tenant_id) and add a partial
-- uniqueness constraint so a lead can only be linked to one student row.

alter table public.students
  drop constraint if exists students_lead_id_fkey;

alter table public.students
  add constraint students_lead_tenant_fkey
  foreign key (lead_id, tenant_id)
  references public.leads (id, tenant_id)
  on delete set null;

create unique index if not exists uniq_students_tenant_lead
  on public.students (tenant_id, lead_id)
  where lead_id is not null;

-- Make convert_lead_to_student idempotent: return the already-linked student
-- when one exists, never create duplicates. Still flips lead status the first
-- time and still optionally grants a package (only on first conversion).
create or replace function public.convert_lead_to_student(
  p_lead_id    uuid,
  p_tenant_id  uuid,
  p_actor      uuid,
  p_package_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead       record;
  v_student_id uuid;
begin
  select id, status, full_name, email, phone, postcode
    into v_lead
    from public.leads
   where id = p_lead_id and tenant_id = p_tenant_id
   for update;
  if v_lead.id is null then
    raise exception 'lead % not found in tenant %', p_lead_id, p_tenant_id;
  end if;

  -- Idempotent: if already converted, return the existing student id.
  select id into v_student_id
    from public.students
   where tenant_id = p_tenant_id and lead_id = p_lead_id
   limit 1;
  if v_student_id is not null then
    return v_student_id;
  end if;

  insert into public.students (tenant_id, lead_id, full_name, email, phone, postcode)
  values (p_tenant_id, v_lead.id, v_lead.full_name, v_lead.email, v_lead.phone, v_lead.postcode)
  returning id into v_student_id;

  if v_lead.status <> 'converted' then
    update public.leads
       set status = 'converted'
     where id = p_lead_id and tenant_id = p_tenant_id;

    insert into public.lead_events (lead_id, tenant_id, actor_user_id, event_type, payload)
    values (
      p_lead_id, p_tenant_id, p_actor, 'status_changed',
      jsonb_build_object('from', v_lead.status::text, 'to', 'converted', 'student_id', v_student_id)
    );
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor, p_tenant_id, 'lead.converted', 'lead', p_lead_id::text,
    jsonb_build_object('student_id', v_student_id, 'package_id', p_package_id)
  );

  if p_package_id is not null then
    perform public.grant_package(v_student_id, p_tenant_id, p_actor, p_package_id);
  end if;

  return v_student_id;
end;
$$;

revoke all on function public.convert_lead_to_student(uuid, uuid, uuid, uuid) from public;
grant execute on function public.convert_lead_to_student(uuid, uuid, uuid, uuid) to service_role;

-- 3 ------------------------------------------------------------------------
-- security_invoker forces the view to execute with the caller's privileges,
-- meaning RLS on credit_ledger + students applies to anyone reading the view.
-- Without it the view runs as its owner (typically postgres) and bypasses RLS.

alter view public.student_credit_balance set (security_invoker = true);

-- Lock down privileges: revoke from anon, grant explicit SELECT to the roles
-- that the app actually uses.
revoke all on public.student_credit_balance from public;
revoke all on public.student_credit_balance from anon;
grant select on public.student_credit_balance to authenticated;
grant select on public.student_credit_balance to service_role;
