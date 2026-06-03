---
name: credit_low top-up-epoch dedupe re-arm
description: How the low-credit email re-arms itself across package top-ups without extra state.
---

The `credit_low` notification (lestegoed bijna op) uses a dedupe key of the form
`credit_low:student:{id}:topups:{epoch}` where `epoch` = the COUNT of positive
`credit_ledger.delta` rows for that student (purchases/refunds/openings).

**Why:** the notification must fire exactly once per "low spell", but must be able
to fire again after the student buys a new package and later dips low again. A
stable per-student key would only ever send once; a time-based key could spam.
Tying the epoch to the number of top-ups means every new top-up advances the
epoch, so the next dip below threshold produces a fresh dedupe key → exactly one
new mail, with zero extra tracking state.

**How to apply:** the cron (`/api/jobs/credit-low`) computes `topupEpoch` per
low-balance student via a `count` query on `credit_ledger` filtered to `delta > 0`,
and passes it to `notifyCreditLow`. If you add new positive-delta ledger reasons,
they will (correctly) count toward the epoch. Threshold + enable flag are
tenant-configurable via `tenant_settings` key `low_credit`.
