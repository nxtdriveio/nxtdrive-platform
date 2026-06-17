import { NextResponse, type NextRequest } from "next/server";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAdvancedReportExportAccess } from "@/lib/platform/commercial-access";
import {
  getReport,
  defaultReportRange,
  normalizeYmd,
} from "@/lib/dashboard/metrics";

export const dynamic = "force-dynamic";

function eurosNl(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function csvField(value: string): string {
  if (/[";\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(request: NextRequest) {
  const { tenant } = await requireActiveTenant(["tenant_admin", "instructor"]);
  const blocked = await requireAdvancedReportExportAccess(tenant.id);
  if (blocked) return blocked;

  const supabase = await createServerSupabaseClient();

  const sp = request.nextUrl.searchParams;
  const fallback = defaultReportRange();
  const from = normalizeYmd(sp.get("from")) ?? fallback.from;
  const toRaw = normalizeYmd(sp.get("to")) ?? fallback.to;
  const to = toRaw < from ? from : toRaw;

  const report = await getReport(supabase, tenant.id, from, to);

  const header = ["Datum", "Lessen gegeven", "Omzet (EUR)", "Nieuwe leads"];
  const lines = [header.join(";")];
  for (const row of report.rows) {
    lines.push(
      [
        row.date,
        String(row.lessonsGiven),
        eurosNl(row.revenueCents),
        String(row.newLeads),
      ]
        .map(csvField)
        .join(";"),
    );
  }
  lines.push(
    [
      "Totaal",
      String(report.totals.lessonsGiven),
      eurosNl(report.totals.revenueCents),
      String(report.totals.newLeads),
    ]
      .map(csvField)
      .join(";"),
  );

  // BOM so Excel (NL locale) detects UTF-8 correctly.
  const csv = "\uFEFF" + lines.join("\r\n");
  const filename = `rapportage_${from}_${to}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
