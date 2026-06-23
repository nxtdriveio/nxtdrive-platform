"use server";

import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { createInvoiceCheckout } from "@/lib/mollie/invoice-checkout";
import { loadPortalContext } from "@/lib/parent-portal/context";
import type { Invoice } from "@/lib/invoices/types";

export async function payParentInvoice(formData: FormData) {
  const invoiceId = String(formData.get("invoice_id") ?? "").trim();
  if (!invoiceId) redirect("/ouder/facturen");

  const ctx = await loadPortalContext();
  if (!ctx.student || !ctx.visibility.facturen) redirect("/ouder/facturen");

  const service = createServiceRoleClient();
  const { data: invRaw } = await service
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("tenant_id", ctx.tenant.id)
    .eq("student_id", ctx.student.id)
    .neq("status", "draft")
    .maybeSingle();

  if (!invRaw) redirect("/ouder/facturen");

  const invoice = invRaw as Invoice;
  const result = await createInvoiceCheckout(service, {
    tenantId: ctx.tenant.id,
    actorId: ctx.user.id,
    invoice,
    returnPath: `/ouder/facturen/${invoice.id}`,
  });

  if (!result.ok || !result.checkoutUrl) {
    redirect(
      `/ouder/facturen/${invoiceId}?pay_error=${result.ok ? "no_checkout" : result.error}`,
    );
  }

  redirect(result.checkoutUrl);
}
