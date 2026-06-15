-- 0118_availability_branch_management.sql
-- Sprint 2: make instructor availability branch-aware for the Operations
-- Planning Core. Organization-wide rows keep branch_id = null; branch rows are
-- scoped to one vestiging and are consumed by the planning kernel.

create or replace function public._availability_actor_authorized_for_branch(
  p_actor uuid,
  p_tenant_id uuid,
  p_instructor_id uuid,
  p_branch_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public._tenant_admin_authorized(p_actor, p_tenant_id)
    or (
      p_actor = p_instructor_id
      and exists (
        select 1
          from public.memberships m
         where m.user_id = p_actor
           and m.tenant_id = p_tenant_id
           and m.role in ('instructor', 'tenant_admin')
      )
    )
    or (
      p_branch_id is null
      and exists (
        select 1
          from public.memberships m
         where m.user_id = p_actor
           and m.tenant_id = p_tenant_id
           and m.role = 'franchise_admin'
      )
    )
    or (
      p_branch_id is not null
      and exists (
        select 1
          from public.memberships m
         where m.user_id = p_actor
           and m.tenant_id = p_tenant_id
           and m.role in ('franchise_admin', 'branch_manager', 'planner')
           and (
             m.branch_scope_type = 'all'
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

revoke all on function public._availability_actor_authorized_for_branch(uuid, uuid, uuid, uuid) from public;
revoke all on function public._availability_actor_authorized_for_branch(uuid, uuid, uuid, uuid) from anon, authenticated;
grant execute on function public._availability_actor_authorized_for_branch(uuid, uuid, uuid, uuid) to service_role;

create or replace function public._availability_instructor_can_serve_branch(
  p_tenant_id uuid,
  p_instructor_id uuid,
  p_branch_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_branch_id is null
    or exists (
      select 1
        from public.memberships m
       where m.user_id = p_instructor_id
         and m.tenant_id = p_tenant_id
         and m.role in ('instructor', 'tenant_admin')
         and (
           m.branch_scope_type = 'all'
           or exists (
             select 1
               from public.membership_branches mb
              where mb.membership_id = m.id
                and mb.branch_id = p_branch_id
           )
         )
    );
$$;

revoke all on function public._availability_instructor_can_serve_branch(uuid, uuid, uuid) from public;
revoke all on function public._availability_instructor_can_serve_branch(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public._availability_instructor_can_serve_branch(uuid, uuid, uuid) to service_role;

create or replace function public.set_instructor_weekly_availability(
  p_tenant_id uuid,
  p_actor uuid,
  p_instructor_id uuid,
  p_branch_id uuid,
  p_blocks jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_branch_id is not null and not exists (
    select 1 from public.branches b
     where b.id = p_branch_id
       and b.tenant_id = p_tenant_id
  ) then
    raise exception 'branch % is not part of tenant %', p_branch_id, p_tenant_id;
  end if;

  if not public._availability_actor_authorized_for_branch(
    p_actor,
    p_tenant_id,
    p_instructor_id,
    p_branch_id
  ) then
    raise exception 'actor % not authorized to manage availability of % in tenant %',
      p_actor, p_instructor_id, p_tenant_id;
  end if;

  if not exists (
    select 1 from public.memberships m
     where m.user_id = p_instructor_id
       and m.tenant_id = p_tenant_id
       and m.role in ('instructor', 'tenant_admin')
  ) then
    raise exception 'instructor % is not a member of tenant %', p_instructor_id, p_tenant_id;
  end if;

  if not public._availability_instructor_can_serve_branch(
    p_tenant_id,
    p_instructor_id,
    p_branch_id
  ) then
    raise exception 'instructor % cannot serve branch %', p_instructor_id, p_branch_id;
  end if;

  delete from public.instructor_availability
   where tenant_id = p_tenant_id
     and instructor_id = p_instructor_id
     and branch_id is not distinct from p_branch_id;

  insert into public.instructor_availability (
    tenant_id, branch_id, instructor_id, weekday, start_min, end_min
  )
  select
    p_tenant_id,
    p_branch_id,
    p_instructor_id,
    (b->>'weekday')::smallint,
    (b->>'start_min')::integer,
    (b->>'end_min')::integer
  from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb)) as b;

  select count(*) into v_count
    from public.instructor_availability
   where tenant_id = p_tenant_id
     and instructor_id = p_instructor_id
     and branch_id is not distinct from p_branch_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor,
    p_tenant_id,
    'availability.weekly_set',
    'instructor',
    p_instructor_id::text,
    jsonb_build_object('blocks', v_count, 'branch_id', p_branch_id)
  );
end;
$$;

revoke all on function public.set_instructor_weekly_availability(uuid, uuid, uuid, uuid, jsonb) from public;
revoke all on function public.set_instructor_weekly_availability(uuid, uuid, uuid, uuid, jsonb) from anon, authenticated;
grant execute on function public.set_instructor_weekly_availability(uuid, uuid, uuid, uuid, jsonb) to service_role;

create or replace function public.upsert_availability_exception(
  p_tenant_id uuid,
  p_actor uuid,
  p_instructor_id uuid,
  p_id uuid,
  p_branch_id uuid,
  p_exception_date date,
  p_kind text,
  p_start_min integer,
  p_end_min integer,
  p_note text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_kind public.availability_exception_kind;
begin
  if p_branch_id is not null and not exists (
    select 1 from public.branches b
     where b.id = p_branch_id
       and b.tenant_id = p_tenant_id
  ) then
    raise exception 'branch % is not part of tenant %', p_branch_id, p_tenant_id;
  end if;

  if not public._availability_actor_authorized_for_branch(
    p_actor,
    p_tenant_id,
    p_instructor_id,
    p_branch_id
  ) then
    raise exception 'actor % not authorized to manage availability of % in tenant %',
      p_actor, p_instructor_id, p_tenant_id;
  end if;

  if p_kind not in ('available', 'blocked') then
    raise exception 'invalid exception kind %', p_kind;
  end if;
  v_kind := p_kind::public.availability_exception_kind;

  if not exists (
    select 1 from public.memberships m
     where m.user_id = p_instructor_id
       and m.tenant_id = p_tenant_id
       and m.role in ('instructor', 'tenant_admin')
  ) then
    raise exception 'instructor % is not a member of tenant %', p_instructor_id, p_tenant_id;
  end if;

  if not public._availability_instructor_can_serve_branch(
    p_tenant_id,
    p_instructor_id,
    p_branch_id
  ) then
    raise exception 'instructor % cannot serve branch %', p_instructor_id, p_branch_id;
  end if;

  if p_id is null then
    insert into public.instructor_availability_exception (
      tenant_id,
      branch_id,
      instructor_id,
      exception_date,
      kind,
      start_min,
      end_min,
      note,
      created_by
    ) values (
      p_tenant_id,
      p_branch_id,
      p_instructor_id,
      p_exception_date,
      v_kind,
      p_start_min,
      p_end_min,
      p_note,
      p_actor
    )
    returning id into v_id;
  else
    update public.instructor_availability_exception
       set branch_id = p_branch_id,
           exception_date = p_exception_date,
           kind = v_kind,
           start_min = p_start_min,
           end_min = p_end_min,
           note = p_note
     where id = p_id
       and tenant_id = p_tenant_id
       and instructor_id = p_instructor_id
    returning id into v_id;
    if v_id is null then
      raise exception 'exception % not found for instructor % in tenant %',
        p_id, p_instructor_id, p_tenant_id;
    end if;
  end if;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor,
    p_tenant_id,
    'availability.exception_upsert',
    'availability_exception',
    v_id::text,
    jsonb_build_object(
      'instructor_id', p_instructor_id,
      'branch_id', p_branch_id,
      'date', p_exception_date,
      'kind', p_kind
    )
  );

  return v_id;
end;
$$;

revoke all on function public.upsert_availability_exception(uuid, uuid, uuid, uuid, uuid, date, text, integer, integer, text) from public;
revoke all on function public.upsert_availability_exception(uuid, uuid, uuid, uuid, uuid, date, text, integer, integer, text) from anon, authenticated;
grant execute on function public.upsert_availability_exception(uuid, uuid, uuid, uuid, uuid, date, text, integer, integer, text) to service_role;

create or replace function public.delete_availability_exception(
  p_tenant_id uuid,
  p_actor uuid,
  p_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  select * into v_row
    from public.instructor_availability_exception
   where id = p_id and tenant_id = p_tenant_id
   for update;
  if v_row.id is null then
    raise exception 'exception % not found in tenant %', p_id, p_tenant_id;
  end if;

  if not public._availability_actor_authorized_for_branch(
    p_actor,
    p_tenant_id,
    v_row.instructor_id,
    v_row.branch_id
  ) then
    raise exception 'actor % not authorized to delete availability of % in tenant %',
      p_actor, v_row.instructor_id, p_tenant_id;
  end if;

  delete from public.instructor_availability_exception
   where id = p_id and tenant_id = p_tenant_id;

  insert into public.audit_log (
    actor_user_id, tenant_id, action, target_type, target_id, payload
  ) values (
    p_actor,
    p_tenant_id,
    'availability.exception_deleted',
    'availability_exception',
    p_id::text,
    jsonb_build_object(
      'instructor_id', v_row.instructor_id,
      'branch_id', v_row.branch_id,
      'date', v_row.exception_date
    )
  );
end;
$$;

revoke all on function public.delete_availability_exception(uuid, uuid, uuid) from public;
revoke all on function public.delete_availability_exception(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.delete_availability_exception(uuid, uuid, uuid) to service_role;
