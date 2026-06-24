-- Phase 10 - AI-ready planning metrics.
--
-- No AI is executed here. These views expose deterministic, tenant-safe
-- planning measurements that future AI/recommendation layers can consume:
-- score history, booking outcomes, lesson/no-show outcomes, route efficiency
-- and daily planning quality.

create or replace view public.ai_booking_score_history
with (security_invoker = true)
as
with preference_stats as (
  select
    booking_candidate_id,
    count(*)::integer as preference_count,
    min(preference_rank)::integer as best_preference_rank,
    bool_or(status = 'confirmed') as preference_confirmed,
    min(selected_at) as first_selected_at
  from public.booking_candidate_preferences
  group by booking_candidate_id
),
confirmation_stats as (
  select
    booking_candidate_id,
    count(*)::integer as confirmation_count,
    count(*) filter (where status = 'accepted')::integer as accepted_count,
    count(*) filter (where status = 'declined')::integer as declined_count,
    count(*) filter (where status = 'expired')::integer as expired_count,
    min(responded_at) filter (where status in ('accepted', 'declined')) as first_response_at,
    max(responded_at) filter (where status = 'accepted') as last_accept_at
  from public.booking_confirmations
  group by booking_candidate_id
),
hold_stats as (
  select
    booking_candidate_id,
    count(*)::integer as hold_count,
    count(*) filter (where status = 'confirmed')::integer as confirmed_hold_count,
    min(created_at) as first_hold_at,
    max(confirmed_at) as hold_confirmed_at
  from public.booking_holds
  where booking_candidate_id is not null
  group by booking_candidate_id
)
select
  c.tenant_id,
  c.branch_id,
  c.booking_request_id,
  c.id as booking_candidate_id,
  r.source,
  r.requester_type,
  r.entity_type,
  r.status as request_status,
  r.lead_id,
  r.student_id,
  c.instructor_id,
  c.vehicle_id,
  c.rank,
  c.score,
  c.score_factors,
  c.warnings,
  c.blocking_reasons,
  jsonb_array_length(c.warnings) as warning_count,
  jsonb_array_length(c.blocking_reasons) as blocking_count,
  c.route_status,
  c.route_travel_to_min,
  c.route_travel_from_min,
  coalesce(c.route_travel_to_min, 0) + coalesce(c.route_travel_from_min, 0)
    as route_total_travel_min,
  c.route_needs_confirm,
  c.starts_at,
  c.ends_at,
  c.duration_min,
  c.status as candidate_status,
  coalesce(p.preference_count, 0) as preference_count,
  p.best_preference_rank,
  coalesce(p.preference_confirmed, false) as preference_confirmed,
  p.first_selected_at,
  coalesce(cf.confirmation_count, 0) as confirmation_count,
  coalesce(cf.accepted_count, 0) as accepted_count,
  coalesce(cf.declined_count, 0) as declined_count,
  coalesce(cf.expired_count, 0) as expired_count,
  cf.first_response_at,
  cf.last_accept_at,
  coalesce(h.hold_count, 0) as hold_count,
  coalesce(h.confirmed_hold_count, 0) as confirmed_hold_count,
  h.first_hold_at,
  h.hold_confirmed_at,
  case
    when c.status = 'confirmed'
      or coalesce(p.preference_confirmed, false)
      or coalesce(cf.accepted_count, 0) > 0
      or coalesce(h.confirmed_hold_count, 0) > 0
      then 'converted'
    when c.status in ('rejected', 'expired') then c.status
    when coalesce(cf.declined_count, 0) > 0 then 'declined'
    when coalesce(p.preference_count, 0) > 0 then 'selected'
    when coalesce(h.hold_count, 0) > 0 then 'held'
    else 'generated'
  end as candidate_outcome,
  extract(epoch from (c.starts_at - r.created_at)) / 60.0 as minutes_from_request_to_slot,
  extract(epoch from (coalesce(cf.first_response_at, p.first_selected_at, h.first_hold_at) - r.created_at)) / 60.0
    as minutes_to_first_signal,
  c.created_at,
  c.updated_at
from public.booking_candidates c
join public.booking_requests r
  on r.id = c.booking_request_id
 and r.tenant_id = c.tenant_id
left join preference_stats p
  on p.booking_candidate_id = c.id
left join confirmation_stats cf
  on cf.booking_candidate_id = c.id
left join hold_stats h
  on h.booking_candidate_id = c.id;

create or replace view public.ai_booking_outcome_tracking
with (security_invoker = true)
as
with candidate_stats as (
  select
    booking_request_id,
    count(*)::integer as candidate_count,
    max(score)::integer as best_score,
    avg(score)::numeric(8,2) as avg_score,
    min(created_at) as first_candidate_at,
    min(starts_at) as first_slot_at,
    count(*) filter (where status = 'confirmed')::integer as confirmed_candidate_count,
    count(*) filter (where status = 'expired')::integer as expired_candidate_count,
    count(*) filter (where status = 'rejected')::integer as rejected_candidate_count,
    avg(coalesce(route_travel_to_min, 0) + coalesce(route_travel_from_min, 0))::numeric(8,2)
      as avg_route_total_travel_min,
    avg(jsonb_array_length(warnings))::numeric(8,2) as avg_warning_count
  from public.booking_candidates
  group by booking_request_id
),
preference_stats as (
  select
    booking_request_id,
    count(*)::integer as preference_count,
    min(selected_at) as first_preference_at
  from public.booking_candidate_preferences
  group by booking_request_id
),
confirmation_stats as (
  select
    booking_request_id,
    count(*)::integer as confirmation_count,
    count(*) filter (where status = 'accepted')::integer as accepted_count,
    count(*) filter (where status = 'declined')::integer as declined_count,
    count(*) filter (where status = 'expired')::integer as confirmation_expired_count,
    max(responded_at) filter (where status = 'accepted') as accepted_at,
    max(responded_at) filter (where status = 'declined') as declined_at
  from public.booking_confirmations
  group by booking_request_id
),
hold_stats as (
  select
    booking_request_id,
    count(*)::integer as hold_count,
    count(*) filter (where status = 'confirmed')::integer as confirmed_hold_count,
    max(confirmed_at) as hold_confirmed_at
  from public.booking_holds
  group by booking_request_id
)
select
  r.tenant_id,
  r.branch_id,
  r.id as booking_request_id,
  r.source,
  r.requester_type,
  r.entity_type,
  r.status,
  r.lead_id,
  r.student_id,
  r.required_transmission,
  r.preferred_instructor_id,
  r.requested_duration_min,
  r.desired_start_date,
  r.confirmed_entity_type,
  r.confirmed_entity_id,
  l.converted_to_student_at as lead_converted_at,
  case
    when r.status = 'confirmed' or r.confirmed_entity_id is not null then 'confirmed'
    when r.status in ('cancelled', 'expired', 'failed', 'declined', 'superseded') then r.status
    when coalesce(c.candidate_count, 0) = 0 then 'no_candidates'
    when coalesce(p.preference_count, 0) > 0 then 'preference_selected'
    when coalesce(h.hold_count, 0) > 0 then 'hold_started'
    else r.status
  end as outcome,
  coalesce(c.candidate_count, 0) as candidate_count,
  c.best_score,
  c.avg_score,
  c.first_candidate_at,
  c.first_slot_at,
  coalesce(c.confirmed_candidate_count, 0) as confirmed_candidate_count,
  coalesce(c.expired_candidate_count, 0) as expired_candidate_count,
  coalesce(c.rejected_candidate_count, 0) as rejected_candidate_count,
  c.avg_route_total_travel_min,
  c.avg_warning_count,
  coalesce(p.preference_count, 0) as preference_count,
  p.first_preference_at,
  coalesce(cf.confirmation_count, 0) as confirmation_count,
  coalesce(cf.accepted_count, 0) as accepted_count,
  coalesce(cf.declined_count, 0) as declined_count,
  coalesce(cf.confirmation_expired_count, 0) as confirmation_expired_count,
  cf.accepted_at,
  cf.declined_at,
  coalesce(h.hold_count, 0) as hold_count,
  coalesce(h.confirmed_hold_count, 0) as confirmed_hold_count,
  h.hold_confirmed_at,
  extract(epoch from (coalesce(cf.accepted_at, h.hold_confirmed_at, r.updated_at) - r.created_at)) / 60.0
    as minutes_to_outcome,
  r.created_at,
  r.updated_at
from public.booking_requests r
left join public.leads l
  on l.id = r.lead_id
 and l.tenant_id = r.tenant_id
left join candidate_stats c
  on c.booking_request_id = r.id
left join preference_stats p
  on p.booking_request_id = r.id
left join confirmation_stats cf
  on cf.booking_request_id = r.id
left join hold_stats h
  on h.booking_request_id = r.id;

create or replace view public.ai_lesson_outcome_tracking
with (security_invoker = true)
as
select
  l.tenant_id,
  l.branch_id,
  l.id as lesson_id,
  l.student_id,
  l.instructor_id,
  l.status,
  l.starts_at,
  l.ends_at,
  l.duration_min,
  l.credits_cost,
  l.refunded_credits,
  l.cancelled_hours_before,
  l.location_lat is not null and l.location_lng is not null as has_location_coordinates,
  br.id as booking_request_id,
  br.source as booking_source,
  br.requester_type as booking_requester_type,
  case
    when l.status = 'completed' then 'completed'
    when l.status = 'no_show' then 'no_show'
    when l.status in ('cancelled_with_refund', 'cancelled_no_refund') then 'cancelled'
    when l.status = 'planned' and l.starts_at < now() then 'overdue_planned'
    else 'planned'
  end as lesson_outcome,
  case
    when l.status = 'no_show' then 1 else 0
  end as no_show_count,
  case
    when l.status in ('cancelled_with_refund', 'cancelled_no_refund') then 1 else 0
  end as cancellation_count,
  extract(epoch from (l.ends_at - l.starts_at)) / 60.0 as scheduled_minutes,
  l.created_at,
  l.updated_at
from public.lessons l
left join public.booking_requests br
  on br.tenant_id = l.tenant_id
 and br.confirmed_entity_type = 'lesson'
 and br.confirmed_entity_id = l.id;

create or replace view public.ai_planning_quality_daily
with (security_invoker = true)
as
with lesson_daily as (
  select
    tenant_id,
    branch_id,
    date_trunc('day', starts_at)::date as metric_date,
    count(*)::integer as lesson_count,
    count(*) filter (where status = 'completed')::integer as completed_count,
    count(*) filter (where status = 'no_show')::integer as no_show_count,
    count(*) filter (where status in ('cancelled_with_refund', 'cancelled_no_refund'))::integer
      as cancelled_count,
    avg(extract(epoch from (ends_at - starts_at)) / 60.0)::numeric(8,2)
      as avg_lesson_minutes
  from public.lessons
  group by tenant_id, branch_id, date_trunc('day', starts_at)::date
),
candidate_daily as (
  select
    tenant_id,
    branch_id,
    date_trunc('day', starts_at)::date as metric_date,
    count(*)::integer as candidate_count,
    avg(score)::numeric(8,2) as avg_candidate_score,
    avg(jsonb_array_length(warnings))::numeric(8,2) as avg_warning_count,
    avg(coalesce(route_travel_to_min, 0) + coalesce(route_travel_from_min, 0))::numeric(8,2)
      as avg_route_total_travel_min,
    count(*) filter (where status = 'confirmed')::integer as confirmed_candidate_count
  from public.booking_candidates
  group by tenant_id, branch_id, date_trunc('day', starts_at)::date
),
request_daily as (
  select
    tenant_id,
    branch_id,
    date_trunc('day', created_at)::date as metric_date,
    count(*)::integer as booking_request_count,
    count(*) filter (where status = 'confirmed')::integer as confirmed_request_count,
    count(*) filter (where status in ('failed', 'expired', 'declined'))::integer
      as failed_request_count
  from public.booking_requests
  group by tenant_id, branch_id, date_trunc('day', created_at)::date
),
keys as (
  select tenant_id, branch_id, metric_date from lesson_daily
  union
  select tenant_id, branch_id, metric_date from candidate_daily
  union
  select tenant_id, branch_id, metric_date from request_daily
)
select
  k.tenant_id,
  k.branch_id,
  k.metric_date,
  coalesce(l.lesson_count, 0) as lesson_count,
  coalesce(l.completed_count, 0) as completed_count,
  coalesce(l.no_show_count, 0) as no_show_count,
  coalesce(l.cancelled_count, 0) as cancelled_count,
  case when coalesce(l.lesson_count, 0) = 0
    then null
    else round((coalesce(l.no_show_count, 0)::numeric / l.lesson_count::numeric) * 100, 2)
  end as no_show_rate,
  case when coalesce(l.lesson_count, 0) = 0
    then null
    else round((coalesce(l.cancelled_count, 0)::numeric / l.lesson_count::numeric) * 100, 2)
  end as cancellation_rate,
  l.avg_lesson_minutes,
  coalesce(c.candidate_count, 0) as candidate_count,
  c.avg_candidate_score,
  c.avg_warning_count,
  c.avg_route_total_travel_min,
  coalesce(c.confirmed_candidate_count, 0) as confirmed_candidate_count,
  case when coalesce(c.candidate_count, 0) = 0
    then null
    else round((coalesce(c.confirmed_candidate_count, 0)::numeric / c.candidate_count::numeric) * 100, 2)
  end as candidate_conversion_rate,
  coalesce(r.booking_request_count, 0) as booking_request_count,
  coalesce(r.confirmed_request_count, 0) as confirmed_request_count,
  coalesce(r.failed_request_count, 0) as failed_request_count,
  case when coalesce(r.booking_request_count, 0) = 0
    then null
    else round((coalesce(r.confirmed_request_count, 0)::numeric / r.booking_request_count::numeric) * 100, 2)
  end as booking_conversion_rate
from keys k
left join lesson_daily l
  on l.tenant_id = k.tenant_id
 and l.branch_id is not distinct from k.branch_id
 and l.metric_date = k.metric_date
left join candidate_daily c
  on c.tenant_id = k.tenant_id
 and c.branch_id is not distinct from k.branch_id
 and c.metric_date = k.metric_date
left join request_daily r
  on r.tenant_id = k.tenant_id
 and r.branch_id is not distinct from k.branch_id
 and r.metric_date = k.metric_date;

grant select on public.ai_booking_score_history to authenticated, service_role;
grant select on public.ai_booking_outcome_tracking to authenticated, service_role;
grant select on public.ai_lesson_outcome_tracking to authenticated, service_role;
grant select on public.ai_planning_quality_daily to authenticated, service_role;

comment on view public.ai_booking_score_history is
  'AI-ready score history per generated booking candidate. No AI is executed; this view is deterministic analytics over existing booking data.';
comment on view public.ai_booking_outcome_tracking is
  'AI-ready outcome tracking per booking request, including conversion, response time and candidate counts.';
comment on view public.ai_lesson_outcome_tracking is
  'AI-ready lesson outcome tracking for completed, cancelled, no-show and overdue planned lessons.';
comment on view public.ai_planning_quality_daily is
  'AI-ready daily planning quality metrics: no-shows, cancellations, candidate quality, route efficiency and conversion rates.';
