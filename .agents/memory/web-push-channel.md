---
name: Web push channel
description: How web push is layered onto the in-app notification channel (Task #110)
---

Web push is the SECOND delivery surface for an in-app notification, not an
independent channel.

**Rule:** push is fired from inside `dispatchInApp`, and ONLY when that call
actually created a NEW in-app row (`was_created === true`). A retried/duplicate
dispatch re-asserts the in-app row but must NOT re-push.

**Why:** idempotency is owned by the in-app layer's `UNIQUE(tenant_id,
dedupe_key)`. Gating push on `was_created` means we inherit that idempotency for
free and never double-send on retries — without any separate push-dedupe state.

**How to apply:** if you add a new notification type, just give it an in-app
copy (recipientUserId + title/body/link); web push follows automatically. Do
NOT add a parallel push call elsewhere in `dispatch.ts` — that would bypass the
idempotency gate.

Other invariants:
- Sender (`lib/notifications/web-push.ts`) NEVER throws and is a silent no-op
  when VAPID is unconfigured (no `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`). A push
  failure must never break the in-app row or the email.
- Dead endpoints (404/410 from the push service) are pruned via
  `prune_push_subscription` so a stale subscription never wedges future sends.
- `push_subscriptions` is keyed on a globally-unique `endpoint`;
  `upsert_push_subscription` re-points an endpoint to the current user on
  re-subscribe (handles account switch on the same device).
- Subscription writes go through service-role-only SECURITY DEFINER RPCs
  (anon+authenticated execute revoked); RLS exposes only the caller's own rows.
