-- ============================================================================
-- 0042_lead_score_policy.sql
--
-- Fase 1B (Task #56) — Auto-score & prioritise leads from their intake profile.
--
-- Lead scoring is tenant-configurable, NEVER hardcoded per school. The point
-- value of every scoring rule and the warm/hot band thresholds live in
-- tenant_settings under key `lead_score_policy`. Rule *conditions* stay in code
-- (deterministic, no AI); only the tunable weights + bands are stored here.
--
-- This migration seeds the platform-default policy for EVERY existing tenant so
-- the backoffice always has an explicit row to read/edit. The application still
-- falls back to the in-code defaults when a row is absent, so this is purely a
-- convenience + makes per-tenant tuning discoverable. Idempotent: re-running
-- never overwrites a tenant that already customised its policy.
--
-- Default weights mirror DEFAULT_LEAD_SCORE_POLICY in
-- artifacts/nxtdrive/lib/leads/lead-score.ts. Keep both in sync.
-- ============================================================================

insert into public.tenant_settings (tenant_id, key, value)
select
  t.id,
  'lead_score_policy',
  jsonb_build_object(
    'weights', jsonb_build_object(
      'phone',            10,
      'email',             5,
      'intake',           15,
      'theory',           10,
      'cbr',               5,
      'health',            5,
      'soon',             15,
      'intensity',         5,
      'referral',          5,
      'trial_planned',    15,
      'trial_confirmed',  10,
      'trial_completed',  10,
      'fresh',            10
    ),
    'bands', jsonb_build_object('warm', 30, 'hot', 60)
  )
from public.tenants t
on conflict (tenant_id, key) do nothing;
