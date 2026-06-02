---
name: Intake attention-points → backoffice tasks
description: Why intake aandachtspunt tasks use task_type='manual', and how routing + idempotency are wired.
---

# Intake aandachtspunt → task (lead-detail intake-analyse block)

One-click conversion of an intake attention point into a Kanban task lives in
`ensure_lead_intake_task` (RPC, service_role only) + server action
`createTasksFromIntakePoints` + client `intake-task-buttons.tsx`.

## Decisions (non-obvious)

- **task_type = 'manual' on purpose.** These are instructor-initiated reminders,
  not funnel-stage auto-tasks. The lead automation stale-sweep
  (`completeStaleAutoTasks`) only archives lead-linked tasks where
  `task_type != 'manual'`, so any non-manual type would get silently archived
  when the lead advances. `'manual'` makes them persistent.
  **Why:** a "theorie herinneren" task must survive the lead moving stages.

- **Idempotency = `dedupe_key` `lead:{leadId}:intake:{code}`** + the partial
  unique index from 0040 (`(tenant_id, dedupe_key) where dedupe_key is not null
  and archived_at is null`). The RPC does select-then-return; a concurrent insert
  surfaces as Postgres `23505`, which the server action treats as "already open".

- **Routing.** `ensure_lead_intake_task` calls `resolve_task_assignment(title)`
  and lands the task on that department's board (first column); falls back to the
  first non-archived board when no keyword rule matches. So titles deliberately
  carry the domain keyword (e.g. "CBR-machtiging regelen: <name>") — the
  per-code title/description/priority map lives in `lib/leads/intake-analysis.ts`
  (`intakeAttentionTask`, fallback to the point's own label for unknown codes).

- **Server-side re-derivation.** The action recomputes/reads the attention points
  from the lead's intake (stored analysis, else `analyzeIntake`) and only acts on
  requested codes that genuinely apply — never trusts client-supplied titles.

## Gotcha when testing against staging

`lead_events` and `audit_log` are insert-only (triggers `*_block_mutation`).
A smoke test cannot DELETE from them — only clean up `tasks` / `task_links`.
