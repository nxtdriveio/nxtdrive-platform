---
name: Notification dispatch idempotency
description: How NXTDRIVE notification sends stay exactly-once across retries.
---

The notification system enqueues a log row (idempotent on `UNIQUE(tenant_id, dedupe_key)`),
then sends via the provider, then records delivery status via `mark_notification_status`.

**Rule:** the status-write after a successful provider send must be checked. If it fails,
the dispatch must return a distinct `status_update_failed` outcome and log loudly — it must
NOT swallow the error and return success.

**Why:** if the provider send succeeds but the status write silently fails, the row stays
`queued`. A later retry re-enqueues the same dedupe_key, sees `queued` (not `sent`), and
sends again → duplicate email. The whole point of the dedupe_key is exactly-once.

**How to apply:** any code path that sends then records status (dispatch helpers in
`artifacts/nxtdrive/lib/notifications/`) must act on the status-write result. A `sent` email
with an unrecorded status is an at-risk-of-duplicate state requiring operator reconciliation,
not a silent success. The `mark_notification_status` RPC already refuses to overwrite a
terminal `sent` row.
