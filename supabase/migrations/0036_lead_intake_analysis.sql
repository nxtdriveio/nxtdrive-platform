-- 0036_lead_intake_analysis.sql
-- Fase 1B — Intake-analyse (labels, score & advies).
-- Stores the deterministic, rule-based analysis derived from a lead's intake
-- answers: structured labels (for filtering/showing), a numeric attention score,
-- a structured score breakdown (attention points), a natural-language summary
-- and a recommended next step. One analysis row per lead.
--
-- Writes ALWAYS go through the service role via upsert_lead_intake_analysis().
-- No client INSERT/UPDATE/DELETE policies — read-only for tenant members.
-- The analysis engine itself is deterministic TypeScript (server-side); this
-- table only persists the result so the backoffice can show and later filter on it.

-- lead_intake_analysis -----------------------------------------------------
create table if not exists public.lead_intake_analysis (
  id                uuid primary key default gen_random_uuid(),
  lead_id           uuid not null,
  tenant_id         uuid not null,
  -- Derived labels (e.g. new_driver, theory_missing, fast_track). Kept as a
  -- structured text[] so the backoffice can filter/show them.
  labels            text[] not null default '{}',
  -- Total attention score (higher = more attention/guidance needed).
  score             integer not null default 0,
  -- Structured score breakdown: [{ code, label, points, category }].
  attention_points  jsonb not null default '[]'::jsonb,
  -- Natural-language Dutch summary.
  summary           text not null default '',
  -- Recommended next step code (label resolved in the UI).
  recommended_step  text not null default 'plan_trial_lesson',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- One analysis per lead.
  constraint lead_intake_analysis_lead_unique unique (lead_id),
  -- Tenant consistency: the (lead_id, tenant_id) pair must match a real lead.
  constraint lead_intake_analysis_lead_tenant_fkey
    foreign key (lead_id, tenant_id)
    references public.leads (id, tenant_id)
    on delete cascade,
  constraint lead_intake_analysis_step_chk
    check (recommended_step in (
      'plan_trial_lesson', 'theory_reminder', 'admin_action', 'contact_student'
    )),
  check (char_length(summary) <= 2000),
  check (cardinality(labels) <= 32)
);

drop trigger if exists lead_intake_analysis_set_updated_at on public.lead_intake_analysis;
create trigger lead_intake_analysis_set_updated_at
  before update on public.lead_intake_analysis
  for each row execute function public.set_updated_at();

-- Indexes ------------------------------------------------------------------
-- lead_id is already unique; add a tenant index for tenant-scoped scans and a
-- GIN index on labels so the backoffice can later filter leads by label.
create index if not exists idx_lead_intake_analysis_tenant_created
  on public.lead_intake_analysis (tenant_id, created_at desc);
create index if not exists idx_lead_intake_analysis_labels
  on public.lead_intake_analysis using gin (labels);

-- RLS ----------------------------------------------------------------------
alter table public.lead_intake_analysis enable row level security;

drop policy if exists lead_intake_analysis_select_members on public.lead_intake_analysis;
create policy lead_intake_analysis_select_members on public.lead_intake_analysis
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or public.is_platform_admin()
  );

-- No INSERT/UPDATE/DELETE policies — service role writes only.

-- upsert_lead_intake_analysis ----------------------------------------------
-- Idempotent: recomputing and re-storing the analysis is always safe (one row
-- per lead, on conflict updates in place). Used both at intake submission and
-- as a backfill when an existing lead has intake answers but no analysis yet.
create or replace function public.upsert_lead_intake_analysis(
  p_lead_id          uuid,
  p_tenant_id        uuid,
  p_labels           text[],
  p_score            integer,
  p_attention_points jsonb,
  p_summary          text,
  p_recommended_step text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.leads
     where id = p_lead_id and tenant_id = p_tenant_id
  ) then
    raise exception 'lead % not found in tenant %', p_lead_id, p_tenant_id;
  end if;

  insert into public.lead_intake_analysis (
    lead_id, tenant_id, labels, score, attention_points, summary, recommended_step
  ) values (
    p_lead_id, p_tenant_id, coalesce(p_labels, '{}'), coalesce(p_score, 0),
    coalesce(p_attention_points, '[]'::jsonb), coalesce(p_summary, ''),
    coalesce(p_recommended_step, 'plan_trial_lesson')
  )
  on conflict (lead_id) do update
    set labels           = excluded.labels,
        score            = excluded.score,
        attention_points = excluded.attention_points,
        summary          = excluded.summary,
        recommended_step = excluded.recommended_step;
end;
$$;

-- Service-role-only: revoke from PUBLIC, anon and authenticated so the RPC
-- cannot be invoked (or its actor forged) via the PostgREST anon/auth roles.
revoke all on function public.upsert_lead_intake_analysis(
  uuid, uuid, text[], integer, jsonb, text, text
) from public;
revoke execute on function public.upsert_lead_intake_analysis(
  uuid, uuid, text[], integer, jsonb, text, text
) from anon, authenticated;
grant execute on function public.upsert_lead_intake_analysis(
  uuid, uuid, text[], integer, jsonb, text, text
) to service_role;
