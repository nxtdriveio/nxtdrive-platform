/**
 * Static guardrails for Sprint 4D invoice branch scope.
 *
 *   pnpm --filter @workspace/scripts run test-invoice-branch-foundation
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  rolesGrantPermission,
  scopesForPermission,
} from "../../artifacts/nxtdrive/lib/permissions/index.ts";

type Outcome = { name: string; ok: boolean; detail?: string };
const results: Outcome[] = [];

function check(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
}

function source(pathFromRepoRoot: string): string {
  const url = new URL(`../../${pathFromRepoRoot}`, import.meta.url);
  return readFileSync(fileURLToPath(url), "utf8");
}

const invoiceAccessSrc = source("artifacts/nxtdrive/lib/invoices/access.ts");
const invoiceTypesSrc = source("artifacts/nxtdrive/lib/invoices/types.ts");
const invoiceListSrc = source("artifacts/nxtdrive/app/backoffice/facturen/page.tsx");
const invoiceDetailSrc = source("artifacts/nxtdrive/app/backoffice/facturen/[id]/page.tsx");
const invoiceNewSrc = source("artifacts/nxtdrive/app/backoffice/facturen/nieuw/page.tsx");
const invoiceTermijnSrc = source("artifacts/nxtdrive/app/backoffice/facturen/termijn/page.tsx");
const invoiceActionsSrc = source("artifacts/nxtdrive/app/backoffice/facturen/actions.ts");
const mollieActionsSrc = source("artifacts/nxtdrive/app/backoffice/facturen/mollie-actions.ts");
const migrationSrc = source("supabase/migrations/0106_invoice_branch_scope.sql");

check(
  "invoice permissions expose scoped read and manage roles",
  rolesGrantPermission(["tenant_admin"], "invoice:manage") &&
    rolesGrantPermission(["franchise_admin"], "invoice:manage") &&
    rolesGrantPermission(["admin_staff"], "invoice:manage") &&
    rolesGrantPermission(["branch_manager"], "invoice:read") &&
    rolesGrantPermission(["instructor"], "invoice:read") &&
    !rolesGrantPermission(["planner"], "invoice:read") &&
    scopesForPermission(["branch_manager"], "invoice:read").includes("branch") &&
    scopesForPermission(["admin_staff"], "invoice:manage").includes("branch"),
);

check(
  "invoice access helper centralizes branch authorization",
  invoiceAccessSrc.includes("INVOICE_BACKOFFICE_READ_ROLES") &&
    invoiceAccessSrc.includes('requireOrganizationPermission("invoice:read"') &&
    invoiceAccessSrc.includes('requireOrganizationPermission("invoice:manage"') &&
    invoiceAccessSrc.includes("loadOrganizationBranchScope") &&
    invoiceAccessSrc.includes("canAccessInvoiceBranch") &&
    invoiceAccessSrc.includes("validateInvoiceStudentTarget"),
);

check(
  "invoice types carry branch id",
  invoiceTypesSrc.includes("export type Invoice") &&
    invoiceTypesSrc.includes("branch_id: string | null"),
);

check(
  "invoice list is permission and branch scoped",
  invoiceListSrc.includes("requireInvoiceBackofficeReadAccess") &&
    invoiceListSrc.includes("selectedInvoiceBranchIds") &&
    invoiceListSrc.includes("listBranches") &&
    invoiceListSrc.includes("Alle toegestane vestigingen") &&
    invoiceListSrc.includes("canManageInvoices") &&
    !invoiceListSrc.includes("requireActiveTenant"),
);

check(
  "invoice create forms filter students by branch scope",
  invoiceNewSrc.includes("requireInvoiceBackofficeManageAccess") &&
    invoiceNewSrc.includes('.in("branch_id", branchScope.branch_ids)') &&
    invoiceTermijnSrc.includes("requireInvoiceBackofficeManageAccess") &&
    invoiceTermijnSrc.includes('.in("branch_id", branchScope.branch_ids)') &&
    !invoiceNewSrc.includes("requireActiveTenant") &&
    !invoiceTermijnSrc.includes("requireActiveTenant"),
);

check(
  "invoice detail uses branch scoped service-role reads after guard",
  invoiceDetailSrc.includes("requireInvoiceBackofficeReadAccess") &&
    invoiceDetailSrc.includes("loadInvoiceForAccess") &&
    invoiceDetailSrc.includes("canManageInvoices") &&
    invoiceDetailSrc.includes('rolesGrantPermission(context.roles, "task:manage")') &&
    !invoiceDetailSrc.includes("requireActiveTenant") &&
    !invoiceDetailSrc.includes("createServerSupabaseClient"),
);

check(
  "invoice actions validate target student and invoice before RPCs",
  invoiceActionsSrc.includes("requireInvoiceBackofficeManageAccess") &&
    invoiceActionsSrc.includes("validateInvoiceStudentTarget") &&
    invoiceActionsSrc.includes("loadInvoiceForAccess") &&
    invoiceActionsSrc.includes('service.rpc("create_invoice"') &&
    invoiceActionsSrc.includes('service.rpc("record_invoice_payment"') &&
    !invoiceActionsSrc.includes("requireActiveTenant"),
);

check(
  "Mollie invoice action is branch guarded",
  mollieActionsSrc.includes("requireInvoiceBackofficeManageAccess") &&
    mollieActionsSrc.includes("loadInvoiceForAccess") &&
    mollieActionsSrc.includes("createInvoiceCheckout") &&
    !mollieActionsSrc.includes("requireActiveTenant"),
);

check(
  "invoice migration adds branch columns, backfill, indexes and triggers",
  migrationSrc.includes("alter table public.invoices") &&
    migrationSrc.includes("alter table public.installment_plans") &&
    migrationSrc.includes("alter table public.payment_records") &&
    migrationSrc.includes("idx_invoices_tenant_branch") &&
    migrationSrc.includes("ensure_invoice_branch_tenant") &&
    migrationSrc.includes("invoices_branch_tenant_guard") &&
    migrationSrc.includes("payment_records_branch_tenant_guard") &&
    migrationSrc.includes("branch_id must match the student branch") &&
    migrationSrc.includes("branch_id must match the invoice branch"),
);

console.log("");
let failed = 0;
for (const r of results) {
  const mark = r.ok ? "OK" : "FAIL";
  console.log(`${mark} ${r.name}${r.detail ? ` - ${r.detail}` : ""}`);
  if (!r.ok) failed++;
}
console.log("");
if (failed > 0) {
  console.error(`${failed} test(s) failed.`);
  process.exit(1);
}
console.log("All invoice branch foundation tests passed.");
