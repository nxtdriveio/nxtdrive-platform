-- 0018_student_rls_hardening.sql
-- Phase 2F follow-up: close the cross-student visibility gap that 0014/0011
-- left open.
--
-- Before this migration:
--   * `lessons_select_members` (0014) and `students_select_members` (0011)
--     both used `tenant_id in (select my_tenant_ids())`, which any tenant
--     member satisfies — including students. That gave a student RLS-level
--     read access to every other student's row and every lesson in the
--     tenant. Tenant_admin / instructor visibility was correct; the leak
--     was specifically the `student` role.
--
-- After this migration:
--   * Students only see lessons whose `student_id` maps back to their own
--     `students` row (`students.user_id = auth.uid()`).
--   * Students only see their own `students` row.
--   * Tenant_admin / instructor / platform_admin retain full tenant scope.
--
-- This also adds `public.my_lesson_instructors()`, a SECURITY DEFINER RPC
-- the student PWA uses to fetch the display name of instructors who have
-- taught the caller — so the app no longer needs the service role to
-- render instructor names. The function only returns rows for the caller's
-- own student record, so no profile-table broadening is required.

-- lessons -----------------------------------------------------------------
drop policy if exists lessons_select_members on public.lessons;
create policy lessons_select_members on public.lessons
  for select
  using (
    public.is_platform_admin()
    or exists (
      select 1
        from public.memberships m
       where m.user_id   = auth.uid()
         and m.tenant_id = lessons.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    or student_id in (
      select s.id
        from public.students s
       where s.user_id   = auth.uid()
         and s.tenant_id = lessons.tenant_id
    )
  );

-- students ----------------------------------------------------------------
drop policy if exists students_select_members on public.students;
create policy students_select_members on public.students
  for select
  using (
    public.is_platform_admin()
    or exists (
      select 1
        from public.memberships m
       where m.user_id   = auth.uid()
         and m.tenant_id = students.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    -- A student/parent-linked user can always read their own row.
    or user_id = auth.uid()
  );

-- my_lesson_instructors ---------------------------------------------------
-- Returns (instructor_id, full_name) for every instructor who has taught
-- the calling user at least one lesson. SECURITY DEFINER so the student
-- PWA can drop its service-role lookup; result set is intrinsically scoped
-- to the caller via the `students.user_id = auth.uid()` join.
create or replace function public.my_lesson_instructors()
returns table (instructor_id uuid, full_name text)
language sql
stable
security definer
set search_path = public, auth
as $$
  select distinct
         l.instructor_id,
         coalesce(p.full_name, 'Instructeur') as full_name
    from public.lessons l
    join public.students s
      on s.id = l.student_id
     and s.tenant_id = l.tenant_id
    left join public.profiles p
      on p.id = l.instructor_id
   where s.user_id = auth.uid();
$$;

revoke all on function public.my_lesson_instructors() from public;
grant execute on function public.my_lesson_instructors() to authenticated, service_role;
