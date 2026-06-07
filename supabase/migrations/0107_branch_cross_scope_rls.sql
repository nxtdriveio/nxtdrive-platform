-- Sprint 4F: cross-branch RLS hardening.
--
-- Existing tenant/student policies remain the permissive baseline. These
-- restrictive policies add an extra branch-scope check for authenticated users
-- so branch-scoped staff cannot read or mutate rows from another branch.
-- `p_include_shared = true` preserves organization-wide shared rows such as
-- shared vehicles, locations, task boards and tasks.

create or replace function public.current_user_can_access_optional_branch(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_include_shared boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = auth.uid()
       and coalesce(p.is_platform_admin, false) = true
  )
  or exists (
    select 1
      from public.memberships m
     where m.user_id = auth.uid()
       and m.tenant_id = p_tenant_id
       and (
         m.role in ('tenant_admin', 'franchise_admin')
         or coalesce(m.branch_scope_type, 'all') <> 'branches'
         or (p_include_shared and p_branch_id is null)
         or (
           p_branch_id is not null
           and exists (
             select 1
               from public.membership_branches mb
              where mb.membership_id = m.id
                and mb.branch_id = p_branch_id
           )
         )
       )
  );
$$;

create or replace function public.current_user_can_access_instructor_resource(
  p_tenant_id uuid,
  p_instructor_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with current_memberships as (
    select m.id, m.role, coalesce(m.branch_scope_type, 'all') as branch_scope_type
      from public.memberships m
     where m.user_id = auth.uid()
       and m.tenant_id = p_tenant_id
  ), target_memberships as (
    select m.id, coalesce(m.branch_scope_type, 'all') as branch_scope_type
      from public.memberships m
     where m.user_id = p_instructor_id
       and m.tenant_id = p_tenant_id
  )
  select exists (
    select 1
      from public.profiles p
     where p.id = auth.uid()
       and coalesce(p.is_platform_admin, false) = true
  )
  or exists (
    select 1
      from current_memberships cm
     where cm.role in ('tenant_admin', 'franchise_admin')
        or cm.branch_scope_type <> 'branches'
  )
  or exists (
    select 1
      from current_memberships cm
      join public.membership_branches cmb
        on cmb.membership_id = cm.id
      join target_memberships tm
        on true
      left join public.membership_branches tmb
        on tmb.membership_id = tm.id
     where cm.branch_scope_type = 'branches'
       and (
         tm.branch_scope_type <> 'branches'
         or tmb.branch_id = cmb.branch_id
       )
  );
$$;

revoke all on function public.current_user_can_access_optional_branch(uuid, uuid, boolean) from public, anon;
revoke all on function public.current_user_can_access_instructor_resource(uuid, uuid) from public, anon;
grant execute on function public.current_user_can_access_optional_branch(uuid, uuid, boolean) to authenticated, service_role;
grant execute on function public.current_user_can_access_instructor_resource(uuid, uuid) to authenticated, service_role;

-- Shared operational assets: branch_id null is visible to branch-scoped users.
drop policy if exists "branch scope vehicles" on public.vehicles;
create policy "branch scope vehicles"
  on public.vehicles
  as restrictive
  for all
  to authenticated
  using (public.current_user_can_access_optional_branch(tenant_id, branch_id, true))
  with check (public.current_user_can_access_optional_branch(tenant_id, branch_id, true));

drop policy if exists "branch scope locations" on public.locations;
create policy "branch scope locations"
  on public.locations
  as restrictive
  for all
  to authenticated
  using (public.current_user_can_access_optional_branch(tenant_id, branch_id, true))
  with check (public.current_user_can_access_optional_branch(tenant_id, branch_id, true));

drop policy if exists "branch scope task boards" on public.task_boards;
create policy "branch scope task boards"
  on public.task_boards
  as restrictive
  for all
  to authenticated
  using (public.current_user_can_access_optional_branch(tenant_id, branch_id, true))
  with check (public.current_user_can_access_optional_branch(tenant_id, branch_id, true));

drop policy if exists "branch scope tasks" on public.tasks;
create policy "branch scope tasks"
  on public.tasks
  as restrictive
  for all
  to authenticated
  using (public.current_user_can_access_optional_branch(tenant_id, branch_id, true))
  with check (public.current_user_can_access_optional_branch(tenant_id, branch_id, true));

drop policy if exists "branch scope task links" on public.task_links;
create policy "branch scope task links"
  on public.task_links
  as restrictive
  for all
  to authenticated
  using (
    exists (
      select 1
        from public.tasks t
       where t.id = task_links.task_id
         and t.tenant_id = task_links.tenant_id
         and public.current_user_can_access_optional_branch(t.tenant_id, t.branch_id, true)
    )
  )
  with check (
    exists (
      select 1
        from public.tasks t
       where t.id = task_links.task_id
         and t.tenant_id = task_links.tenant_id
         and public.current_user_can_access_optional_branch(t.tenant_id, t.branch_id, true)
    )
  );

-- Sensitive operational rows: branch_id null is not shared for branch-scoped staff.
drop policy if exists "branch scope invoices" on public.invoices;
create policy "branch scope invoices"
  on public.invoices
  as restrictive
  for all
  to authenticated
  using (public.current_user_can_access_optional_branch(tenant_id, branch_id, false))
  with check (public.current_user_can_access_optional_branch(tenant_id, branch_id, false));

drop policy if exists "branch scope invoice lines" on public.invoice_lines;
create policy "branch scope invoice lines"
  on public.invoice_lines
  as restrictive
  for all
  to authenticated
  using (
    exists (
      select 1
        from public.invoices i
       where i.id = invoice_lines.invoice_id
         and i.tenant_id = invoice_lines.tenant_id
         and public.current_user_can_access_optional_branch(i.tenant_id, i.branch_id, false)
    )
  )
  with check (
    exists (
      select 1
        from public.invoices i
       where i.id = invoice_lines.invoice_id
         and i.tenant_id = invoice_lines.tenant_id
         and public.current_user_can_access_optional_branch(i.tenant_id, i.branch_id, false)
    )
  );

drop policy if exists "branch scope installment plans" on public.installment_plans;
create policy "branch scope installment plans"
  on public.installment_plans
  as restrictive
  for all
  to authenticated
  using (public.current_user_can_access_optional_branch(tenant_id, branch_id, false))
  with check (public.current_user_can_access_optional_branch(tenant_id, branch_id, false));

drop policy if exists "branch scope payment records" on public.payment_records;
create policy "branch scope payment records"
  on public.payment_records
  as restrictive
  for all
  to authenticated
  using (public.current_user_can_access_optional_branch(tenant_id, branch_id, false))
  with check (public.current_user_can_access_optional_branch(tenant_id, branch_id, false));

drop policy if exists "branch scope lessons" on public.lessons;
create policy "branch scope lessons"
  on public.lessons
  as restrictive
  for all
  to authenticated
  using (public.current_user_can_access_optional_branch(tenant_id, branch_id, false))
  with check (public.current_user_can_access_optional_branch(tenant_id, branch_id, false));

drop policy if exists "branch scope agenda appointments" on public.agenda_appointments;
create policy "branch scope agenda appointments"
  on public.agenda_appointments
  as restrictive
  for all
  to authenticated
  using (
    case
      when student_id is not null then exists (
        select 1
          from public.students s
         where s.id = agenda_appointments.student_id
           and s.tenant_id = agenda_appointments.tenant_id
           and public.current_user_can_access_optional_branch(s.tenant_id, s.branch_id, false)
      )
      else public.current_user_can_access_instructor_resource(tenant_id, instructor_id)
    end
  )
  with check (
    case
      when student_id is not null then exists (
        select 1
          from public.students s
         where s.id = agenda_appointments.student_id
           and s.tenant_id = agenda_appointments.tenant_id
           and public.current_user_can_access_optional_branch(s.tenant_id, s.branch_id, false)
      )
      else public.current_user_can_access_instructor_resource(tenant_id, instructor_id)
    end
  );

drop policy if exists "branch scope instructor availability" on public.instructor_availability;
create policy "branch scope instructor availability"
  on public.instructor_availability
  as restrictive
  for all
  to authenticated
  using (public.current_user_can_access_instructor_resource(tenant_id, instructor_id))
  with check (public.current_user_can_access_instructor_resource(tenant_id, instructor_id));

drop policy if exists "branch scope instructor availability exceptions" on public.instructor_availability_exception;
create policy "branch scope instructor availability exceptions"
  on public.instructor_availability_exception
  as restrictive
  for all
  to authenticated
  using (public.current_user_can_access_instructor_resource(tenant_id, instructor_id))
  with check (public.current_user_can_access_instructor_resource(tenant_id, instructor_id));

comment on function public.current_user_can_access_optional_branch(uuid, uuid, boolean) is
  'Returns whether auth.uid() can access a tenant row with an optional branch assignment. Used by Sprint 4F restrictive RLS policies.';

comment on function public.current_user_can_access_instructor_resource(uuid, uuid) is
  'Returns whether auth.uid() can access resources for an instructor based on overlapping branch memberships.';
