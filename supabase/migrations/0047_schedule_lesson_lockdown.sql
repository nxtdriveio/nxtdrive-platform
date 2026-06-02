-- 0047_schedule_lesson_lockdown.sql
--
-- Defense-in-depth follow-up to 0046_tegoed_uren.sql.
--
-- Why: 0046 recreated public.schedule_lesson with a new 12-argument signature
-- (it added p_location_lat / p_location_lng / p_location_place_id). On every
-- environment where 0046 had ALREADY been applied before this lockdown was
-- added (e.g. staging), the recreated function inherited Supabase's default
-- privileges, which auto-GRANT EXECUTE to `anon` and `authenticated`. That
-- leaves the SECURITY DEFINER mutation directly callable via PostgREST by any
-- logged-in JWT, bypassing the server-action / service-role boundary.
--
-- This migration re-applies the same explicit lockdown used in 0023 to the
-- current schedule_lesson signature. It is idempotent: on a fresh database
-- 0046 already revokes from anon/authenticated, so this is a harmless no-op;
-- on already-migrated databases it closes the gap. Function body/signature
-- are NOT touched.

begin;

revoke execute on function public.schedule_lesson(
  uuid, uuid, uuid, uuid, timestamptz, integer, integer, text, text,
  double precision, double precision, text
) from anon, authenticated;

grant execute on function public.schedule_lesson(
  uuid, uuid, uuid, uuid, timestamptz, integer, integer, text, text,
  double precision, double precision, text
) to service_role;

commit;
