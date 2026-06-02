---
name: Tegoed breakdown buckets
description: How the student_credit_breakdown view splits tegoed and why available == ledger balance.
---

# Tegoed breakdown (Module 5)

`student_credit_breakdown` is a security_invoker view, the source of truth for the hour-based
tegoed split. Scheduling a lesson immediately books `-credits_cost` in `credit_ledger`
(reason `lesson_consumed`), so "gereden vs ingepland" is NOT a double booking — it is derived
by joining each `lesson_consumed` ledger row to `lessons.status` (planned => ingepland,
anything else => gereden).

Bucket partition of every ledger reason exactly once:
- gekocht (purchased_minutes) = sum(delta) where reason in (package_purchase, package_refund, opening_balance)
- gereden / ingepland = -delta of lesson_consumed rows, split by joined lesson status
- teruggegeven (refunded) = sum(delta) where reason = lesson_refund
- correcties (adjustment) = sum(delta) where reason = adjustment
- verlopen (expired) = -sum(delta) where reason = credit_expired
- available = sum(all delta) == ledger balance (the invariant the test asserts)

withheld/ingehouden is INFORMATIONAL only, computed from the lessons table
(no_show/cancelled_no_refund => credits_cost; cancelled_with_refund => credits_cost - refunded_credits).
It is not part of the available identity.

**Why:** canon example 20 gekocht / 12 gereden / 3 ingepland / 5 beschikbaar reconciles as
balance = purchased − driven − planned. Keeping available == sum(ledger.delta) means the ledger
stays the single financial truth and the view never invents numbers.

**How to apply:** any new credit_reason must be assigned to exactly one bucket in the view or
the available identity breaks. Add it to the right `filter(...)` and re-run db:test-rls-products.

## Package threshold signal (FIFO attribution)

The "tegoed bijna op" follow-up signal must allocate a student's lifetime consumption FIFO
across their package grants (oldest grant first), then fire per grant when the minutes drawn
from THAT lot reach the package's signal_threshold_minutes. Do NOT sum all consumption since
each grant's timestamp — with multiple/overlapping grants that mis-attributes one grant's usage
to another (a later grant fires on minutes that actually belong to an earlier grant).

**Why:** a student can hold several package grants; consumption is a single pool drawn oldest-
first (same model as expire_student_credits), so the signal must mirror that allocation.

**How to apply:** the logic lives in the ensure_package_signals service-role RPC (per tenant),
deduped per grant ledger id, fires once ever (existence check ignores archived tasks). The cron
route only loops tenants and calls the RPC. Multi-grant attribution is covered by
db:test-rls-products section 5c.
