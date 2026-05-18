-- 0017_student_visibility.sql
-- Phase 2F (Student PWA) RLS hardening:
--   * Tighten `credit_ledger` SELECT: students may only read their own rows;
--     tenant_admin / instructor retain full tenant visibility.
--   * Tighten `lesson_notes` SELECT: students no longer see raw notes
--     (they get progress via `lessons.progress_summary`).
--   * Mark `student_credit_balance` view as security_invoker so RLS on
--     `credit_ledger` is enforced for the calling user (otherwise the view's
--     definer would bypass it and leak other students' balances).
--
-- Notes:
--   - `lessons_select_members` (0014) already restricts students to their own
--     lessons via students.user_id; no change needed here.
--   - `students_select_members` (0011) already lets a student read their own
--     row via `user_id = auth.uid()`; no change needed here.

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
  );

-- lesson_notes ------------------------------------------------------------
drop policy if exists lesson_notes_select_members on public.lesson_notes;
create policy lesson_notes_select_members on public.lesson_notes
  for select
  using (
    public.is_platform_admin()
    or exists (
      select 1
        from public.memberships m
       where m.user_id   = auth.uid()
         and m.tenant_id = lesson_notes.tenant_id
         and m.role in ('tenant_admin', 'instructor')
    )
  );

-- student_credit_balance --------------------------------------------------
-- Recreate the view with security_invoker so the caller's RLS on
-- credit_ledger applies. Without this, the view runs as its owner and
-- aggregates rows the caller would not normally see.
drop view if exists public.student_credit_balance;
create view public.student_credit_balance
  with (security_invoker = true)
as
select
  s.id        as student_id,
  s.tenant_id as tenant_id,
  coalesce(sum(l.delta), 0)::integer as balance
from public.students s
left join public.credit_ledger l
  on l.student_id = s.id and l.tenant_id = s.tenant_id
group by s.id, s.tenant_id;

grant select on public.student_credit_balance to authenticated, service_role;
