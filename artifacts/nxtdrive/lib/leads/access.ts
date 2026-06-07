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
import type { MemberRole } from "@/lib/types";
import type { Lead } from "./types";

export const LEAD_BACKOFFICE_READ_ROLES = [
  "tenant_admin",
  "franchise_admin",
  "instructor",
] as const satisfies readonly MemberRole[];

export const LEAD_BACKOFFICE_ADMIN_ROLES = [
  "tenant_admin",
] as const satisfies readonly MemberRole[];

export const LEAD_BACKOFFICE_COLLABORATE_ROLES = [
  "tenant_admin",
  "franchise_admin",
  "instructor",
] as const satisfies readonly MemberRole[];

export type LeadBackofficeAccessMode = "read" | "admin" | "collaborate";

export type LeadBackofficeAccess = {
  context: AuthorizedOrganizationContext;
  branchScope: BranchAccessScope;
  lead: Lead | null;
};

function rolesForLeadAccessMode(
  mode: LeadBackofficeAccessMode,
): readonly MemberRole[] {
  if (mode === "admin") return LEAD_BACKOFFICE_ADMIN_ROLES;
  if (mode === "collaborate") return LEAD_BACKOFFICE_COLLABORATE_ROLES;
  return LEAD_BACKOFFICE_READ_ROLES;
}

function isAssignedToInstructor(
  context: AuthorizedOrganizationContext,
  lead: Pick<Lead, "assigned_to" | "assigned_owner_id" | "assigned_instructor_id">,
): boolean {
  if (!context.roles.includes("instructor")) return false;
  return (
    lead.assigned_to === context.user.id ||
    lead.assigned_owner_id === context.user.id ||
    lead.assigned_instructor_id === context.user.id
  );
}

export function canReadLeadRow(
  context: AuthorizedOrganizationContext,
  branchScope: BranchAccessScope,
  lead: Pick<Lead, "branch_id" | "assigned_to" | "assigned_owner_id" | "assigned_instructor_id">,
): boolean {
  if (context.user.profile?.is_platform_admin) return true;
  if (canAccessBranch(branchScope, lead.branch_id)) return true;
  return isAssignedToInstructor(context, lead);
}

export function canCollaborateOnLeadRow(
  context: AuthorizedOrganizationContext,
  branchScope: BranchAccessScope,
  lead: Pick<Lead, "branch_id" | "assigned_to" | "assigned_owner_id" | "assigned_instructor_id">,
): boolean {
  if (context.user.profile?.is_platform_admin) return true;
  if (
    rolesGrantPermission(context.roles, "lead:manage") &&
    canAccessBranch(branchScope, lead.branch_id)
  ) {
    return true;
  }
  if (context.roles.includes("instructor") && canAccessBranch(branchScope, lead.branch_id)) {
    return true;
  }
  return isAssignedToInstructor(context, lead);
}

export async function requireLeadAccessContext(
  client: SupabaseClient,
  roles: readonly MemberRole[] = LEAD_BACKOFFICE_READ_ROLES,
): Promise<{
  context: AuthorizedOrganizationContext;
  branchScope: BranchAccessScope;
}> {
  const context = await requireOrganizationPermission("lead:read", {
    allowedRoles: [...roles],
  });
  const branchScope = await loadOrganizationBranchScope(client, context);
  return { context, branchScope };
}

/**
 * Validates staff-facing access to one lead before service-role reads/actions.
 * Student/parent portal access is intentionally out of scope for this helper.
 */
export async function requireLeadBackofficeAccess(
  client: SupabaseClient,
  leadId: string,
  mode: LeadBackofficeAccessMode = "read",
  options: { allowedRoles?: readonly MemberRole[] } = {},
): Promise<LeadBackofficeAccess> {
  const allowedRoles = [...(options.allowedRoles ?? rolesForLeadAccessMode(mode))];
  const permission = mode === "admin" ? "lead:manage" : "lead:read";
  const context = await requireOrganizationPermission(permission, { allowedRoles });
  const branchScope = await loadOrganizationBranchScope(client, context);

  const { data, error } = await client
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .eq("tenant_id", context.organization.id)
    .maybeSingle();

  if (error) {
    throw new Error(`requireLeadBackofficeAccess: ${error.message}`);
  }

  const lead = (data ?? null) as Lead | null;
  if (!lead) return { context, branchScope, lead: null };

  const allowed =
    mode === "collaborate"
      ? canCollaborateOnLeadRow(context, branchScope, lead)
      : canReadLeadRow(context, branchScope, lead);

  return { context, branchScope, lead: allowed ? lead : null };
}
