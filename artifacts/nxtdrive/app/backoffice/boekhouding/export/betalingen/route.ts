import { type NextRequest } from "next/server";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAdvancedReportExportAccess } from "@/lib/platform/commercial-access";
import {
  startOfDayUtc,
  addDays,
  amsterdamYmd,
  normalizeYmd,
} from "@/lib/dashboard/metrics";
import { defaultAccountingRange } from "@/lib/accounting/overview";
import { buildCsv, csvResponse, eurosNl } from "@/lib/accounting/csv";
import type { Student } from "@/lib/students/types";

export const dynamic = "force-dynamic";

/**
 * Betalingenexport — payments recorded in the period. A payment is a paid
 * invoice (date = paid_at); this captures both manually-marked and Mollie
 * payments. Method/provider is enriched from the linked payment record where
 * one exists, otherwise the payment is reported as handmatig (manual).
 */
export async function GET(request: NextRequest) {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);
  const blocked = await requireAdvancedReportExportAccess(tenant.id);
  if (blocked) return blocked;

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
    .select("invoice_no, student_id, total_cents, paid_at, payment_record_id")
    .eq("tenant_id", tenant.id)
    .eq("status", "paid")
    .gte("paid_at", rangeStart)
    .lt("paid_at", rangeEnd)
    .order("paid_at", { ascending: true });
  if (error) {
    throw new Error(`betalingenexport read failed: ${error.message}`);
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
    if (sErr) {
      throw new Error(`betalingenexport students read failed: ${sErr.message}`);
    }
    for (const s of (students ?? []) as Pick<Student, "id" | "full_name">[]) {
      nameMap.set(s.id, s.full_name);
    }
  }

  const recordIds = Array.from(
    new Set(
      rows
        .map((r) => r.payment_record_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const recordMap = new Map<
    string,
    { provider: string | null; method: string | null }
  >();
  if (recordIds.length > 0) {
    const { data: records, error: rErr } = await supabase
      .from("payment_records")
      .select("id, provider, method")
      .eq("tenant_id", tenant.id)
      .in("id", recordIds);
    if (rErr) {
      throw new Error(`betalingenexport records read failed: ${rErr.message}`);
    }
    for (const r of records ?? []) {
      recordMap.set(r.id as string, {
        provider: (r.provider as string | null) ?? null,
        method: (r.method as string | null) ?? null,
      });
    }
  }

  const header = [
    "Betaaldatum",
    "Factuurnummer",
    "Leerling",
    "Bedrag (EUR)",
    "Methode",
    "Provider",
    "Status",
  ];
  const csvRows = rows.map((inv) => {
    const recordId = inv.payment_record_id as string | null;
    const record = recordId ? recordMap.get(recordId) : undefined;
    return [
      inv.paid_at ? amsterdamYmd(new Date(inv.paid_at as string)) : "",
      `#${String(inv.invoice_no).padStart(4, "0")}`,
      nameMap.get(inv.student_id as string) ?? "Onbekend",
      eurosNl((inv.total_cents as number | null) ?? 0),
      record?.method ?? "Handmatig",
      record?.provider ?? "—",
      "Betaald",
    ];
  });

  const csv = buildCsv(header, csvRows);
  return csvResponse(csv, `betalingenexport_${from}_${to}.csv`);
}
