"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  INVOICE_STATUSES,
  parseEurosToCents,
  type Invoice,
  type InvoiceStatus,
} from "@/lib/invoices/types";
import {
  notifyInvoicePaid,
  notifyInvoiceCreated,
  notifyParentsInvoiceReady,
  notifyParentsInvoicePaid,
} from "@/lib/notifications/dispatch";

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

/**
 * Record a (partial or full) payment received outside Mollie — e.g. cash, a
 * bank transfer, or a manual correction. Writes a payment_records ledger row +
 * audit trail and accumulates the invoice balance; the invoice auto-flips to
 * paid (releasing any termijn-tegoed) once the total is covered. All logic +
 * guards live in record_invoice_payment (service role).
 */
export async function recordInvoicePayment(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const invoiceId = String(formData.get("invoice_id") ?? "").trim();
  const amountRaw = String(formData.get("amount_euros") ?? "").trim();
  const method = String(formData.get("method") ?? "manual")
    .trim()
    .slice(0, 40);
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000);
  if (!invoiceId) redirect("/backoffice/facturen");

  const amountCents = parseEurosToCents(amountRaw);
  if (amountCents === null || amountCents <= 0) {
    redirect(`/backoffice/facturen/${invoiceId}?pay_error=invalid_amount`);
  }

  const service = createServiceRoleClient();
  const { data: prId, error } = await service.rpc("record_invoice_payment", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_invoice_id: invoiceId,
    p_amount_cents: amountCents,
    p_method: method || "manual",
    p_provider: "manual",
    p_provider_payment_id: null,
    p_currency: "EUR",
    p_paid_at: new Date().toISOString(),
    p_note: note || null,
    p_raw_payload: null,
  });
  if (error || !prId) {
    redirect(
      `/backoffice/facturen/${invoiceId}?pay_error=${encodeURIComponent(
        (error?.message ?? "unknown").slice(0, 200),
      )}`,
    );
  }

  // If this payment fully settled the invoice, send the same confirmation as
  // the Mollie / manual-mark-paid flows. Best-effort + idempotent.
  const { data: invAfter } = await service
    .from("invoices")
    .select("status")
    .eq("id", invoiceId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if ((invAfter as Pick<Invoice, "status"> | null)?.status === "paid") {
    try {
      await notifyInvoicePaid(service, tenant.id, invoiceId);
    } catch (err) {
      console.error("[facturen] notifyInvoicePaid failed", err);
    }
    try {
      await notifyParentsInvoicePaid(service, tenant.id, invoiceId);
    } catch (err) {
      console.error("[facturen] notifyParentsInvoicePaid failed", err);
    }
  }

  revalidatePath(`/backoffice/facturen/${invoiceId}`);
  revalidatePath("/backoffice/facturen");
  redirect(`/backoffice/facturen/${invoiceId}?pay=recorded`);
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
    try {
      await notifyParentsInvoicePaid(service, tenant.id, invoiceId);
    } catch (err) {
      console.error("[facturen] notifyParentsInvoicePaid failed", err);
    }
  } else if (status === "open") {
    // Task #107 — meld de leerling dat een nieuwe factuur klaarstaat. Best-effort
    // + idempotent; termijnfacturen worden bewust overgeslagen (die lopen via de
    // installment_due cron) zodat het openen van een plan geen N mails oplevert.
    try {
      await notifyInvoiceCreated(service, tenant.id, invoiceId);
    } catch (err) {
      console.error("[facturen] notifyInvoiceCreated failed", err);
    }
    // Task #131 — meld ook de gekoppelde voogd(en) dat er een factuur voor hun
    // kind klaarstaat. Best-effort + idempotent per (factuur, voogd); respecteert
    // de per-school zichtbaarheid van de 'facturen'-sectie in het ouderportaal.
    try {
      await notifyParentsInvoiceReady(service, tenant.id, invoiceId);
    } catch (err) {
      console.error("[facturen] notifyParentsInvoiceReady failed", err);
    }
  }

  revalidatePath(`/backoffice/facturen/${invoiceId}`);
  revalidatePath("/backoffice/facturen");
  redirect(`/backoffice/facturen/${invoiceId}`);
}
