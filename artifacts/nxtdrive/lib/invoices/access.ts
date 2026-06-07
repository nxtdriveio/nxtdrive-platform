import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadOrganizationBranchScope,
  requireOrganizationPermission,
  type AuthorizedOrganizationContext,
} from "@/lib/organization";
import {
  canAccessBranch,
  rolesGrantPermission,
  type BranchAccessScope,
} from "@/lib/permissions";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { MemberRole } from "@/lib/types";
import type { Invoice } from "./types";

export const INVOICE_BACKOFFICE_READ_ROLES = [
  "tenant_admin",
  "franchise_admin",
  "branch_manager",
  "admin_staff",
  "instructor",
] as const satisfies readonly MemberRole[];

export type InvoiceBackofficeAccess = {
  context: AuthorizedOrganizationContext;
  service: ReturnType<typeof createServiceRoleClient>;
  branchScope: BranchAccessScope;
};

export type InvoiceStudentTarget = {
  id: string;
  full_name: string | null;
  branch_id: string | null;
};

export async function requireInvoiceBackofficeReadAccess(): Promise<InvoiceBackofficeAccess> {
  const context = await requireOrganizationPermission("invoice:read", {
    allowedRoles: [...INVOICE_BACKOFFICE_READ_ROLES],
  });
  const service = createServiceRoleClient();
  const branchScope = await loadOrganizationBranchScope(service, context);
  return { context, service, branchScope };
}

export async function requireInvoiceBackofficeManageAccess(): Promise<InvoiceBackofficeAccess> {
  const context = await requireOrganizationPermission("invoice:manage");
  const service = createServiceRoleClient();
  const branchScope = await loadOrganizationBranchScope(service, context);
  return { context, service, branchScope };
}

export function canManageInvoices(access: InvoiceBackofficeAccess): boolean {
  return (
    access.context.user.profile?.is_platform_admin ||
    rolesGrantPermission(access.context.roles, "invoice:manage")
  );
}

export function canAccessInvoiceBranch(
  branchScope: BranchAccessScope,
  branchId: string | null | undefined,
): boolean {
  if (branchScope.scope_type === "all") return true;
  if (!branchId) return false;
  return canAccessBranch(branchScope, branchId);
}

export function selectedInvoiceBranchIds(
  branchScope: BranchAccessScope,
  selectedBranchId: string | null,
): string[] | null {
  if (selectedBranchId) return [selectedBranchId];
  return branchScope.scope_type === "branches" ? branchScope.branch_ids : null;
}

export async function loadInvoiceForAccess(
  access: InvoiceBackofficeAccess,
  invoiceId: string,
): Promise<Invoice | null> {
  const { data, error } = await access.service
    .from("invoices")
    .select("*")
    .eq("tenant_id", access.context.organization.id)
    .eq("id", invoiceId)
    .maybeSingle();

  if (error) throw new Error(`loadInvoiceForAccess: ${error.message}`);
  if (!data) return null;

  const invoice = data as Invoice;
  return canAccessInvoiceBranch(access.branchScope, invoice.branch_id)
    ? invoice
    : null;
}

export async function loadInvoiceStudentTarget(
  client: SupabaseClient,
  tenantId: string,
  studentId: string,
): Promise<InvoiceStudentTarget | null> {
  const { data, error } = await client
    .from("students")
    .select("id, full_name, branch_id")
    .eq("tenant_id", tenantId)
    .eq("id", studentId)
    .maybeSingle();

  if (error) throw new Error(`loadInvoiceStudentTarget: ${error.message}`);
  return (data as InvoiceStudentTarget | null) ?? null;
}

export async function validateInvoiceStudentTarget(
  access: InvoiceBackofficeAccess,
  studentId: string,
): Promise<InvoiceStudentTarget | null> {
  const student = await loadInvoiceStudentTarget(
    access.service,
    access.context.organization.id,
    studentId,
  );
  if (!student) return null;
  return canAccessInvoiceBranch(access.branchScope, student.branch_id)
    ? student
    : null;
}
