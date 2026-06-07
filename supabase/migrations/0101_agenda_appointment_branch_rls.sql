-- ============================================================================
-- 0101_agenda_appointment_branch_rls.sql
--
-- Align agenda_appointments SELECT RLS with the new first-class branch_id.
-- Tenant/franchise/platform admins keep organization-wide access; scoped staff
-- read rows in their expanded branch set; instructors can still read their own
-- rows even when a row is not branch-assigned.
-- ============================================================================

drop policy if exists agenda_appointments_select_members on public.agenda_appointments;
create policy agenda_appointments_select_members on public.agenda_appointments
  for select
  using (
    public.is_platform_admin()
    or public.has_role(tenant_id, 'tenant_admin')
    or public.has_role(tenant_id, 'franchise_admin')
    or (
      exists (
        select 1 from public.memberships m
         where m.user_id   = auth.uid()
           and m.tenant_id = agenda_appointments.tenant_id
           and m.role in ('branch_manager', 'planner', 'admin_staff', 'marketing', 'instructor')
      )
      and agenda_appointments.branch_id in (
        select public.my_branch_ids(agenda_appointments.tenant_id)
      )
    )
    or instructor_id = auth.uid()
    or student_id in (
      select s.id from public.students s
       where s.user_id   = auth.uid()
         and s.tenant_id = agenda_appointments.tenant_id
    )
    or student_id in (
      select g.student_id from public.student_guardians g
       where g.user_id   = auth.uid()
         and g.tenant_id = agenda_appointments.tenant_id
    )
  );
