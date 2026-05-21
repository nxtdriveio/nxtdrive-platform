"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getPublicOrigin } from "@/lib/utils/public-origin";
import { getMollieApiKey } from "@/lib/mollie/secrets";
import { createPayment, MollieApiError } from "@/lib/mollie/client";
import type { Invoice } from "@/lib/invoices/types";

/**
 * Server action: create a Mollie payment for an OPEN invoice belonging to
 * the active tenant. Stores the resulting mollie_payment_id and checkout
 * URL on the invoice (via attach_mollie_payment_to_invoice RPC) and
 * redirects back to the invoice detail page.
 *
 * Re-using an existing checkout: if the invoice already has a
 * mollie_payment_id whose status is `open` (i.e. the student hasn't paid
 * yet), we keep that one rather than creating a duplicate.
 */
export async function createMolliePayment(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const invoiceId = String(formData.get("invoice_id") ?? "");
  if (!invoiceId) redirect("/backoffice/facturen");

  const service = createServiceRoleClient();

  const { data: invRaw, error: invErr } = await service
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (invErr || !invRaw) {
    redirect(`/backoffice/facturen/${invoiceId}?mollie_error=not_found`);
  }
  const invoice = invRaw as Invoice;
  if (invoice.status !== "open") {
    redirect(`/backoffice/facturen/${invoiceId}?mollie_error=not_open`);
  }
  if (invoice.total_cents <= 0) {
    redirect(`/backoffice/facturen/${invoiceId}?mollie_error=zero_amount`);
  }

  // Already have a usable checkout? Don't burn a new Mollie payment.
  if (
    invoice.mollie_payment_id &&
    invoice.mollie_checkout_url &&
    (invoice.mollie_status === "open" || invoice.mollie_status === "pending")
  ) {
    revalidatePath(`/backoffice/facturen/${invoiceId}`);
    redirect(`/backoffice/facturen/${invoiceId}?mollie=existing`);
  }

  let apiKey: string | null = null;
  try {
    apiKey = await getMollieApiKey(service, tenant.id);
  } catch {
    redirect(`/backoffice/facturen/${invoiceId}?mollie_error=key_decrypt_failed`);
  }
  if (!apiKey) {
    redirect(`/backoffice/facturen/${invoiceId}?mollie_error=no_api_key`);
  }

  const origin = await getPublicOrigin();
  const invoiceNoLabel = `Factuur #${String(invoice.invoice_no).padStart(4, "0")}`;

  let payment;
  try {
    payment = await createPayment({
      apiKey,
      amountCents: invoice.total_cents,
      currency: "EUR",
      description: invoiceNoLabel,
      redirectUrl: `${origin}/student/facturen/${invoice.id}?paid=1`,
      webhookUrl: `${origin}/api/webhooks/mollie/${tenant.id}`,
      metadata: {
        invoice_id: invoice.id,
        tenant_id: tenant.id,
        invoice_no: invoice.invoice_no,
      },
    });
  } catch (err) {
    if (err instanceof MollieApiError) {
      redirect(`/backoffice/facturen/${invoiceId}?mollie_error=api_${err.status}`);
    }
    redirect(`/backoffice/facturen/${invoiceId}?mollie_error=api_unknown`);
  }

  const checkoutUrl = payment._links?.checkout?.href ?? null;

  const { error: attachErr } = await service.rpc(
    "attach_mollie_payment_to_invoice",
    {
      p_invoice_id: invoice.id,
      p_tenant_id: tenant.id,
      p_actor: user.id,
      p_mollie_payment_id: payment.id,
      p_checkout_url: checkoutUrl,
      p_status: payment.status,
    },
  );
  if (attachErr) {
    redirect(`/backoffice/facturen/${invoiceId}?mollie_error=attach_failed`);
  }

  revalidatePath(`/backoffice/facturen/${invoiceId}`);
  revalidatePath(`/student/facturen/${invoiceId}`);
  redirect(`/backoffice/facturen/${invoiceId}?mollie=created`);
}
