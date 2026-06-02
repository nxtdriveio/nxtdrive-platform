---
name: Refill invitation dup-check vs unique index
description: Why the refill invitation duplicate guard counts ALL pending rows, and the reinvite-lockout trade-off it creates.
---

# Refill (wachtlijst) invitation duplicate semantics

The `create_lesson_refill_invitation` duplicate guard must count **all**
`status='pending'` rows for the same (tenant, student, instructor, starts_at,
ends_at) — NOT just non-expired ones — because a partial unique index
(`uq_lesson_refill_inv_pending_per_block`, predicate `where status='pending'`)
already blocks any second pending row regardless of `expires_at`.

**Why:** if the guard filters `expires_at > now()` but the index does not, an
expired-but-still-pending row sails past the guard and then trips a raw
unique-violation on INSERT — an ugly, untranslated error. Matching the guard to
the index gives a friendly NL error instead.

**Trade-off (known, deferred):** an expired-pending row therefore blocks
re-inviting the same student to the same block until something transitions it
out of `pending`. The lazy-expiry path in `respond_*` cannot do this (it RAISEs,
which rolls back any status write). The fix is a background expiry sweep that
marks expired pending rows as `expired`. Until that runs, reinvite fails safe
with a clear message — no data corruption.

**How to apply:** any change to either the guard or the unique index must keep
the two in lockstep. Concurrent creates for one block are serialized with
`pg_advisory_xact_lock(hashtextextended(tenant:instructor:starts:ends, 0))` so
the dup-check and max-candidates count are race-safe.
