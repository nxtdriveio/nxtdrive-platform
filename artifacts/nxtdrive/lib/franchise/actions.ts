"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { requirePlatformAdmin } from "@/lib/auth/require-role";
import {
  canManageExistingBranches,
  loadTenantEntitlementSnapshot,
} from "@/lib/platform/entitlements";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { PLAN_LABELS } from "@/lib/platform/features";

function redirectPlanRequired(path: string, plan: keyof typeof PLAN_LABELS) {
  redirect(`${path}?error=plan_required&plan=${plan}`);
}

function redirectFeatureRequired(path: string, requiredPlan: keyof typeof PLAN_LABELS) {
  redirectPlanRequired(path, requiredPlan);
}

const FRANCHISE_REVALIDATE_PATHS = [
  "/backoffice/franchise",
  "/backoffice/franchise/aandacht",
  "/backoffice/franchise/delegaties",
  "/backoffice/franchise/governance",
  "/backoffice/franchise/playbook",
  "/backoffice/franchise/prestaties",
  "/backoffice/franchise/templates",
  "/backoffice/packages",
  "/backoffice/taken",
];

function checked(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function cleanField(formData: FormData, key: string, max = 240): string {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function safeReturnPath(formData: FormData, fallback: string): string {
  const submitted = cleanField(formData, "return_to", 300);
  if (
    submitted.startsWith("/backoffice/franchise") ||
    submitted.startsWith("/backoffice/leads")
  ) {
    return submitted;
  }
  return fallback;
}

function redirectWith(path: string, key: string, value = "1"): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}${key}=${encodeURIComponent(value)}`);
}

function revalidateFranchiseControlPaths() {
  for (const path of FRANCHISE_REVALIDATE_PATHS) {
    revalidatePath(path);
  }
}

async function requireFranchisegeverAction(returnTo: string) {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "franchise_admin",
  ]);
  const service = createServiceRoleClient();
  const snapshot = await loadTenantEntitlementSnapshot(service, tenant.id);
  if (!snapshot.featureAccess.franchise_as_franchisegever.allowed) {
    redirectFeatureRequired(
      returnTo,
      snapshot.featureAccess.franchise_as_franchisegever.requiredPlan,
    );
  }
  return { user, tenant, service };
}

async function loadFranchiseeOrRedirect(
  service: ReturnType<typeof createServiceRoleClient>,
  franchiseRootTenantId: string,
  franchiseeTenantId: string,
  returnTo: string,
) {
  const { data: franchisee, error } = await service
    .from("tenants")
    .select("id, name, parent_tenant_id")
    .eq("id", franchiseeTenantId)
    .maybeSingle();

  if (error) {
    redirectWith(returnTo, "error", error.message.slice(0, 200));
  }
  if (!franchisee || franchisee.parent_tenant_id !== franchiseRootTenantId) {
    redirectWith(returnTo, "error", "franchisee_not_in_network");
  }
  return franchisee as { id: string; name: string; parent_tenant_id: string };
}

async function loadDelegation(
  service: ReturnType<typeof createServiceRoleClient>,
  franchiseRootTenantId: string,
  franchiseeTenantId: string,
) {
  const { data, error } = await service
    .from("franchise_operations_permissions")
    .select("*")
    .eq("franchise_root_tenant_id", franchiseRootTenantId)
    .eq("franchisee_tenant_id", franchiseeTenantId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as
    | {
        can_manage_planning: boolean;
        can_manage_leads: boolean;
        can_manage_templates: boolean;
        can_manage_fleet: boolean;
        can_manage_instructor_availability: boolean;
      }
    | null;
}

async function auditFranchiseAction(
  service: ReturnType<typeof createServiceRoleClient>,
  input: {
    actorUserId: string;
    tenantId: string;
    action: string;
    targetType: string;
    targetId: string;
    payload: Record<string, unknown>;
  },
) {
  const { error } = await service.from("audit_log").insert({
    actor_user_id: input.actorUserId,
    tenant_id: input.tenantId,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId,
    payload: input.payload,
  });
  if (error) throw new Error(error.message);
}

async function ensureTaskColumnForDepartment(
  service: ReturnType<typeof createServiceRoleClient>,
  tenantId: string,
  actorUserId: string,
  departmentKey: string,
) {
  const { error: defaultsError } = await service.rpc("ensure_default_task_setup", {
    p_tenant_id: tenantId,
    p_actor: actorUserId,
  });
  if (defaultsError) throw new Error(defaultsError.message);

  const { data: department, error: departmentError } = await service
    .from("task_departments")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("key", departmentKey)
    .maybeSingle();
  if (departmentError) throw new Error(departmentError.message);
  if (!department) throw new Error("task_department_missing");

  const { data: board, error: boardError } = await service
    .from("task_boards")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("department_id", department.id)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (boardError) throw new Error(boardError.message);
  if (!board) throw new Error("task_board_missing");

  const { data: column, error: columnError } = await service
    .from("task_columns")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("board_id", board.id)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (columnError) throw new Error(columnError.message);
  if (!column) throw new Error("task_column_missing");

  return { boardId: board.id as string, columnId: column.id as string };
}

function departmentForFollowUpRoute(route: string): string {
  if (route === "lokale-planning") return "planning";
  if (route === "marketing") return "marketing";
  if (route === "kwaliteit") return "examenbeheer";
  return "support";
}

function taskPriorityForFranchisePriority(priority: string) {
  if (priority === "hoog") return "high";
  if (priority === "middel") return "normal";
  if (priority === "laag") return "low";
  return "normal";
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform admin: link / unlink franchisee ↔ franchisegever
// ─────────────────────────────────────────────────────────────────────────────

export async function setFranchiseeParent(formData: FormData) {
  const user = await requirePlatformAdmin();
  const franchisee_id = String(formData.get("franchisee_id") ?? "").trim();
  const franchisegever_id = String(formData.get("franchisegever_id") ?? "").trim();

  if (!franchisee_id) {
    redirect(`/admin/tenants/${franchisee_id}?error=missing_fields`);
  }

  const service = createServiceRoleClient();
  const { error } = await service.rpc("set_franchisee_parent", {
    p_franchisee_tenant_id:    franchisee_id,
    p_franchisegever_tenant_id: franchisegever_id || null,
    p_actor: user.id,
  });

  if (error) {
    redirect(
      `/admin/tenants/${franchisee_id}?error=` +
        encodeURIComponent(error.message.slice(0, 200)),
    );
  }

  redirect(`/admin/tenants/${franchisee_id}?franchise_saved=1`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Franchisegever: manage templates
// ─────────────────────────────────────────────────────────────────────────────

export async function createFranchiseTemplate(formData: FormData) {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "franchise_admin",
  ]);

  const name          = String(formData.get("name") ?? "").trim();
  const credits_total = parseInt(String(formData.get("credits_total") ?? ""), 10);
  const price_cents   = Math.round(
    parseFloat(String(formData.get("price_excl_vat_euros") ?? "0").replace(",", ".")) *
      100,
  );
  const valid_days_raw = String(formData.get("valid_days") ?? "").trim();
  const valid_days    = valid_days_raw ? parseInt(valid_days_raw, 10) : null;
  const description   = String(formData.get("description") ?? "").trim() || undefined;

  if (!name || isNaN(credits_total) || credits_total <= 0) {
    redirect("/backoffice/franchise/templates?error=missing_fields");
  }

  const service = createServiceRoleClient();
  const snapshot = await loadTenantEntitlementSnapshot(service, tenant.id);
  if (!snapshot.featureAccess.franchise_as_franchisegever.allowed) {
    redirectFeatureRequired(
      "/backoffice/franchise/templates",
      snapshot.featureAccess.franchise_as_franchisegever.requiredPlan,
    );
  }
  const { error } = await service.rpc("create_franchise_template", {
    p_tenant_id: tenant.id,
    p_type:      "package",
    p_name:      name,
    p_config: {
      credits_total,
      price_cents,
      ...(valid_days !== null ? { valid_days } : {}),
      ...(description ? { description } : {}),
    },
    p_actor: user.id,
  });

  if (error) {
    redirect(
      "/backoffice/franchise/templates?error=" +
        encodeURIComponent(error.message.slice(0, 200)),
    );
  }

  revalidatePath("/backoffice/franchise/templates");
  redirect("/backoffice/franchise/templates?created=1");
}

export async function updateFranchiseTemplate(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin", "franchise_admin"]);

  const template_id  = String(formData.get("template_id") ?? "").trim();
  const name         = String(formData.get("name") ?? "").trim() || null;
  const is_active_raw = formData.get("is_active");
  const is_active    = is_active_raw !== null ? is_active_raw === "true" : null;

  if (!template_id) redirect("/backoffice/franchise/templates?error=missing_fields");

  const service = createServiceRoleClient();
  const snapshot = await loadTenantEntitlementSnapshot(service, tenant.id);
  if (!snapshot.featureAccess.franchise_as_franchisegever.allowed) {
    redirectFeatureRequired(
      "/backoffice/franchise/templates",
      snapshot.featureAccess.franchise_as_franchisegever.requiredPlan,
    );
  }
  const { error } = await service.rpc("update_franchise_template", {
    p_template_id: template_id,
    p_name:        name,
    p_config:      null,
    p_is_active:   is_active,
    p_actor:       user.id,
  });

  if (error) {
    redirect(
      "/backoffice/franchise/templates?error=" +
        encodeURIComponent(error.message.slice(0, 200)),
    );
  }

  revalidatePath("/backoffice/franchise/templates");
  redirect("/backoffice/franchise/templates?saved=1");
}

/**
 * Franchisegever: distribute template read-only visibility to one franchisee.
 * Does NOT create a package — franchisee activates locally via
 * activateFranchiseTemplateAsPackage.
 */
export async function pushTemplateToFranchisee(formData: FormData) {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "franchise_admin",
  ]);

  const template_id          = String(formData.get("template_id") ?? "").trim();
  const franchisee_tenant_id = String(formData.get("franchisee_tenant_id") ?? "").trim();

  if (!template_id || !franchisee_tenant_id) {
    redirect("/backoffice/franchise/templates?error=missing_fields");
  }

  const service = createServiceRoleClient();
  const snapshot = await loadTenantEntitlementSnapshot(service, tenant.id);
  if (!snapshot.featureAccess.franchise_as_franchisegever.allowed) {
    redirectFeatureRequired(
      "/backoffice/franchise/templates",
      snapshot.featureAccess.franchise_as_franchisegever.requiredPlan,
    );
  }
  const { error } = await service.rpc("distribute_franchise_template", {
    p_template_id:          template_id,
    p_franchisee_tenant_id: franchisee_tenant_id,
    p_actor:                user.id,
  });

  if (error) {
    redirect(
      `/backoffice/franchise/templates?error=` +
        encodeURIComponent(error.message.slice(0, 200)),
    );
  }

  revalidatePath("/backoffice/franchise/templates");
  redirect("/backoffice/franchise/templates?pushed=1");
}

/** Franchisee: activate a template (creates a real package). */
export async function activateFranchiseTemplateAsPackage(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);

  const template_id = String(formData.get("template_id") ?? "").trim();
  if (!template_id) redirect("/backoffice/packages?error=missing_fields");

  const service = createServiceRoleClient();
  const snapshot = await loadTenantEntitlementSnapshot(service, tenant.id);
  if (!snapshot.featureAccess.franchise_as_franchisee.allowed) {
    redirectFeatureRequired(
      "/backoffice/packages",
      snapshot.featureAccess.franchise_as_franchisee.requiredPlan,
    );
  }

  // Verify template belongs to the franchisegever of this tenant.
  const { data: franchiseeRow } = await service
    .from("tenants")
    .select("parent_tenant_id")
    .eq("id", tenant.id)
    .single();

  if (!franchiseeRow?.parent_tenant_id) {
    redirect("/backoffice/packages?error=not_franchisee");
  }

  const { error } = await service.rpc("activate_franchise_template", {
    p_template_id:          template_id,
    p_franchisee_tenant_id: tenant.id,
    p_actor:                user.id,
  });

  if (error) {
    redirect(
      "/backoffice/packages?error=" +
        encodeURIComponent(error.message.slice(0, 200)),
    );
  }

  revalidatePath("/backoffice/packages");
  redirect("/backoffice/packages?franchise_activated=1");
}

export async function upsertFranchiseDelegation(formData: FormData) {
  const returnTo = safeReturnPath(formData, "/backoffice/franchise/delegaties");
  const franchiseeTenantId = cleanField(formData, "franchisee_tenant_id", 120);
  if (!franchiseeTenantId) redirectWith(returnTo, "error", "missing_fields");

  const { user, tenant, service } = await requireFranchisegeverAction(returnTo);
  const franchisee = await loadFranchiseeOrRedirect(
    service,
    tenant.id,
    franchiseeTenantId,
    returnTo,
  );

  const canManagePlanning = checked(formData, "can_manage_planning");
  const canManageLeads = checked(formData, "can_manage_leads");
  const canManageTemplates = checked(formData, "can_manage_templates");
  const canManageFleet = checked(formData, "can_manage_fleet");
  const canManageInstructorAvailability = checked(
    formData,
    "can_manage_instructor_availability",
  );

  const { error } = await service
    .from("franchise_operations_permissions")
    .upsert(
      {
        franchise_root_tenant_id: tenant.id,
        franchisee_tenant_id: franchisee.id,
        can_view_planning: true,
        can_manage_planning: canManagePlanning,
        can_manage_leads: canManageLeads,
        can_manage_templates: canManageTemplates,
        can_view_fleet: true,
        can_manage_fleet: canManageFleet,
        can_view_instructor_availability: true,
        can_manage_instructor_availability: canManageInstructorAvailability,
      },
      { onConflict: "franchise_root_tenant_id,franchisee_tenant_id" },
    );

  if (error) redirectWith(returnTo, "error", error.message.slice(0, 200));

  try {
    await auditFranchiseAction(service, {
      actorUserId: user.id,
      tenantId: tenant.id,
      action: "franchise.delegation.upserted",
      targetType: "franchisee_tenant",
      targetId: franchisee.id,
      payload: {
        franchisee_name: franchisee.name,
        can_manage_planning: canManagePlanning,
        can_manage_leads: canManageLeads,
        can_manage_templates: canManageTemplates,
        can_manage_fleet: canManageFleet,
        can_manage_instructor_availability: canManageInstructorAvailability,
      },
    });
  } catch (error) {
    redirectWith(
      returnTo,
      "error",
      error instanceof Error ? error.message.slice(0, 200) : "audit_failed",
    );
  }

  revalidateFranchiseControlPaths();
  redirectWith(returnTo, "delegation_saved");
}

export async function revokeFranchiseDelegation(formData: FormData) {
  const returnTo = safeReturnPath(formData, "/backoffice/franchise/delegaties");
  const franchiseeTenantId = cleanField(formData, "franchisee_tenant_id", 120);
  if (!franchiseeTenantId) redirectWith(returnTo, "error", "missing_fields");

  const { user, tenant, service } = await requireFranchisegeverAction(returnTo);
  const franchisee = await loadFranchiseeOrRedirect(
    service,
    tenant.id,
    franchiseeTenantId,
    returnTo,
  );

  const { error } = await service
    .from("franchise_operations_permissions")
    .delete()
    .eq("franchise_root_tenant_id", tenant.id)
    .eq("franchisee_tenant_id", franchisee.id);

  if (error) redirectWith(returnTo, "error", error.message.slice(0, 200));

  try {
    await auditFranchiseAction(service, {
      actorUserId: user.id,
      tenantId: tenant.id,
      action: "franchise.delegation.revoked",
      targetType: "franchisee_tenant",
      targetId: franchisee.id,
      payload: { franchisee_name: franchisee.name },
    });
  } catch (error) {
    redirectWith(
      returnTo,
      "error",
      error instanceof Error ? error.message.slice(0, 200) : "audit_failed",
    );
  }

  revalidateFranchiseControlPaths();
  redirectWith(returnTo, "delegation_revoked");
}

export async function applyFranchiseTemplateToFranchisee(formData: FormData) {
  const returnTo = safeReturnPath(formData, "/backoffice/franchise/templates");
  const templateId = cleanField(formData, "template_id", 120);
  const franchiseeTenantId = cleanField(formData, "franchisee_tenant_id", 120);
  if (!templateId || !franchiseeTenantId) {
    redirectWith(returnTo, "error", "missing_fields");
  }

  const { user, tenant, service } = await requireFranchisegeverAction(returnTo);
  const franchisee = await loadFranchiseeOrRedirect(
    service,
    tenant.id,
    franchiseeTenantId,
    returnTo,
  );

  let templateDelegation: Awaited<ReturnType<typeof loadDelegation>>;
  try {
    templateDelegation = await loadDelegation(service, tenant.id, franchisee.id);
  } catch (error) {
    redirectWith(
      returnTo,
      "error",
      error instanceof Error ? error.message.slice(0, 200) : "delegation_load_failed",
    );
  }
  if (!templateDelegation?.can_manage_templates) {
    redirectWith(returnTo, "error", "template_delegation_required");
  }

  const { data: template, error: templateError } = await service
    .from("franchise_templates")
    .select("*")
    .eq("id", templateId)
    .eq("tenant_id", tenant.id)
    .eq("is_active", true)
    .maybeSingle();

  if (templateError) redirectWith(returnTo, "error", templateError.message.slice(0, 200));
  if (!template) redirectWith(returnTo, "error", "template_not_found");

  const distribution = await service.rpc("distribute_franchise_template", {
    p_template_id: templateId,
    p_franchisee_tenant_id: franchisee.id,
    p_actor: user.id,
  });

  if (distribution.error) {
    redirectWith(returnTo, "error", distribution.error.message.slice(0, 200));
  }

  const { data: activation, error: activationError } = await service
    .from("franchise_template_activations")
    .select("id, resulting_package_id")
    .eq("franchise_template_id", templateId)
    .eq("franchisee_tenant_id", franchisee.id)
    .maybeSingle();

  if (activationError) {
    redirectWith(returnTo, "error", activationError.message.slice(0, 200));
  }
  if (activation?.resulting_package_id) {
    redirectWith(returnTo, "template_already_applied");
  }

  const templateRow = template as {
    name: string;
    config: {
      credits_total?: number;
      price_cents?: number;
      valid_days?: number | null;
    };
  };
  const rawCreditsTotal = Number(templateRow.config.credits_total ?? 60);
  const rawPriceCents = Number(templateRow.config.price_cents ?? 0);
  const creditsTotal =
    Number.isFinite(rawCreditsTotal) && rawCreditsTotal > 0 ? rawCreditsTotal : 60;
  const priceCents =
    Number.isFinite(rawPriceCents) && rawPriceCents >= 0 ? rawPriceCents : 0;
  const validDays =
    typeof templateRow.config.valid_days === "number" &&
    templateRow.config.valid_days > 0
      ? templateRow.config.valid_days
      : null;

  const { data: packageRow, error: packageError } = await service
    .from("packages")
    .insert({
      tenant_id: franchisee.id,
      name: templateRow.name,
      credits_total: creditsTotal,
      price_cents: priceCents,
      valid_days: validDays,
      active: true,
      category: "pakket",
      visible_in_app: true,
      visible_on_website: false,
    })
    .select("id")
    .single();

  if (packageError) redirectWith(returnTo, "error", packageError.message.slice(0, 200));

  const { error: updateError } = await service
    .from("franchise_template_activations")
    .update({ resulting_package_id: packageRow.id })
    .eq("franchise_template_id", templateId)
    .eq("franchisee_tenant_id", franchisee.id);

  if (updateError) redirectWith(returnTo, "error", updateError.message.slice(0, 200));

  try {
    await auditFranchiseAction(service, {
      actorUserId: user.id,
      tenantId: franchisee.id,
      action: "franchise_template.applied_by_franchisegever",
      targetType: "package",
      targetId: packageRow.id as string,
      payload: {
        template_id: templateId,
        franchise_root_tenant_id: tenant.id,
        franchisee_name: franchisee.name,
      },
    });
  } catch (error) {
    redirectWith(
      returnTo,
      "error",
      error instanceof Error ? error.message.slice(0, 200) : "audit_failed",
    );
  }

  revalidateFranchiseControlPaths();
  redirectWith(returnTo, "template_applied");
}

export async function routeFranchiseLead(formData: FormData) {
  const returnTo = safeReturnPath(formData, "/backoffice/franchise/aandacht");
  const leadId = cleanField(formData, "lead_id", 120);
  const branchId = cleanField(formData, "branch_id", 120);
  if (!leadId || !branchId) redirectWith(returnTo, "error", "missing_fields");

  const { user, tenant, service } = await requireFranchisegeverAction(returnTo);

  const [{ data: lead, error: leadError }, { data: branch, error: branchError }] =
    await Promise.all([
      service
        .from("leads")
        .select("id, tenant_id, full_name, branch_id")
        .eq("id", leadId)
        .maybeSingle(),
      service
        .from("branches")
        .select("id, tenant_id, name, is_active")
        .eq("id", branchId)
        .maybeSingle(),
    ]);

  if (leadError) redirectWith(returnTo, "error", leadError.message.slice(0, 200));
  if (branchError) redirectWith(returnTo, "error", branchError.message.slice(0, 200));
  if (!lead) redirectWith(returnTo, "error", "lead_not_found");
  if (!branch || !branch.is_active) redirectWith(returnTo, "error", "branch_not_found");
  if (lead.branch_id) redirectWith(returnTo, "error", "lead_already_routed");
  if (lead.tenant_id !== branch.tenant_id) {
    redirectWith(returnTo, "error", "lead_branch_tenant_mismatch");
  }

  const { data: leadTenant, error: leadTenantError } = await service
    .from("tenants")
    .select("id, parent_tenant_id, name")
    .eq("id", lead.tenant_id)
    .maybeSingle();
  if (leadTenantError) {
    redirectWith(returnTo, "error", leadTenantError.message.slice(0, 200));
  }
  if (
    !leadTenant ||
    (leadTenant.id !== tenant.id && leadTenant.parent_tenant_id !== tenant.id)
  ) {
    redirectWith(returnTo, "error", "lead_not_in_network");
  }

  if (leadTenant.id !== tenant.id) {
    let leadDelegation: Awaited<ReturnType<typeof loadDelegation>>;
    try {
      leadDelegation = await loadDelegation(service, tenant.id, leadTenant.id as string);
    } catch (error) {
      redirectWith(
        returnTo,
        "error",
        error instanceof Error ? error.message.slice(0, 200) : "delegation_load_failed",
      );
    }
    if (!leadDelegation?.can_manage_leads) {
      redirectWith(returnTo, "error", "lead_delegation_required");
    }
  }

  const { error: updateError } = await service
    .from("leads")
    .update({ branch_id: branch.id })
    .eq("id", lead.id)
    .eq("tenant_id", lead.tenant_id);
  if (updateError) redirectWith(returnTo, "error", updateError.message.slice(0, 200));

  const { error: eventError } = await service.from("lead_events").insert({
    lead_id: lead.id,
    tenant_id: lead.tenant_id,
    actor_user_id: user.id,
    event_type: "assigned",
    payload: {
      action: "franchise_route_to_branch",
      branch_id: branch.id,
      branch_name: branch.name,
      franchise_root_tenant_id: tenant.id,
    },
  });
  if (eventError) redirectWith(returnTo, "error", eventError.message.slice(0, 200));

  try {
    await auditFranchiseAction(service, {
      actorUserId: user.id,
      tenantId: lead.tenant_id as string,
      action: "franchise.lead_routed",
      targetType: "lead",
      targetId: lead.id as string,
      payload: {
        branch_id: branch.id,
        branch_name: branch.name,
        franchise_root_tenant_id: tenant.id,
      },
    });
  } catch (error) {
    redirectWith(
      returnTo,
      "error",
      error instanceof Error ? error.message.slice(0, 200) : "audit_failed",
    );
  }

  revalidateFranchiseControlPaths();
  revalidatePath(`/backoffice/leads/${lead.id}`);
  redirectWith(returnTo, "lead_routed");
}

export async function createFranchiseBenchmarkTask(formData: FormData) {
  const returnTo = safeReturnPath(formData, "/backoffice/franchise/aandacht");
  const franchiseeTenantId = cleanField(formData, "franchisee_tenant_id", 120);
  if (!franchiseeTenantId) redirectWith(returnTo, "error", "missing_fields");

  const { user, tenant, service } = await requireFranchisegeverAction(returnTo);
  const franchisee = await loadFranchiseeOrRedirect(
    service,
    tenant.id,
    franchiseeTenantId,
    returnTo,
  );

  const followUpRoute = cleanField(formData, "follow_up_route", 80);
  const attentionPriority = cleanField(formData, "attention_priority", 40);
  const title =
    cleanField(formData, "title", 180) ||
    `Franchise opvolging: ${franchisee.name}`;
  const description =
    cleanField(formData, "description", 1600) ||
    "Benchmarksignaal vraagt centrale opvolging.";

  try {
    const taskTarget = await ensureTaskColumnForDepartment(
      service,
      tenant.id,
      user.id,
      departmentForFollowUpRoute(followUpRoute),
    );
    const { error } = await service.rpc("create_task", {
      p_tenant_id: tenant.id,
      p_actor: user.id,
      p_board_id: taskTarget.boardId,
      p_column_id: taskTarget.columnId,
      p_title: title,
      p_description: `${description}\n\nFranchisee: ${franchisee.name}`,
      p_priority: taskPriorityForFranchisePriority(attentionPriority),
      p_due_date: cleanField(formData, "due_date", 10) || null,
      p_assignee_user_id: null,
      p_department_id: null,
    });
    if (error) throw new Error(error.message);

    await auditFranchiseAction(service, {
      actorUserId: user.id,
      tenantId: tenant.id,
      action: "franchise.benchmark_task_created",
      targetType: "franchisee_tenant",
      targetId: franchisee.id,
      payload: {
        franchisee_name: franchisee.name,
        follow_up_route: followUpRoute,
        attention_priority: attentionPriority,
      },
    });
  } catch (error) {
    redirectWith(
      returnTo,
      "error",
      error instanceof Error ? error.message.slice(0, 200) : "task_create_failed",
    );
  }

  revalidateFranchiseControlPaths();
  revalidatePath("/backoffice/taken");
  redirectWith(returnTo, "benchmark_task_created");
}

// ─────────────────────────────────────────────────────────────────────────────
// Lead routing
// ─────────────────────────────────────────────────────────────────────────────

export async function routeLeadToBranch(formData: FormData) {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "franchise_admin",
  ]);

  const lead_id   = String(formData.get("lead_id") ?? "").trim();
  const branch_id = String(formData.get("branch_id") ?? "").trim();

  if (!lead_id || !branch_id) {
    redirect(`/backoffice/leads/${lead_id}?error=missing_fields`);
  }

  const service = createServiceRoleClient();
  const snapshot = await loadTenantEntitlementSnapshot(service, tenant.id);
  if (!canManageExistingBranches(snapshot)) {
    redirectFeatureRequired(
      "/backoffice/leads",
      snapshot.featureAccess.multi_branch.requiredPlan,
    );
  }
  const { error } = await service.rpc("route_lead_to_branch", {
    p_lead_id:   lead_id,
    p_branch_id: branch_id,
    p_actor:     user.id,
  });

  if (error) {
    redirect(
      `/backoffice/leads/${lead_id}?error=` +
        encodeURIComponent(error.message.slice(0, 200)),
    );
  }

  revalidatePath(`/backoffice/leads/${lead_id}`);
  redirect(`/backoffice/leads/${lead_id}?routed=1`);
}
