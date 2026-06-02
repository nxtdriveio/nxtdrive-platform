import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getActiveStudent } from "@/lib/students/access";
import type { Student } from "@/lib/students/types";
import type { AuthenticatedUser, MemberRole, Tenant } from "@/lib/types";
import {
  loadParentPortalVisibility,
  type ParentPortalSection,
  type ParentPortalVisibility,
} from "./visibility";
import { loadParentPortalData, type ParentPortalData } from "./data";

// ---------------------------------------------------------------------------
// Task #96 — shared request context for the Ouderportaal (/ouder).
//
// Resolves the authenticated parent, their active child and the tenant's
// section visibility once per page. Data reads always go through the
// RLS-scoped server client so a parent only ever receives their linked
// child's rows; visibility (config, not student data) is read with the
// service role to avoid depending on tenant_settings policy ordering.
// ---------------------------------------------------------------------------

export type PortalContext = {
  user: AuthenticatedUser;
  tenant: Tenant;
  roles: MemberRole[];
  student: Student | null;
  accessible: Student[];
  visibility: ParentPortalVisibility;
  /** RLS-scoped client — use for every student-data read. */
  rls: SupabaseClient;
};

const EMPTY_DATA: ParentPortalData = {
  planning: null,
  voortgang: null,
  examens: null,
  facturen: null,
  betalingen: null,
  pakketinformatie: null,
  tegoed: null,
  documenten: null,
};

/**
 * Resolve the parent portal context. Redirects to the child picker when the
 * parent is linked to multiple children and has not chosen one yet. Never
 * redirects when there is exactly one (or zero) linked child.
 *
 * Pass `allowPicker: true` from the /ouder/select-child page so it does not
 * redirect onto itself.
 */
export async function loadPortalContext(
  opts: { allowPicker?: boolean } = {},
): Promise<PortalContext> {
  const { user, tenant, roles } = await requireActiveTenant(["parent"]);
  const { student, accessible, needsChildPicker } = await getActiveStudent(
    user,
    tenant.id,
    roles,
    { preferGuardianChildren: true },
  );
  if (needsChildPicker && !opts.allowPicker) {
    redirect("/ouder/select-child");
  }
  const visibility = await loadParentPortalVisibility(
    createServiceRoleClient(),
    tenant.id,
  );
  const rls = await createServerSupabaseClient();
  return { user, tenant, roles, student, accessible, visibility, rls };
}

/**
 * Load only the requested sections, and only those the tenant has enabled.
 * Disabled or unrequested sections come back as null.
 */
export async function loadPortalSections(
  ctx: PortalContext,
  sections: ParentPortalSection[],
): Promise<ParentPortalData> {
  if (!ctx.student) return EMPTY_DATA;
  const mask: ParentPortalVisibility = {
    planning: false,
    voortgang: false,
    examens: false,
    facturen: false,
    betalingen: false,
    pakketinformatie: false,
    tegoed: false,
    documenten: false,
  };
  for (const section of sections) {
    if (ctx.visibility[section]) mask[section] = true;
  }
  return loadParentPortalData(ctx.rls, ctx.tenant.id, ctx.student.id, mask);
}
