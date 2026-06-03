---
name: Partial payment / overpay invariants
description: Durable rules for the invoice payment ledger (partial pay, Mollie, overpay) so future money paths stay correct.
---

# Invoice payment ledger invariants

**One writer.** Every money change to an invoice goes through the
`record_invoice_payment` RPC, which writes the `payment_records` ledger row,
accumulates the cached `invoices.amount_paid_cents`, flips status when covered,
and audits. Nothing else may mutate `amount_paid_cents` directly — including the
manual "mark as paid" path (`set_invoice_status` delegates the remainder to it).
**Why:** the hard rule is "no balance mutation without a ledger entry + audit".

**Overpay is not impossible — don't trust the provider.** An invoice can carry
several Mollie links over its life, so two individually-valid provider payments
can cumulatively exceed the total. The guard must be provider-agnostic: the
cached balance is capped at the total for ALL providers (the ledger still holds
the true received amount). Manual overpay hard-raises (admin gets feedback);
provider overpay is recorded + flagged via an `invoice.overpayment_detected`
audit entry — never raised, because raising inside the webhook makes Mollie
retry forever while the money stays unrecorded.

**Record paid callbacks even when already paid.** A paid Mollie callback must
reach `record_invoice_payment` whether the invoice is `open` OR already `paid`
(late/stale second link). Recording-then-flagging is correct; skipping = real
money missing from the ledger.

**Checkout reuse is amount-aware.** Reuse an existing open/pending Mollie link
only for the same invoice AND same amount (`invoices.mollie_amount_cents`
persists the link's intended amount). A different amount always mints a fresh
link, so duplicate active links / double-charge can't happen from a re-clicked
pay action.
