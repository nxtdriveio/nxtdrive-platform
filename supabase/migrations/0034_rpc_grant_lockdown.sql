-- 0034 — RPC grant lockdown for L4 (lesson context + theory) functions.
--
-- Migrations 0032 and 0033 created SECURITY DEFINER RPCs that trust a
-- caller-supplied p_actor and are documented as service_role-only. They
-- revoked EXECUTE from PUBLIC and granted it to service_role, but Supabase
-- ALSO grants EXECUTE on new public functions to the anon and authenticated
-- roles by default (see 0031). Revoking PUBLIC alone does NOT remove those
-- role grants, so an authenticated client could call these RPCs directly and
-- forge a privileged actor UUID, bypassing the server-side service-role-only
-- mutation boundary.
--
-- This migration explicitly revokes EXECUTE from anon and authenticated for
-- every affected function. Revokes are idempotent, so this is safe to run on
-- both already-migrated environments (staging) and fresh databases.

-- 0032 — lesson context RPCs
revoke execute on function public._tenant_admin_authorized(uuid, uuid) from anon, authenticated;
revoke execute on function public.upsert_vehicle(uuid, uuid, uuid, text, text, text, boolean) from anon, authenticated;
revoke execute on function public.set_vehicle_active(uuid, uuid, uuid, boolean) from anon, authenticated;
revoke execute on function public.upsert_location(uuid, uuid, uuid, text, text, boolean) from anon, authenticated;
revoke execute on function public.set_location_active(uuid, uuid, uuid, boolean) from anon, authenticated;
revoke execute on function public.set_lesson_context(uuid, uuid, uuid, uuid, uuid, text, text, text, uuid[]) from anon, authenticated;

-- 0033 — theory RPCs
revoke execute on function public.upsert_theory_module(uuid, uuid, uuid, text, text, text, boolean) from anon, authenticated;
revoke execute on function public.set_theory_module_active(uuid, uuid, uuid, boolean) from anon, authenticated;
revoke execute on function public.set_theory_module_skills(uuid, uuid, uuid, uuid[]) from anon, authenticated;
revoke execute on function public.assign_theory_homework(uuid, uuid, uuid, uuid, uuid, date, text) from anon, authenticated;
revoke execute on function public.set_theory_homework_status(uuid, uuid, uuid, public.theory_homework_status) from anon, authenticated;
