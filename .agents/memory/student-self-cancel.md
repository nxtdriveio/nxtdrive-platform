---
name: Student self-cancel lesson
description: Why student cancellation needs its own RPC separate from staff cancel_lesson
---

# Student self-cancellation

Students/guardians cannot reuse the existing `cancel_lesson` RPC: it authorizes
only staff (`_lesson_actor_authorized` = tenant_admin / instructor /
platform_admin). A dedicated `student_cancel_lesson(p_lesson_id, p_tenant_id,
p_actor, p_reason)` RPC handles the student/guardian path: it authorizes the
caller as owner/guardian of the lesson's student, enforces the tenant
`cancellation_policy` min-notice gate, applies the policy refund tier, and writes
both the credit ledger entry and the audit row. Service-role only (revoke execute
from anon AND authenticated).

**Why:** mixing student auth into the staff RPC would widen its authorization
surface; the refund/min-notice policy is tenant-configurable and must be applied
server-side, never trusted from the client.

**How to apply:** the lesson-detail page computes a refund *preview* by mirroring
`refundPctForHours(policy, hoursBefore)` for display only — the RPC re-derives and
remains the source of truth. Only show the cancel UI for `status==='planned'` and
a future `starts_at`.

**Future-only invariant (critical):** status='planned' + min-notice is NOT enough.
A policy with `min_notice_hours = 0` would otherwise let a still-'planned' lesson be
cancelled *after* its start time and pay a refund from the `hours_before=0` tier — a
business-rule bypass / credit-fraud vector. The RPC must hard-fail when
`starts_at <= now()` independent of policy; the server action mirrors it for a
friendly message. Enforced in migration 0078 (forward migration over 0077).
