-- 0019_student_guardians.sql
-- Parent ↔ student linkage. The `parent` role exists in the member_role
-- enum but, prior to this migration, had no link to a specific student
-- record. As a result the Student PWA was gated to ["student"] only so a
-- parent login could not inherit tenant-wide student/lesson visibility
-- via the RLS policies (see comment in app/student/layout.tsx).
--
-- This migration introduces `public.student_guardians` and extends the
-- relevant SELECT policies so a parent can read ONLY the students they
-- are explicitly linked to (and the lessons / credit ledger rows for
-- those students). Tenant_admin / instructor / platform_admin scope is
-- unchanged.

-- student_guardians -------------------------------------------------------
create table if not exists public.student_guardians (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  student_id  uuid not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  relation    text,
  created_at  timestamptz not null default now(),
  -- Tenant-consistent FK: the linked student must belong to the same tenant.
  constraint student_guardians_student_tenant_fkey
    foreign key (student_id, tenant_id)
    references public.students (id, tenant_id)
    on delete cascade,
  -- One guardian row per (student, user). A user can be guardian of
  -- multiple students, and a student can have multiple guardians.
  unique (student_id, user_id),
  check (relation is null or char_length(relation) between 1 and 60)
);

create index if not exists idx_student_guardians_user_tenant
  on public.student_guardians (user_id, tenant_id);

create index if not exists idx_student_guardians_student
  on public.student_guardians (student_id);

alter table public.student_guardians enable row level security;

-- Members of the tenant in an admin/instructor role can read all guardian
-- rows in their tenant; a guardian can read their own link rows. No
-- INSERT/UPDATE/DELETE policies — writes go through service role.
drop policy if exists student_guardians_select_members on public.student_guardians;
create policy student_guardians_select_members on public.student_guardians
  for select
  using (
    public.is_platform_admin()
    or exists (
      select 1
        from public.memberships m
       where m.user_id   = auth.uid()
         and m.tenant_id = student_guardians.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    or user_id = auth.uid()
  );

-- students ----------------------------------------------------------------
-- Extend with a guardian branch so a parent can read the linked child row.
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
    -- A guardian can read the rows of their linked children.
    or id in (
      select g.student_id
        from public.student_guardians g
       where g.user_id   = auth.uid()
         and g.tenant_id = students.tenant_id
    )
  );

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
    or student_id in (
      select g.student_id
        from public.student_guardians g
       where g.user_id   = auth.uid()
         and g.tenant_id = lessons.tenant_id
    )
  );

-- credit_ledger -----------------------------------------------------------
drop policy if exists credit_ledger_select_members on public.credit_ledger;
create policy credit_ledger_select_members on public.credit_ledger
  for select
  using (
    public.is_platform_admin()
    or exists (
      select 1
        from public.memberships m
       where m.user_id   = auth.uid()
         and m.tenant_id = credit_ledger.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
    or student_id in (
      select s.id
        from public.students s
       where s.user_id   = auth.uid()
         and s.tenant_id = credit_ledger.tenant_id
    )
    or student_id in (
      select g.student_id
        from public.student_guardians g
       where g.user_id   = auth.uid()
         and g.tenant_id = credit_ledger.tenant_id
    )
  );

-- student_credit_balance is already a security_invoker view (see 0017),
-- so it inherits the credit_ledger + students RLS extensions above.

-- my_lesson_instructors ---------------------------------------------------
-- Extend to also surface instructor display names for lessons taught to
-- the caller's linked children. Result remains intrinsically scoped to
-- auth.uid() through students.user_id and student_guardians.user_id.
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
    left join public.profiles p
      on p.id = l.instructor_id
   where l.student_id in (
           select s.id
             from public.students s
            where s.user_id = auth.uid()
           union
           select g.student_id
             from public.student_guardians g
            where g.user_id = auth.uid()
         );
$$;

revoke all on function public.my_lesson_instructors() from public;
grant execute on function public.my_lesson_instructors() to authenticated, service_role;
