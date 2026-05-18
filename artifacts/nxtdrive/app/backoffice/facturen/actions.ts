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

  revalidatePath(`/backoffice/facturen/${invoiceId}`);
  revalidatePath("/backoffice/facturen");
  redirect(`/backoffice/facturen/${invoiceId}`);
}
