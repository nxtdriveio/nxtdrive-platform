---
name: Lead funnel automation & idempotency
description: How the lead dashboard derives status/tasks from observable facts and stays idempotent
---

# Lead funnel automation

The lead dashboard EXTENDS existing leads / Kanban-tasks / lead_events — no new
persons/timeline/task tables. Status is a single forward-only funnel; auto-tasks
are reconciled, never blindly inserted.

## Forward-only status
- `lead_status` is one ordered funnel (`new`→…→`dropped`) with a RANK map.
- Automation only advances when `rank(observed fact) > rank(current)`.
- Observable facts drive it: intake submitted, trial offered/planned/confirmed,
  trial_completed (inferred: confirmed trial with `starts_at` in the past —
  `trial_lesson_status` has NO `completed` value).
- Placeholders (assessment/package/payment) are set MANUALLY and must never be
  auto-overridden by the engine.
- Terminal states: `converted`, `dropped`. Never auto-advance past terminal.

## Preserved states (reconcile must not clobber them)
- Preserved = terminal (`converted`/`dropped`) + the manual parking state
  `follow_up`. These have NO `STATUS_PLAN`.
- Trap: a status with no STATUS_PLAN previously fell back to `action_status='none'`
  and `next_action_at=null`, so any reconcile (e.g. the one fired right after
  `mark_lead_lost`, or a cron sweep) silently reopened a closed lead and wiped a
  parked follow-up. `follow_up` rank is LOW (1) so fact-derived status would also
  auto-advance it back into the funnel.
- Fix: for preserved states, pass NULL `action_status`/`priority` to
  `set_lead_automation_fields` (its COALESCE keeps the human value) and re-pass
  the EXISTING `next_action_at` (the RPC overwrites it unconditionally — null
  would clear it). Only the advisory score is refreshed. A due `follow_up`
  resurfaces purely via its now-past `next_action_at` in the "Vandaag" query — it
  is never auto-unparked into the funnel.

**Why:** reconcile runs from many hooks + the cron sweep; without the
preserved-state guard a single stale read corrupts closed/parked leads.

**Why:** a solo instructor's reality moves in one direction; bouncing status
backwards on a stale read would corrupt the funnel and the KPIs.

## Idempotent auto-tasks
- Auto-task identity is a per-lead-per-type dedupe key enforced by a PARTIAL
  unique index scoped to OPEN (non-archived) tasks. The ensure-task RPC returns
  the existing open task instead of inserting a duplicate; the complete-task RPC
  is a no-op on a second call (must not re-log events).
- Reconcile is therefore safe to run repeatedly from every funnel hook + the
  CRON sweep — that is the whole point of the dedupe key.

**Why:** every funnel hook + the CRON sweep can fire for the same lead; without
the open-scoped dedupe key the instructor's board floods with duplicates.

## How to apply
- Keep the score model PURE (input→{score,band,reasons}) so it stays templatable
  for the multi-instructor/franchise roadmap.
- All mutations are service-role RPCs (SECURITY DEFINER) with a nullable actor
  that, when present, is validated against tenant membership; anon AND
  authenticated execute are revoked, only service_role is granted.
- Terminal conversion (lead→student) must itself set the closed action state +
  clear next_action_at; relying on a later reconcile won't fix it because
  reconcile PRESERVES converted/dropped and never derives their action state.
