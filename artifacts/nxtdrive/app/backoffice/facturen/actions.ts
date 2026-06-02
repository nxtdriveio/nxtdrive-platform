"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  INVOICE_STATUSES,
  parseEurosToCents,
  type InvoiceStatus,
} from "@/lib/invoices/types";
import { notifyInvoicePaid } from "@/lib/notifications/dispatch";

function isValidStatus(s: string): s is InvoiceStatus {
  return (INVOICE_STATUSES as readonly string[]).includes(s);
}

/**
 * Create a new draft invoice for a student. Optionally seeds the first line —
 * either from a package (auto-fills description + unit price) or from a free
 * description + price.
 */
export async function createInvoice(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const studentId = String(formData.get("student_id") ?? "");
  const dueDateRaw = String(formData.get("due_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 2000);
  const packageId = String(formData.get("package_id") ?? "").trim();
  const lineDescription = String(formData.get("line_description") ?? "")
    .trim()
    .slice(0, 500);
  const lineUnitPriceEuros = String(formData.get("line_unit_price_euros") ?? "")
    .trim();
  const lineQuantityRaw = String(formData.get("line_quantity") ?? "1").trim();

  if (!studentId) redirect("/backoffice/facturen/nieuw");
  const dueDate = dueDateRaw ? dueDateRaw : null;

  const service = createServiceRoleClient();

  const { data: invoiceId, error } = await service.rpc("create_invoice", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_student_id: studentId,
    p_due_date: dueDate,
    p_notes: notes,
  });
  if (error || !invoiceId) {
    redirect("/backoffice/facturen/nieuw");
  }

  // Seed first line if either a package or a description+price was supplied.
  let seeded = false;

  if (packageId) {
    const { data: pack } = await service
      .from("packages")
      .select("id, name, price_cents")
      .eq("id", packageId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    if (pack) {
      await service.rpc("add_invoice_line", {
        p_invoice_id: invoiceId as string,
        p_tenant_id: tenant.id,
        p_actor: user.id,
        p_description: `Pakket: ${pack.name}`,
        p_quantity: 1,
        p_unit_price_cents: pack.price_cents,
        p_tax_rate_bp: 2100,
        p_related_package_id: pack.id,
      });
      seeded = true;
    }
  }

  if (!seeded && lineDescription && lineUnitPriceEuros) {
    const unitPriceCents = parseEurosToCents(lineUnitPriceEuros);
    const quantity = Number.parseFloat(lineQuantityRaw.replace(",", "."));
    if (
      unitPriceCents !== null &&
      Number.isFinite(quantity) &&
      quantity > 0
    ) {
      await service.rpc("add_invoice_line", {
        p_invoice_id: invoiceId as string,
        p_tenant_id: tenant.id,
        p_actor: user.id,
        p_description: lineDescription,
        p_quantity: quantity,
        p_unit_price_cents: unitPriceCents,
        p_tax_rate_bp: 2100,
        p_related_package_id: null,
      });
    }
  }

  revalidatePath("/backoffice/facturen");
  redirect(`/backoffice/facturen/${invoiceId}`);
}

export async function addInvoiceLine(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const invoiceId = String(formData.get("invoice_id") ?? "");
  const description = String(formData.get("description") ?? "")
    .trim()
    .slice(0, 500);
  const unitPriceEuros = String(formData.get("unit_price_euros") ?? "").trim();
  const quantityRaw = String(formData.get("quantity") ?? "1").trim();
  if (!invoiceId || !description) {
    redirect(`/backoffice/facturen/${invoiceId || ""}`);
  }
  const unitPriceCents = parseEurosToCents(unitPriceEuros);
  const quantity = Number.parseFloat(quantityRaw.replace(",", "."));
  if (
    unitPriceCents === null ||
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    redirect(`/backoffice/facturen/${invoiceId}`);
  }

  const service = createServiceRoleClient();
  await service.rpc("add_invoice_line", {
    p_invoice_id: invoiceId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_description: description,
    p_quantity: quantity,
    p_unit_price_cents: unitPriceCents,
    p_tax_rate_bp: 2100,
    p_related_package_id: null,
  });

  revalidatePath(`/backoffice/facturen/${invoiceId}`);
  redirect(`/backoffice/facturen/${invoiceId}`);
}

export async function removeInvoiceLine(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const invoiceId = String(formData.get("invoice_id") ?? "");
  const lineId = String(formData.get("line_id") ?? "");
  if (!invoiceId || !lineId) {
    redirect(`/backoffice/facturen/${invoiceId || ""}`);
  }

  const service = createServiceRoleClient();
  await service.rpc("remove_invoice_line", {
    p_line_id: lineId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
  });

  revalidatePath(`/backoffice/facturen/${invoiceId}`);
  redirect(`/backoffice/facturen/${invoiceId}`);
}

export async function updateInvoiceDraft(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const invoiceId = String(formData.get("invoice_id") ?? "");
  const dueDateRaw = String(formData.get("due_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 2000);
  if (!invoiceId) redirect("/backoffice/facturen");

  const service = createServiceRoleClient();
  await service.rpc("update_invoice_draft", {
    p_invoice_id: invoiceId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_due_date: dueDateRaw ? dueDateRaw : null,
    p_notes: notes,
  });

  revalidatePath(`/backoffice/facturen/${invoiceId}`);
  redirect(`/backoffice/facturen/${invoiceId}`);
}

/**
 * Create a termijnfactuur-schema: split a total across N open invoices, each
 * with its own number, due date and amount summing back to the total. The split
 * + audit trail live entirely in the create_installment_plan RPC (service role).
 */
export async function createInstallmentPlan(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const studentId = String(formData.get("student_id") ?? "").trim();
  const packageId = String(formData.get("package_id") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim().slice(0, 500);
  const totalEuros = String(formData.get("total_euros") ?? "").trim();
  const countRaw = String(formData.get("installment_count") ?? "").trim();
  const intervalRaw = String(formData.get("interval_days") ?? "30").trim();
  const firstDueRaw = String(formData.get("first_due_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 2000);

  if (!studentId) redirect("/backoffice/facturen/termijn");

  const totalCents = parseEurosToCents(totalEuros);
  const count = Number.parseInt(countRaw, 10);
  const interval = Number.parseInt(intervalRaw, 10);
  if (
    totalCents === null ||
    totalCents <= 0 ||
    !Number.isInteger(count) ||
    count < 2 ||
    count > 60
  ) {
    redirect("/backoffice/facturen/termijn?error=invalid");
  }

  const service = createServiceRoleClient();

  let resolvedDescription = description;
  let relatedPackageId: string | null = null;
  if (packageId) {
    const { data: pack } = await service
      .from("packages")
      .select("id, name")
      .eq("id", packageId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    if (pack) {
      relatedPackageId = pack.id as string;
      if (!resolvedDescription) {
        resolvedDescription = `Pakket: ${pack.name as string}`;
      }
    }
  }
  if (!resolvedDescription) {
    redirect("/backoffice/facturen/termijn?error=invalid");
  }

  const { error } = await service.rpc("create_installment_plan", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_student_id: studentId,
    p_total_cents: totalCents,
    p_installment_count: count,
    p_first_due_date: firstDueRaw ? firstDueRaw : null,
    p_interval_days: Number.isInteger(interval) ? interval : 30,
    p_description: resolvedDescription,
    p_tax_rate_bp: 2100,
    p_related_package_id: relatedPackageId,
    p_notes: notes,
  });
  if (error) {
    redirect(
      `/backoffice/facturen/termijn?error=${encodeURIComponent(error.message.slice(0, 200))}`,
    );
  }

  revalidatePath("/backoffice/facturen");
  redirect("/backoffice/facturen?termijn=created");
}

/**
 * Create a creditfactuur for an existing invoice: a negative mirror that
 * references the original, gets its own number and nets the open balance out.
 * All logic + guards live in the create_credit_note RPC (service role).
 */
export async function createCreditNote(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const invoiceId = String(formData.get("invoice_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 2000);
  if (!invoiceId) redirect("/backoffice/facturen");

  const service = createServiceRoleClient();
  const { data: creditId, error } = await service.rpc("create_credit_note", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_invoice_id: invoiceId,
    p_reason: reason,
  });
  if (error || !creditId) {
    redirect(
      `/backoffice/facturen/${invoiceId}?credit_error=${encodeURIComponent(
        (error?.message ?? "unknown").slice(0, 200),
      )}`,
    );
  }

  revalidatePath("/backoffice/facturen");
  revalidatePath(`/backoffice/facturen/${invoiceId}`);
  redirect(`/backoffice/facturen/${creditId as string}`);
}

export async function setInvoiceStatus(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const invoiceId = String(formData.get("invoice_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!invoiceId || !isValidStatus(status)) {
    redirect(`/backoffice/facturen/${invoiceId || ""}`);
  }

  const service = createServiceRoleClient();
  await service.rpc("set_invoice_status", {
    p_invoice_id: invoiceId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_status: status as InvoiceStatus,
  });

  // When an invoice is marked paid manually, send the same confirmation email
  // as the Mollie flow. Idempotent + best-effort; must run before redirect()
  // (which throws to perform the navigation).
  if (status === "paid") {
    try {
      await notifyInvoicePaid(service, tenant.id, invoiceId);
    } catch (err) {
      console.error("[facturen] notifyInvoicePaid failed", err);
    }
  }

  revalidatePath(`/backoffice/facturen/${invoiceId}`);
  revalidatePath("/backoffice/facturen");
  redirect(`/backoffice/facturen/${invoiceId}`);
}
