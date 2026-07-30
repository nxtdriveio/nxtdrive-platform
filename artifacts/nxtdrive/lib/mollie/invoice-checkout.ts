/**
 * Server-only helper to create (or re-use) a Mollie checkout for an invoice.
 *
 * Shared by the backoffice action (admin generates a payment link) and the
 * student self-service action (a student pays an open installment online).
 *
 * Partial payments: the amount defaults to the remaining balance
 * (total_cents − amount_paid_cents) but a smaller amount can be passed to let
 * a payer settle part of an invoice now. The resulting Mollie payment id +
 * checkout URL are stored on the invoice via attach_mollie_payment_to_invoice.
 *
 * Returns a coded result instead of throwing, so callers can map errors to
 * redirect query params. The Mollie API key is read per-tenant (encrypted at
 * rest) and never leaves the server.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicOrigin } from "@/lib/utils/public-origin";
import { getMollieApiKey } from "@/lib/mollie/secrets";
import { createPayment, MollieApiError } from "@/lib/mollie/client";
import { remainingCents, type Invoice } from "@/lib/invoices/types";

export type InvoiceCheckoutResult =
  | { ok: true; checkoutUrl: string | null; reused: boolean }
  | { ok: false; error: string };

export async function createInvoiceCheckout(
  service: SupabaseClient,
  params: {
    tenantId: string;
    actorId: string;
    invoice: Invoice;
    /** Amount to charge in cents. Defaults to the remaining balance. */
    amountCents?: number;
    /** Portal path Mollie should return to after payment. */
    returnPath?: string;
  },
): Promise<InvoiceCheckoutResult> {
  const { tenantId, actorId, invoice } = params;

  if (invoice.kind !== "invoice") return { ok: false, error: "not_invoice" };
  if (invoice.status !== "open") return { ok: false, error: "not_open" };

  const remaining = remainingCents(invoice);
  if (remaining <= 0) return { ok: false, error: "already_paid" };

  const amountCents = params.amountCents ?? remaining;
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { ok: false, error: "zero_amount" };
  }
  if (amountCents > remaining) return { ok: false, error: "amount_too_high" };

  // Re-use the currently-attached checkout link only when it is still
  // open/pending AND was created for exactly this amount — avoiding duplicate
  // active links (and the resulting double-charge / overpay risk) when the same
  // pay action is triggered more than once. A different amount (e.g. a partial
  // payment landed in between, shrinking the remaining) always gets a fresh link.
  const returnPath = params.returnPath ?? `/leerling/betalingen/facturen/${invoice.id}`;

  if (
    invoice.mollie_payment_id &&
    invoice.mollie_checkout_url &&
    invoice.mollie_amount_cents === amountCents &&
    (invoice.mollie_status === "open" || invoice.mollie_status === "pending")
  ) {
    return { ok: true, checkoutUrl: invoice.mollie_checkout_url, reused: true };
  }

  let apiKey: string | null = null;
  try {
    apiKey = await getMollieApiKey(service, tenantId);
  } catch {
    return { ok: false, error: "key_decrypt_failed" };
  }
  if (!apiKey) return { ok: false, error: "no_api_key" };

  const origin = await getPublicOrigin();
  const invoiceNoLabel = `Factuur #${String(invoice.invoice_no).padStart(4, "0")}`;
  const description =
    amountCents < invoice.total_cents
      ? `${invoiceNoLabel} (deelbetaling)`
      : invoiceNoLabel;

  let payment;
  try {
    payment = await createPayment({
      apiKey,
      amountCents,
      currency: "EUR",
      description,
      redirectUrl: `${origin}${returnPath}?paid=1`,
      webhookUrl: `${origin}/api/webhooks/mollie/${tenantId}`,
      metadata: {
        invoice_id: invoice.id,
        tenant_id: tenantId,
        invoice_no: invoice.invoice_no,
      },
    });
  } catch (err) {
    if (err instanceof MollieApiError) {
      return { ok: false, error: `api_${err.status}` };
    }
    return { ok: false, error: "api_unknown" };
  }

  const checkoutUrl = payment._links?.checkout?.href ?? null;

  const { error: attachErr } = await service.rpc(
    "attach_mollie_payment_to_invoice",
    {
      p_invoice_id: invoice.id,
      p_tenant_id: tenantId,
      p_actor: actorId,
      p_mollie_payment_id: payment.id,
      p_checkout_url: checkoutUrl,
      p_status: payment.status,
      p_amount_cents: amountCents,
    },
  );
  if (attachErr) return { ok: false, error: "attach_failed" };

  return { ok: true, checkoutUrl, reused: false };
}
