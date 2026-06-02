import { type NextRequest } from "next/server";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  startOfDayUtc,
  addDays,
  amsterdamYmd,
  normalizeYmd,
} from "@/lib/dashboard/metrics";
import { defaultAccountingRange } from "@/lib/accounting/overview";
import { buildCsv, csvResponse, eurosNl } from "@/lib/accounting/csv";
import {
  DISPLAY_STATUS_LABEL,
  INVOICE_KIND_LABEL,
  displayStatus,
  type InvoiceKind,
  type InvoiceStatus,
} from "@/lib/invoices/types";
import type { Student } from "@/lib/students/types";

export const dynamic = "force-dynamic";

/** Factuurexport — all issued (non-draft) invoices in the selected period. */
export async function GET(request: NextRequest) {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);
  const supabase = await createServerSupabaseClient();

  const sp = request.nextUrl.searchParams;
  const fallback = defaultAccountingRange();
  const from = normalizeYmd(sp.get("from")) ?? fallback.from;
  const toRaw = normalizeYmd(sp.get("to")) ?? fallback.to;
  const to = toRaw < from ? from : toRaw;

  const rangeStart = startOfDayUtc(from).toISOString();
  const rangeEnd = startOfDayUtc(addDays(to, 1)).toISOString();

  const { data: invoices, error } = await supabase
    .from("invoices")
    .select(
      "invoice_no, kind, status, student_id, issued_at, due_date, subtotal_cents, tax_cents, total_cents, paid_at",
    )
    .eq("tenant_id", tenant.id)
    .neq("status", "draft")
    .gte("issued_at", rangeStart)
    .lt("issued_at", rangeEnd)
    .order("invoice_no", { ascending: true });
  if (error) {
    throw new Error(`factuurexport read failed: ${error.message}`);
  }

  const rows = invoices ?? [];
  const studentIds = Array.from(
    new Set(rows.map((r) => r.student_id as string)),
  );
  const nameMap = new Map<string, string>();
  if (studentIds.length > 0) {
    const { data: students, error: sErr } = await supabase
      .from("students")
      .select("id, full_name")
      .eq("tenant_id", tenant.id)
      .in("id", studentIds);
    if (sErr) throw new Error(`factuurexport students read failed: ${sErr.message}`);
    for (const s of (students ?? []) as Pick<Student, "id" | "full_name">[]) {
      nameMap.set(s.id, s.full_name);
    }
  }

  const header = [
    "Factuurnummer",
    "Soort",
    "Factuurdatum",
    "Vervaldatum",
    "Leerling",
    "Status",
    "Subtotaal (EUR)",
    "BTW (EUR)",
    "Totaal (EUR)",
    "Betaald op",
  ];
  const csvRows = rows.map((inv) => {
    const display = displayStatus({
      status: inv.status as InvoiceStatus,
      due_date: inv.due_date as string | null,
    });
    return [
      `#${String(inv.invoice_no).padStart(4, "0")}`,
      INVOICE_KIND_LABEL[(inv.kind as InvoiceKind) ?? "invoice"],
      inv.issued_at ? amsterdamYmd(new Date(inv.issued_at as string)) : "",
      (inv.due_date as string | null) ?? "",
      nameMap.get(inv.student_id as string) ?? "Onbekend",
      DISPLAY_STATUS_LABEL[display],
      eurosNl((inv.subtotal_cents as number | null) ?? 0),
      eurosNl((inv.tax_cents as number | null) ?? 0),
      eurosNl((inv.total_cents as number | null) ?? 0),
      inv.paid_at ? amsterdamYmd(new Date(inv.paid_at as string)) : "",
    ];
  });

  const csv = buildCsv(header, csvRows);
  return csvResponse(csv, `factuurexport_${from}_${to}.csv`);
}
