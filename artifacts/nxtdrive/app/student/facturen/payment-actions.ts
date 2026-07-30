"use server";

import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getActiveStudent } from "@/lib/students/access";
import { createInvoiceCheckout } from "@/lib/mollie/invoice-checkout";
import type { Invoice } from "@/lib/invoices/types";

/**
 * Student self-service: pay an open invoice (including a single installment)
 * online via Mollie. Charges the remaining balance, creates the checkout and
 * redirects the student straight to Mollie's hosted payment page. The invoice
 * must belong to the active student (or a child the parent guards).
 */
export async function payStudentInvoice(formData: FormData) {
  const { user, tenant, roles } = await requireActiveTenant([
    "student",
    "parent",
  ]);
  const invoiceId = String(formData.get("invoice_id") ?? "").trim();
  if (!invoiceId) redirect("/leerling/betalingen");

  const { student, needsChildPicker } = await getActiveStudent(
    user,
    tenant.id,
    roles,
  );
  if (needsChildPicker) redirect("/leerling/kies-leerling");
  if (!student) redirect("/leerling/betalingen");

  const service = createServiceRoleClient();
  const { data: invRaw } = await service
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("tenant_id", tenant.id)
    .eq("student_id", student.id)
    .maybeSingle();
  if (!invRaw) redirect("/leerling/betalingen");
  const invoice = invRaw as Invoice;

  const result = await createInvoiceCheckout(service, {
    tenantId: tenant.id,
    actorId: user.id,
    invoice,
  });

  if (!result.ok || !result.checkoutUrl) {
    redirect(`/leerling/betalingen/facturen/${invoiceId}?pay_error=${result.ok ? "no_checkout" : result.error}`);
  }
  redirect(result.checkoutUrl);
}
