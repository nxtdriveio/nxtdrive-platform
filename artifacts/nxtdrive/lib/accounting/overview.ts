import type { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  amsterdamYmd,
  startOfDayUtc,
  addDays,
  firstOfNextMonth,
} from "@/lib/dashboard/metrics";
import { displayStatus, type DisplayStatus } from "@/lib/invoices/types";

type SupabaseServerClient = Awaited<
  ReturnType<typeof createServerSupabaseClient>
>;

/** Month bucket key, e.g. "2026-03". */
export type MonthSummary = {
  month: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  outstandingCents: number;
};

export type VatRateBucket = {
  rateBp: number;
  baseCents: number;
  vatCents: number;
  grossCents: number;
};

export type OutstandingInvoice = {
  id: string;
  invoiceNo: number;
  kind: string;
  studentName: string;
  issuedAt: string | null;
  dueDate: string | null;
  daysOverdue: number;
  totalCents: number;
  display: DisplayStatus;
};

export type AccountingOverview = {
  from: string;
  to: string;
  monthly: MonthSummary[];
  revenueTotals: { subtotalCents: number; taxCents: number; totalCents: number };
  vatByRate: VatRateBucket[];
  vatTotals: { baseCents: number; vatCents: number; grossCents: number };
  outstanding: OutstandingInvoice[];
  outstandingTotalCents: number;
};

/** Default accounting range: Jan 1 of the current year → today (Amsterdam). */
export function defaultAccountingRange(): { from: string; to: string } {
  const today = amsterdamYmd(new Date());
  return { from: `${today.slice(0, 4)}-01-01`, to: today };
}

/** Inclusive list of "YYYY-MM" month keys spanning [fromYmd, toYmd]. */
function monthKeysInRange(fromYmd: string, toYmd: string): string[] {
  const keys: string[] = [];
  let cursor = `${fromYmd.slice(0, 7)}-01`;
  const last = toYmd.slice(0, 7);
  // Guard against pathological inputs: a 12-month/year span is bounded anyway,
  // but cap the loop defensively.
  for (let i = 0; i < 1200; i += 1) {
    const key = cursor.slice(0, 7);
    keys.push(key);
    if (key >= last) break;
    cursor = firstOfNextMonth(cursor);
  }
  return keys;
}

/** Whole days `due` is in the past relative to `todayYmd` (0 when not overdue). */
function daysOverdue(dueDate: string | null, todayYmd: string): number {
  if (!dueDate) return 0;
  const due = new Date(`${dueDate}T00:00:00Z`).getTime();
  const today = new Date(`${todayYmd}T00:00:00Z`).getTime();
  const diff = Math.floor((today - due) / 86_400_000);
  return diff > 0 ? diff : 0;
}

/**
 * Read-only, tenant-scoped accounting aggregation over an inclusive [from, to]
 * date range. Every query is filtered by `tenantId` and runs under the caller's
 * session, so Supabase RLS provides defence-in-depth. Mirrors the existing
 * reporting figure: revenue is taken strictly from paid invoices (credit notes
 * carry negative amounts, so they net the originals out automatically).
 *
 * Fails loud on any read error — never falls back to fabricated zeros.
 */
export async function getAccountingOverview(
  supabase: SupabaseServerClient,
  tenantId: string,
  fromYmd: string,
  toYmd: string,
): Promise<AccountingOverview> {
  const rangeStart = startOfDayUtc(fromYmd).toISOString();
  const rangeEnd = startOfDayUtc(addDays(toYmd, 1)).toISOString();
  const todayYmd = amsterdamYmd(new Date());

  // Paid invoices (revenue), open invoices (outstanding).
  const [paidRes, openRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, kind, subtotal_cents, tax_cents, total_cents, paid_at")
      .eq("tenant_id", tenantId)
      .eq("status", "paid")
      .gte("paid_at", rangeStart)
      .lt("paid_at", rangeEnd),
    supabase
      .from("invoices")
      .select(
        "id, invoice_no, kind, student_id, issued_at, due_date, total_cents",
      )
      .eq("tenant_id", tenantId)
      .eq("status", "open")
      .order("due_date", { ascending: true, nullsFirst: false }),
  ]);

  if (paidRes.error) {
    throw new Error(`accounting: paid invoices read failed: ${paidRes.error.message}`);
  }
  if (openRes.error) {
    throw new Error(`accounting: open invoices read failed: ${openRes.error.message}`);
  }

  const paid = paidRes.data ?? [];
  const open = openRes.data ?? [];

  // VAT split: line-level tax for the paid invoices in range, grouped by rate.
  const paidIds = paid.map((p) => p.id as string);
  let lines: {
    tax_rate_bp: number;
    amount_cents: number;
    tax_amount_cents: number;
  }[] = [];
  if (paidIds.length > 0) {
    const linesRes = await supabase
      .from("invoice_lines")
      .select("tax_rate_bp, amount_cents, tax_amount_cents")
      .eq("tenant_id", tenantId)
      .in("invoice_id", paidIds);
    if (linesRes.error) {
      throw new Error(
        `accounting: invoice lines read failed: ${linesRes.error.message}`,
      );
    }
    lines = (linesRes.data ?? []) as typeof lines;
  }

  // Student names for the outstanding list.
  const studentIds = Array.from(
    new Set(open.map((o) => o.student_id as string)),
  );
  const nameMap = new Map<string, string>();
  if (studentIds.length > 0) {
    const studentsRes = await supabase
      .from("students")
      .select("id, full_name")
      .eq("tenant_id", tenantId)
      .in("id", studentIds);
    if (studentsRes.error) {
      throw new Error(
        `accounting: students read failed: ${studentsRes.error.message}`,
      );
    }
    for (const s of studentsRes.data ?? []) {
      nameMap.set(s.id as string, s.full_name as string);
    }
  }

  // ---- Monthly summary (revenue paid in month + outstanding issued in month).
  const months = new Map<string, MonthSummary>();
  for (const key of monthKeysInRange(fromYmd, toYmd)) {
    months.set(key, {
      month: key,
      subtotalCents: 0,
      taxCents: 0,
      totalCents: 0,
      outstandingCents: 0,
    });
  }

  let revSubtotal = 0;
  let revTax = 0;
  let revTotal = 0;
  for (const inv of paid) {
    const paidAt = inv.paid_at as string | null;
    if (!paidAt) continue;
    const key = amsterdamYmd(new Date(paidAt)).slice(0, 7);
    const bucket = months.get(key);
    const sub = (inv.subtotal_cents as number | null) ?? 0;
    const tax = (inv.tax_cents as number | null) ?? 0;
    const tot = (inv.total_cents as number | null) ?? 0;
    revSubtotal += sub;
    revTax += tax;
    revTotal += tot;
    if (bucket) {
      bucket.subtotalCents += sub;
      bucket.taxCents += tax;
      bucket.totalCents += tot;
    }
  }

  // ---- Outstanding posten (point-in-time list of open + overdue invoices).
  const outstanding: OutstandingInvoice[] = [];
  let outstandingTotalCents = 0;
  for (const inv of open) {
    const total = (inv.total_cents as number | null) ?? 0;
    const issuedAt = (inv.issued_at as string | null) ?? null;
    const dueDate = (inv.due_date as string | null) ?? null;
    outstandingTotalCents += total;
    outstanding.push({
      id: inv.id as string,
      invoiceNo: inv.invoice_no as number,
      kind: (inv.kind as string) ?? "invoice",
      studentName: nameMap.get(inv.student_id as string) ?? "Onbekend",
      issuedAt,
      dueDate,
      daysOverdue: daysOverdue(dueDate, todayYmd),
      totalCents: total,
      display: displayStatus({ status: "open", due_date: dueDate }),
    });
    // Attribute outstanding to the month it was issued in (falls back to its
    // due date when an issue date is somehow absent).
    const attrib = issuedAt
      ? amsterdamYmd(new Date(issuedAt)).slice(0, 7)
      : dueDate
        ? dueDate.slice(0, 7)
        : null;
    if (attrib) {
      const bucket = months.get(attrib);
      if (bucket) bucket.outstandingCents += total;
    }
  }

  // ---- VAT by rate.
  const vatMap = new Map<number, VatRateBucket>();
  let vatBase = 0;
  let vatAmt = 0;
  let vatGross = 0;
  for (const line of lines) {
    const rate = (line.tax_rate_bp as number | null) ?? 0;
    const base = (line.amount_cents as number | null) ?? 0;
    const vat = (line.tax_amount_cents as number | null) ?? 0;
    vatBase += base;
    vatAmt += vat;
    vatGross += base + vat;
    const bucket = vatMap.get(rate) ?? {
      rateBp: rate,
      baseCents: 0,
      vatCents: 0,
      grossCents: 0,
    };
    bucket.baseCents += base;
    bucket.vatCents += vat;
    bucket.grossCents += base + vat;
    vatMap.set(rate, bucket);
  }
  const vatByRate = Array.from(vatMap.values()).sort(
    (a, b) => b.rateBp - a.rateBp,
  );

  return {
    from: fromYmd,
    to: toYmd,
    monthly: Array.from(months.values()),
    revenueTotals: {
      subtotalCents: revSubtotal,
      taxCents: revTax,
      totalCents: revTotal,
    },
    vatByRate,
    vatTotals: { baseCents: vatBase, vatCents: vatAmt, grossCents: vatGross },
    outstanding,
    outstandingTotalCents,
  };
}
