-- 0023_rpc_grant_lockdown.sql
--
-- Phase 3 follow-up #16 — defense-in-depth on every SECURITY DEFINER
-- mutation RPC defined in earlier migrations.
--
-- Why: Supabase configures default privileges that automatically GRANT
-- EXECUTE on any new public-schema function to the `anon` and
-- `authenticated` roles. Earlier migrations only ran `REVOKE ALL ...
-- FROM public`, which does NOT revoke those role-specific grants.
-- A logged-in student or instructor JWT could therefore call our
-- SECURITY DEFINER mutation functions directly via PostgREST,
-- bypassing server-action role gating.
--
-- Migration 0020 already patched this for the invoice RPCs after the
-- RLS tests caught it. This migration applies the same explicit
-- revoke to every earlier mutation RPC and re-grants only to
-- service_role. Function bodies and signatures are NOT touched.
--
-- Helper functions that ARE intentionally callable by `authenticated`
-- are deliberately left alone:
--   - public.is_platform_admin()
--   - public.my_tenant_ids()
--   - public.has_role(uuid, public.member_role)
--   - public.my_lesson_instructors()

begin;

-- Leads (migration 0009) -----------------------------------------------------
revoke execute on function public.create_lead(
  uuid, public.lead_source, text, text, text, text, text, inet, text
) from anon, authenticated;
grant execute on function public.create_lead(
  uuid, public.lead_source, text, text, text, text, text, inet, text
) to service_role;

revoke execute on function public.update_lead_status(
  uuid, uuid, uuid, public.lead_status
) from anon, authenticated;
grant execute on function public.update_lead_status(
  uuid, uuid, uuid, public.lead_status
) to service_role;

revoke execute on function public.add_lead_note(uuid, uuid, uuid, text)
  from anon, authenticated;
grant execute on function public.add_lead_note(uuid, uuid, uuid, text)
  to service_role;

-- Credits (migrations 0012 / 0013) -------------------------------------------
revoke execute on function public.grant_package(uuid, uuid, uuid, uuid)
  from anon, authenticated;
grant execute on function public.grant_package(uuid, uuid, uuid, uuid)
  to service_role;

revoke execute on function public.adjust_credits(uuid, uuid, uuid, integer, text)
  from anon, authenticated;
grant execute on function public.adjust_credits(uuid, uuid, uuid, integer, text)
  to service_role;

revoke execute on function public.convert_lead_to_student(uuid, uuid, uuid, uuid)
  from anon, authenticated;
grant execute on function public.convert_lead_to_student(uuid, uuid, uuid, uuid)
  to service_role;

-- Lessons (migrations 0014 / 0015) -------------------------------------------
revoke execute on function public.schedule_lesson(
  uuid, uuid, uuid, uuid, timestamptz, integer, integer, text, text
) from anon, authenticated;
grant execute on function public.schedule_lesson(
  uuid, uuid, uuid, uuid, timestamptz, integer, integer, text, text
) to service_role;

revoke execute on function public._lesson_actor_authorized(uuid, uuid)
  from anon, authenticated;
grant execute on function public._lesson_actor_authorized(uuid, uuid)
  to service_role;

revoke execute on function public.complete_lesson(uuid, uuid, uuid)
  from anon, authenticated;
grant execute on function public.complete_lesson(uuid, uuid, uuid)
  to service_role;

revoke execute on function public.cancel_lesson(uuid, uuid, uuid, text)
  from anon, authenticated;
grant execute on function public.cancel_lesson(uuid, uuid, uuid, text)
  to service_role;

-- Lesson progress (migration 0016) -------------------------------------------
revoke execute on function public.mark_lesson_no_show(uuid, uuid, uuid)
  from anon, authenticated;
grant execute on function public.mark_lesson_no_show(uuid, uuid, uuid)
  to service_role;

revoke execute on function public.add_lesson_note(uuid, uuid, uuid, text)
  from anon, authenticated;
grant execute on function public.add_lesson_note(uuid, uuid, uuid, text)
  to service_role;

revoke execute on function public.set_lesson_progress(uuid, uuid, uuid, smallint, text)
  from anon, authenticated;
grant execute on function public.set_lesson_progress(uuid, uuid, uuid, smallint, text)
  to service_role;

-- CBR checklist (migration 0022) ---------------------------------------------
revoke execute on function public.seed_default_cbr_competencies(uuid, uuid)
  from anon, authenticated;
grant execute on function public.seed_default_cbr_competencies(uuid, uuid)
  to service_role;

revoke execute on function public.set_student_cbr_progress(uuid, uuid, uuid, uuid, boolean)
  from anon, authenticated;
grant execute on function public.set_student_cbr_progress(uuid, uuid, uuid, uuid, boolean)
  to service_role;

commit;
