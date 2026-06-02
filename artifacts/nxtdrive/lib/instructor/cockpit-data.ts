import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreditReason } from "@/lib/students/types";
import type { InvoiceStatus } from "@/lib/invoices/types";

/**
 * Aggregated hours + payment snapshot for the instructor cockpit "Les voortgang"
 * card. Everything is read tenant-scoped through the caller's RLS client; the
 * caller already validated tenant + lesson ownership.
 *
 * Hours are stored in minutes (see lib/students/types.ts) and rendered as uren.
 * - purchasedMinutes: total tegoed ever granted (packages, opening balance,
 *   positive manual corrections). Refunds are excluded so the denominator
 *   reflects what the student actually bought.
 * - completedMinutes: sum of duration of completed (and in-progress) lessons.
 * - balanceMinutes: current remaining tegoed.
 * - ringPct: completedMinutes / purchasedMinutes, clamped 0–100.
 */
export type CockpitProgress = {
  purchasedMinutes: number;
  completedMinutes: number;
  balanceMinutes: number;
  ringPct: number;
};

export type CockpitPayment = {
  /** Sum of total_cents across paid invoices. */
  paidCents: number;
  /** Sum of total_cents across open (unpaid) invoices. */
  outstandingCents: number;
  hasInvoices: boolean;
  /** UI badge state derived from the two sums above. */
  state: "paid" | "outstanding" | "none";
};

const PURCHASE_REASONS: CreditReason[] = [
  "package_purchase",
  "opening_balance",
];

export async function loadCockpitProgress(
  rls: SupabaseClient,
  tenantId: string,
  studentId: string,
  balanceMinutes: number,
): Promise<CockpitProgress> {
  const ctx = `tenant=${tenantId} student=${studentId}`;

  const [ledgerRes, lessonsRes] = await Promise.all([
    rls
      .from("credit_ledger")
      .select("delta, reason")
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId),
    rls
      .from("lessons")
      .select("status, credits_cost")
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId),
  ]);

  if (ledgerRes.error) {
    throw new Error(
      `cockpit: credit_ledger load failed (${ctx}): ${ledgerRes.error.message}`,
    );
  }
  if (lessonsRes.error) {
    throw new Error(
      `cockpit: lessons load failed (${ctx}): ${lessonsRes.error.message}`,
    );
  }

  const ledger = (ledgerRes.data ?? []) as {
    delta: number;
    reason: CreditReason;
  }[];
  const lessons = (lessonsRes.data ?? []) as {
    status: string;
    credits_cost: number;
  }[];

  // Purchased = grants from packages / opening balance + positive corrections.
  const purchasedMinutes = ledger.reduce((sum, row) => {
    if (PURCHASE_REASONS.includes(row.reason)) return sum + row.delta;
    if (row.reason === "adjustment" && row.delta > 0) return sum + row.delta;
    return sum;
  }, 0);

  const completedMinutes = lessons.reduce((sum, l) => {
    if (l.status === "completed" || l.status === "in_progress") {
      return sum + (l.credits_cost ?? 0);
    }
    return sum;
  }, 0);

  const ringPct =
    purchasedMinutes > 0
      ? Math.max(0, Math.min(100, (completedMinutes / purchasedMinutes) * 100))
      : 0;

  return { purchasedMinutes, completedMinutes, balanceMinutes, ringPct };
}

export async function loadCockpitPayment(
  rls: SupabaseClient,
  tenantId: string,
  studentId: string,
): Promise<CockpitPayment> {
  const { data, error } = await rls
    .from("invoices")
    .select("status, total_cents")
    .eq("tenant_id", tenantId)
    .eq("student_id", studentId);

  if (error) {
    throw new Error(
      `cockpit: invoices load failed (tenant=${tenantId} student=${studentId}): ${error.message}`,
    );
  }

  const invoices = (data ?? []) as {
    status: InvoiceStatus;
    total_cents: number;
  }[];

  const paidCents = invoices
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + i.total_cents, 0);
  const outstandingCents = invoices
    .filter((i) => i.status === "open")
    .reduce((sum, i) => sum + i.total_cents, 0);
  const hasInvoices = invoices.some(
    (i) => i.status === "paid" || i.status === "open",
  );

  const state: CockpitPayment["state"] =
    outstandingCents > 0 ? "outstanding" : paidCents > 0 ? "paid" : "none";

  return { paidCents, outstandingCents, hasInvoices, state };
}
