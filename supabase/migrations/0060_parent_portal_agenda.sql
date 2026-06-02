-- 0060_parent_portal_agenda.sql
--
-- Task #96 follow-up — make `agenda_appointments` visibility correct for the
-- read-only Ouderportaal (/ouder).
--
-- The parent portal's "planning" and "examens" sections both read
-- `agenda_appointments` through the RLS-scoped client. Migration 0049 gave
-- `agenda_appointments_select_members` three branches:
--   (a) tenant_id in (select public.my_tenant_ids())   -- ANY membership row
--   (b) public.is_platform_admin()
--   (c) student_id in (students where user_id = auth.uid())  -- the student
--
-- Branch (a) keys off `my_tenant_ids()`, which returns every tenant where the
-- caller has ANY membership row — regardless of role. A parent is provisioned
-- with a 'parent' membership, so branch (a) let a parent read EVERY appointment
-- in the tenant (including other children's). That is over-exposure, the exact
-- opposite of the read-only, child-scoped contract of the portal.
--
-- Fix (forward-only — 0049 stays untouched): replace branch (a) with an
-- explicit STAFF-role membership check (tenant_admin / instructor), exactly as
-- the invoices/documents policies do (0058/0059). Staff keep full visibility,
-- the student keeps their self branch, and a NEW guardian branch scopes a
-- linked parent to their own child(ren) only.
--
-- Read-only: no insert/update/delete policies are added — all writes stay on
-- the existing service-role RPCs.

drop policy if exists agenda_appointments_select_members on public.agenda_appointments;
create policy agenda_appointments_select_members on public.agenda_appointments
  for select
  using (
    public.is_platform_admin()
    -- Staff branch: tenant_admin / instructor see all appointments.
    or exists (
      select 1
        from public.memberships m
       where m.user_id   = auth.uid()
         and m.tenant_id = agenda_appointments.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    -- The student themselves.
    or student_id in (
      select s.id
        from public.students s
       where s.user_id   = auth.uid()
         and s.tenant_id = agenda_appointments.tenant_id
    )
    -- Parent / guardian branch: appointments of a linked child (read-only).
    or student_id in (
      select g.student_id
        from public.student_guardians g
        join public.students s
          on s.id = g.student_id and s.tenant_id = agenda_appointments.tenant_id
       where g.user_id = auth.uid()
    )
  );
