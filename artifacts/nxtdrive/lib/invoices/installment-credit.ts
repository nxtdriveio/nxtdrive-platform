import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Task #112 — Termijn-tegoed: tenant-configurable gefaseerde tegoed-vrijgave.
//
// A driving school can release a package's tegoed (credits) either:
//   * immediate       — the full tegoed lands the moment a termijn-schema is
//                       created, regardless of payment.
//   * per_installment — each paid termijn releases its proportional share; the
//                       sum over all termijnen equals the package total exactly
//                       (the last termijn settles the remainder). Platform
//                       default: tegoed never runs ahead of payment.
//
// Stored in tenant_settings key `installment_credit_release` as {"mode": ...}.
// The policy is snapshot onto installment_plans at creation, so flipping the
// setting never retro-changes existing plans. Never hardcoded per school.
// ---------------------------------------------------------------------------

export const INSTALLMENT_CREDIT_POLICY_KEY = "installment_credit_release";

export type InstallmentCreditMode = "immediate" | "per_installment";

export interface InstallmentCreditPolicy {
  mode: InstallmentCreditMode;
}

// Platform default: financially safe — release per paid termijn.
export const DEFAULT_INSTALLMENT_CREDIT_POLICY: InstallmentCreditPolicy = {
  mode: "per_installment",
};

export const INSTALLMENT_CREDIT_MODE_LABEL: Record<
  InstallmentCreditMode,
  string
> = {
  immediate: "Direct volledig vrijgeven",
  per_installment: "Vrijgeven per betaalde termijn",
};

export const INSTALLMENT_CREDIT_MODE_HINT: Record<
  InstallmentCreditMode,
  string
> = {
  immediate:
    "Het volledige pakket-tegoed komt direct beschikbaar zodra het termijnschema wordt aangemaakt.",
  per_installment:
    "Elke betaalde termijn geeft een evenredig deel van het pakket-tegoed vrij. Het tegoed loopt nooit vooruit op de betaling.",
};

/**
 * Merge an untrusted tenant override onto the platform default, dropping any
 * malformed value. Always returns a complete, valid policy.
 */
export function mergeInstallmentCreditPolicy(
  override: unknown,
): InstallmentCreditPolicy {
  if (!override || typeof override !== "object") {
    return { ...DEFAULT_INSTALLMENT_CREDIT_POLICY };
  }
  const mode = (override as Record<string, unknown>).mode;
  if (mode === "immediate" || mode === "per_installment") {
    return { mode };
  }
  return { ...DEFAULT_INSTALLMENT_CREDIT_POLICY };
}

/**
 * Read the tenant's tegoed-release policy. The client must be able to read
 * tenant_settings for this tenant (RLS allows tenant members; service role is
 * fine). Falls back to the platform default on any read error.
 */
export async function loadInstallmentCreditPolicy(
  client: SupabaseClient,
  tenantId: string,
): Promise<InstallmentCreditPolicy> {
  const { data, error } = await client
    .from("tenant_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", INSTALLMENT_CREDIT_POLICY_KEY)
    .maybeSingle();
  if (error) return mergeInstallmentCreditPolicy(null);
  return mergeInstallmentCreditPolicy(data?.value ?? null);
}

/**
 * Deterministic per-termijn tegoed share — the exact TS mirror of the SQL in
 * release_installment_credit:
 *   share(i) = round(total*i/N) - round(total*(i-1)/N)
 * Cumulative targets telescope, so the sum over i=1..N equals `total` exactly
 * and the last termijn settles any rounding remainder. Order-independent.
 *
 * @param total Package tegoed in minutes.
 * @param count Number of termijnen (>= 1).
 * @param no    1-based termijn number.
 */
export function installmentCreditShare(
  total: number,
  count: number,
  no: number,
): number {
  if (count <= 0 || no < 1 || no > count || total <= 0) return 0;
  const upTo = Math.round((total * no) / count);
  const upToPrev = Math.round((total * (no - 1)) / count);
  return Math.max(upTo - upToPrev, 0);
}

export interface InstallmentPlanCreditStatus {
  plan_id: string;
  tenant_id: string;
  student_id: string;
  credit_release_policy: InstallmentCreditMode;
  package_credit_minutes: number | null;
  released_minutes: number;
  pending_minutes: number;
}

export interface InstallmentCreditReleaseRow {
  id: string;
  plan_id: string;
  invoice_id: string | null;
  installment_no: number | null;
  minutes: number;
  created_at: string;
}

/** Per-installment-invoice tegoed view for the backoffice invoice detail. */
export interface InvoiceInstallmentCredit {
  policy: InstallmentCreditMode;
  packageMinutes: number;
  installmentNo: number;
  installmentCount: number;
  shareMinutes: number;
  released: boolean;
  releasedMinutes: number;
  planReleasedMinutes: number;
  planPendingMinutes: number;
}

/**
 * Build the termijn-tegoed picture for a single installment invoice. Returns
 * null when the invoice is not part of a tegoed-carrying termijn schema. The
 * client's RLS applies (status view + releases are read-only for staff/own
 * student/guardian).
 */
export async function loadInvoiceInstallmentCredit(
  client: SupabaseClient,
  tenantId: string,
  invoice: {
    installment_plan_id: string | null;
    installment_no: number | null;
    installment_count: number | null;
    id: string;
  },
): Promise<InvoiceInstallmentCredit | null> {
  if (
    !invoice.installment_plan_id ||
    !invoice.installment_no ||
    !invoice.installment_count
  ) {
    return null;
  }

  const [statusRes, thisReleaseRes] = await Promise.all([
    client
      .from("installment_plan_credit_status")
      .select(
        "credit_release_policy, package_credit_minutes, released_minutes, pending_minutes",
      )
      .eq("plan_id", invoice.installment_plan_id)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    client
      .from("installment_credit_releases")
      .select("minutes")
      .eq("invoice_id", invoice.id)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  const status = statusRes.data as {
    credit_release_policy: InstallmentCreditMode;
    package_credit_minutes: number | null;
    released_minutes: number;
    pending_minutes: number;
  } | null;
  if (!status || !status.package_credit_minutes) return null;

  const releaseRow = thisReleaseRes.data as { minutes: number } | null;

  return {
    policy: status.credit_release_policy,
    packageMinutes: status.package_credit_minutes,
    installmentNo: invoice.installment_no,
    installmentCount: invoice.installment_count,
    shareMinutes: installmentCreditShare(
      status.package_credit_minutes,
      invoice.installment_count,
      invoice.installment_no,
    ),
    released: releaseRow !== null,
    releasedMinutes: releaseRow?.minutes ?? 0,
    planReleasedMinutes: status.released_minutes,
    planPendingMinutes: status.pending_minutes,
  };
}

/** A student's termijn schema with tegoed, for the student PWA credits page. */
export interface StudentInstallmentCredit {
  planId: string;
  description: string;
  policy: InstallmentCreditMode;
  packageMinutes: number;
  releasedMinutes: number;
  pendingMinutes: number;
}

/**
 * List the student's termijn schemas that carry tegoed, with released/pending
 * minutes. Client RLS applies (own student / guardian can read).
 */
export async function loadStudentInstallmentCredit(
  client: SupabaseClient,
  studentId: string,
): Promise<StudentInstallmentCredit[]> {
  const { data, error } = await client
    .from("installment_plan_credit_status")
    .select(
      "plan_id, credit_release_policy, package_credit_minutes, released_minutes, pending_minutes",
    )
    .eq("student_id", studentId);
  if (error || !data) return [];

  const rows = data as Array<{
    plan_id: string;
    credit_release_policy: InstallmentCreditMode;
    package_credit_minutes: number | null;
    released_minutes: number;
    pending_minutes: number;
  }>;
  const withCredit = rows.filter(
    (r) => (r.package_credit_minutes ?? 0) > 0,
  );
  if (withCredit.length === 0) return [];

  // Resolve a friendly label per plan.
  const planIds = withCredit.map((r) => r.plan_id);
  const { data: planRows } = await client
    .from("installment_plans")
    .select("id, description")
    .in("id", planIds);
  const descById = new Map<string, string>(
    ((planRows ?? []) as Array<{ id: string; description: string | null }>).map(
      (p) => [p.id, p.description ?? "Termijnschema"],
    ),
  );

  return withCredit.map((r) => ({
    planId: r.plan_id,
    description: descById.get(r.plan_id) ?? "Termijnschema",
    policy: r.credit_release_policy,
    packageMinutes: r.package_credit_minutes ?? 0,
    releasedMinutes: r.released_minutes,
    pendingMinutes: r.pending_minutes,
  }));
}
