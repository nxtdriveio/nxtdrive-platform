"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  loadInvoiceForAccess,
  requireInvoiceBackofficeManageAccess,
} from "@/lib/invoices/access";
import { createInvoiceCheckout } from "@/lib/mollie/invoice-checkout";
import { parseEurosToCents } from "@/lib/invoices/types";

/**
 * Server action: create a Mollie payment for an OPEN invoice belonging to
 * the active tenant and branch scope. By default it charges the remaining
 * balance; an optional `amount_euros` lets the admin request a partial Mollie
 * payment. Stores the resulting mollie_payment_id + checkout URL on the invoice
 * and redirects back to the invoice detail page.
 */
export async function createMolliePayment(formData: FormData) {
  const access = await requireInvoiceBackofficeManageAccess();
  const { context, service } = access;
  const tenant = context.organization;
  const user = context.user;

  const invoiceId = String(formData.get("invoice_id") ?? "");
  if (!invoiceId) redirect("/backoffice/facturen");

  const amountRaw = String(formData.get("amount_euros") ?? "").trim();
  let amountCents: number | undefined;
  if (amountRaw) {
    const parsed = parseEurosToCents(amountRaw);
    if (parsed === null || parsed <= 0) {
      redirect(`/backoffice/facturen/${invoiceId}?mollie_error=zero_amount`);
    }
    amountCents = parsed;
  }

  const invoice = await loadInvoiceForAccess(access, invoiceId);
  if (!invoice) {
    redirect(`/backoffice/facturen/${invoiceId}?mollie_error=not_found`);
  }

  const result = await createInvoiceCheckout(service, {
    tenantId: tenant.id,
    actorId: user.id,
    invoice,
    amountCents,
  });

  revalidatePath(`/backoffice/facturen/${invoiceId}`);
  revalidatePath(`/leerling/betalingen/facturen/${invoiceId}`);
  if (!result.ok) {
    redirect(`/backoffice/facturen/${invoiceId}?mollie_error=${result.error}`);
  }
  redirect(
    `/backoffice/facturen/${invoiceId}?mollie=${result.reused ? "existing" : "created"}`,
  );
}
