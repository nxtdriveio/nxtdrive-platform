import { NextResponse } from "next/server";
import { loadPortalContext } from "@/lib/parent-portal/context";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { loadEmailBranding } from "@/lib/notifications/branding";
import { generateInvoicePdf } from "@/lib/invoices/pdf";
import type { Invoice, InvoiceLine } from "@/lib/invoices/types";

export const dynamic = "force-dynamic";

/**
 * Parent-facing invoice PDF download. Authorization is layered:
 *   1. loadPortalContext resolves the parent's active child (guardian-linked,
 *      tenant-scoped) and enforces the facturen section being enabled.
 *   2. The invoice is read through the RLS-scoped client AND re-filtered to the
 *      exact tenant + child + non-draft, so a parent can only ever export their
 *      linked child's non-draft invoices.
 * The PDF is generated server-side and never includes internal fields
 * (e.g. invoice.notes).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const { invoiceId } = await params;
  const ctx = await loadPortalContext();

  if (!ctx.student || !ctx.visibility.facturen) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const [invoiceRes, linesRes] = await Promise.all([
    ctx.rls
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("tenant_id", ctx.tenant.id)
      .eq("student_id", ctx.student.id)
      .neq("status", "draft")
      .maybeSingle(),
    ctx.rls
      .from("invoice_lines")
      .select("*")
      .eq("invoice_id", invoiceId)
      .eq("tenant_id", ctx.tenant.id)
      .order("position", { ascending: true }),
  ]);

  if (invoiceRes.error || !invoiceRes.data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (linesRes.error) {
    return NextResponse.json({ error: "lines_failed" }, { status: 500 });
  }

  const invoice = invoiceRes.data as Invoice;
  const lines = (linesRes.data ?? []) as InvoiceLine[];

  // White-label branding (name/logo/colour). Read with the service role since
  // it encapsulates the white_label_enabled gate; it is tenant config, not
  // student data.
  const branding = await loadEmailBranding(
    createServiceRoleClient(),
    ctx.tenant.id,
  );

  const pdfBytes = await generateInvoicePdf({
    invoice,
    lines,
    branding: {
      tenantName: branding.tenantName,
      whiteLabelEnabled: branding.whiteLabelEnabled,
      logoUrl: branding.logoUrl,
      primaryColor: branding.primaryColor,
    },
  });

  const fileName = `factuur-${String(invoice.invoice_no).padStart(4, "0")}.pdf`;

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
