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
import { benchmarkSignalKey } from "@/lib/franchise/benchmark-actions";
import {
  FRANCHISE_BENCHMARK_METRICS,
  type FranchiseBenchmarkMetricKey,
} from "@/lib/franchise/command-center";

function redirectPlanRequired(path: string, plan: keyof typeof PLAN_LABELS) {
  redirect(`${path}?error=plan_required&plan=${plan}`);
}

function redirectFeatureRequired(
  path: string,
  requiredPlan: keyof typeof PLAN_LABELS,
) {
  redirectPlanRequired(path, requiredPlan);
}

const FRANCHISE_REVALIDATE_PATHS = [
  "/backoffice/franchise",
  "/backoffice/franchise/aandacht",
  "/backoffice/franchise/delegaties",
  "/backoffice/franchise/governance",
  "/backoffice/franchise/planning",
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
  return String(formData.get(key) ?? "")
    .trim()
    .slice(0, max);
}

function cleanOptionalField(formData: FormData, key: string, max = 240) {
  const value = cleanField(formData, key, max);
  return value.length > 0 ? value : null;
}

function parseScopeRefs(formData: FormData) {
  return cleanField(formData, "scope_refs", 1200)
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 40);
}

function parseDateBoundary(value: string | null, boundary: "start" | "end") {
  if (!value) return null;
  const suffix = boundary === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z";
  const date = new Date(`${value}${suffix}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parsePositiveNumber(formData: FormData, key: string) {
  const raw = cleanField(formData, key, 40).replace(",", ".");
  if (!raw) return null;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseOptionalNumber(formData: FormData, key: string) {
  const raw = cleanField(formData, key, 40).replace(",", ".");
  if (!raw) return null;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : null;
}

const BENCHMARK_METRIC_UNITS = new Map(
  FRANCHISE_BENCHMARK_METRICS.map((metric) => [metric.key, metric.unit]),
);

function isBenchmarkMetricKey(value: string): value is FranchiseBenchmarkMetricKey {
  return BENCHMARK_METRIC_UNITS.has(value as FranchiseBenchmarkMetricKey);
}

function parseBenchmarkTargetValue(formData: FormData, unit: string) {
  const value = parsePositiveNumber(formData, "target_value");
  if (value === null) return null;
  return unit === "euro_cents" ? Math.round(value * 100) : value;
}

function parseBenchmarkMetricValue(formData: FormData, key: string, unit: string) {
  const value = parseOptionalNumber(formData, key);
  if (value === null) return null;
  return unit === "euro_cents" ? Math.round(value * 100) : value;
}

function delegationIsActive(
  delegation: {
    revoked_at?: string | null;
    valid_from?: string | null;
    valid_until?: string | null;
  } | null,
) {
  if (!delegation || delegation.revoked_at) return false;
  const now = Date.now();
  const validFrom = delegation.valid_from
    ? Date.parse(delegation.valid_from)
    : null;
  const validUntil = delegation.valid_until
    ? Date.parse(delegation.valid_until)
    : null;
  if (validFrom && Number.isFinite(validFrom) && validFrom > now) return false;
  if (validUntil && Number.isFinite(validUntil) && validUntil <= now)
    return false;
  return true;
}

function safeReturnPath(formData: FormData, fallback: string): string {
  const submitted = cleanField(formData, "return_to", 300);
  if (
    submitted.startsWith("/backoffice/franchise") ||
    submitted.startsWith("/backoffice/leads") ||
    submitted.startsWith("/backoffice/taken")
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
  const delegation = data as {
    revoked_at?: string | null;
    valid_from?: string | null;
    valid_until?: string | null;
    can_manage_planning: boolean;
    can_manage_leads: boolean;
    can_manage_templates: boolean;
    can_manage_fleet: boolean;
    can_manage_instructor_availability: boolean;
  } | null;
  return delegationIsActive(delegation) ? delegation : null;
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

function taskPriorityForFranchisePriority(priority: string) {
  if (priority === "hoog") return "high";
  if (priority === "middel") return "normal";
  if (priority === "laag") return "low";
  return "normal";
}

async function loadBenchmarkActionForTenantOrRedirect(
  service: ReturnType<typeof createServiceRoleClient>,
  actionId: string,
  tenantId: string,
  returnTo: string,
) {
  const { data: action, error } = await service
    .from("franchise_benchmark_actions")
    .select(
      "id, franchise_root_tenant_id, franchisee_tenant_id, central_task_id, local_task_id, status, title, target_metric_key",
    )
    .eq("id", actionId)
    .maybeSingle();

  if (error) redirectWith(returnTo, "error", error.message.slice(0, 200));
  if (
    !action ||
    ![action.franchise_root_tenant_id, action.franchisee_tenant_id].includes(
      tenantId,
    )
  ) {
    redirectWith(returnTo, "error", "benchmark_action_not_found");
  }
  return action;
}

async function auditBenchmarkCoachingAction(
  service: ReturnType<typeof createServiceRoleClient>,
  input: {
    actorUserId: string;
    action: string;
    targetId: string;
    franchiseRootTenantId: string;
    franchiseeTenantId: string;
    payload: Record<string, unknown>;
  },
) {
  await auditFranchiseAction(service, {
    actorUserId: input.actorUserId,
    tenantId: input.franchiseRootTenantId,
    action: input.action,
    targetType: "franchise_benchmark_action",
    targetId: input.targetId,
    payload: {
      ...input.payload,
      franchisee_tenant_id: input.franchiseeTenantId,
    },
  });
  await auditFranchiseAction(service, {
    actorUserId: input.actorUserId,
    tenantId: input.franchiseeTenantId,
    action: input.action,
    targetType: "franchise_benchmark_action",
    targetId: input.targetId,
    payload: {
      ...input.payload,
      franchise_root_tenant_id: input.franchiseRootTenantId,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform admin: link / unlink franchisee ↔ franchisegever
// ─────────────────────────────────────────────────────────────────────────────

export async function setFranchiseeParent(formData: FormData) {
  const user = await requirePlatformAdmin();
  const franchisee_id = String(formData.get("franchisee_id") ?? "").trim();
  const franchisegever_id = String(
    formData.get("franchisegever_id") ?? "",
  ).trim();

  if (!franchisee_id) {
    redirect(`/admin/tenants/${franchisee_id}?error=missing_fields`);
  }

  const service = createServiceRoleClient();
  const { error } = await service.rpc("set_franchisee_parent", {
    p_franchisee_tenant_id: franchisee_id,
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

  const name = String(formData.get("name") ?? "").trim();
  const credits_total = parseInt(
    String(formData.get("credits_total") ?? ""),
    10,
  );
  const price_cents = Math.round(
    parseFloat(
      String(formData.get("price_excl_vat_euros") ?? "0").replace(",", "."),
    ) * 100,
  );
  const valid_days_raw = String(formData.get("valid_days") ?? "").trim();
  const valid_days = valid_days_raw ? parseInt(valid_days_raw, 10) : null;
  const description =
    String(formData.get("description") ?? "").trim() || undefined;

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
    p_type: "package",
    p_name: name,
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
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "franchise_admin",
  ]);

  const template_id = String(formData.get("template_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim() || null;
  const is_active_raw = formData.get("is_active");
  const is_active = is_active_raw !== null ? is_active_raw === "true" : null;

  if (!template_id)
    redirect("/backoffice/franchise/templates?error=missing_fields");

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
    p_name: name,
    p_config: null,
    p_is_active: is_active,
    p_actor: user.id,
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

  const template_id = String(formData.get("template_id") ?? "").trim();
  const franchisee_tenant_id = String(
    formData.get("franchisee_tenant_id") ?? "",
  ).trim();

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
    p_template_id: template_id,
    p_franchisee_tenant_id: franchisee_tenant_id,
    p_actor: user.id,
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
    p_template_id: template_id,
    p_franchisee_tenant_id: tenant.id,
    p_actor: user.id,
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
  const scopeType = cleanField(formData, "scope_type", 40) || "tenant";
  if (
    !["tenant", "branches", "rayons", "capabilities", "custom"].includes(
      scopeType,
    )
  ) {
    redirectWith(returnTo, "error", "invalid_scope");
  }
  const validFrom =
    parseDateBoundary(
      cleanOptionalField(formData, "valid_from", 10),
      "start",
    ) ?? new Date().toISOString();
  const validUntil = parseDateBoundary(
    cleanOptionalField(formData, "valid_until", 10),
    "end",
  );
  if (validUntil && Date.parse(validUntil) <= Date.parse(validFrom)) {
    redirectWith(returnTo, "error", "invalid_validity_window");
  }
  const grantReason = cleanOptionalField(formData, "grant_reason", 500);
  if (!grantReason) redirectWith(returnTo, "error", "grant_reason_required");
  const scopeRefs = parseScopeRefs(formData);

  const { error } = await service
    .from("franchise_operations_permissions")
    .upsert(
      {
        franchise_root_tenant_id: tenant.id,
        franchisee_tenant_id: franchisee.id,
        scope_type: scopeType,
        scope_refs: scopeRefs,
        valid_from: validFrom,
        valid_until: validUntil,
        grant_reason: grantReason,
        granted_by: user.id,
        revoked_at: null,
        revoked_by: null,
        revoke_reason: null,
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
  const revokeReason = cleanOptionalField(formData, "revoke_reason", 500);
  if (!revokeReason) redirectWith(returnTo, "error", "revoke_reason_required");

  const { data: revoked, error } = await service
    .from("franchise_operations_permissions")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: user.id,
      revoke_reason: revokeReason,
    })
    .eq("franchise_root_tenant_id", tenant.id)
    .eq("franchisee_tenant_id", franchisee.id)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();

  if (error) redirectWith(returnTo, "error", error.message.slice(0, 200));
  if (!revoked) redirectWith(returnTo, "error", "active_delegation_not_found");

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

  const { error } = await service.rpc(
    "apply_franchise_template_as_franchisegever",
    {
      p_template_id: templateId,
      p_franchisee_tenant_id: franchisee.id,
      p_actor: user.id,
    },
  );

  if (error) redirectWith(returnTo, "error", error.message.slice(0, 200));

  revalidateFranchiseControlPaths();
  redirectWith(returnTo, "template_applied");
}

export async function createFranchiseTemplateRolloutBatch(formData: FormData) {
  const returnTo = safeReturnPath(formData, "/backoffice/franchise/templates");
  const templateId = cleanField(formData, "template_id", 120);
  const mode = cleanField(formData, "mode", 40);
  if (!templateId || !["dry_run", "apply"].includes(mode)) {
    redirectWith(returnTo, "error", "missing_fields");
  }

  const { user, tenant, service } = await requireFranchisegeverAction(returnTo);
  const { data: template, error: templateError } = await service
    .from("franchise_templates")
    .select("id, tenant_id, name, is_active")
    .eq("id", templateId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (templateError) redirectWith(returnTo, "error", templateError.message.slice(0, 200));
  if (!template || !template.is_active) redirectWith(returnTo, "error", "active_template_required");

  const [
    { data: franchisees, error: franchiseeError },
    { data: permissions, error: permissionError },
  ] = await Promise.all([
    service
      .from("tenants")
      .select("id, name")
      .eq("parent_tenant_id", tenant.id)
      .order("name"),
    service
      .from("franchise_operations_permissions")
      .select("franchisee_tenant_id, revoked_at, valid_from, valid_until, can_manage_templates")
      .eq("franchise_root_tenant_id", tenant.id),
  ]);

  if (franchiseeError) redirectWith(returnTo, "error", franchiseeError.message.slice(0, 200));
  if (permissionError) redirectWith(returnTo, "error", permissionError.message.slice(0, 200));

  const permissionByTenant = new Map(
    ((permissions ?? []) as Array<{
      franchisee_tenant_id: string;
      revoked_at: string | null;
      valid_from: string | null;
      valid_until: string | null;
      can_manage_templates: boolean;
    }>).map((permission) => [permission.franchisee_tenant_id, permission]),
  );
  const now = Date.now();
  const franchiseeRows = (franchisees ?? []) as Array<{ id: string; name: string }>;
  const rolloutRows = franchiseeRows.map((franchisee) => {
    const permission = permissionByTenant.get(franchisee.id);
    const validFrom = permission?.valid_from ? Date.parse(permission.valid_from) : null;
    const validUntil = permission?.valid_until ? Date.parse(permission.valid_until) : null;
    const delegated = Boolean(
      permission?.can_manage_templates &&
        !permission.revoked_at &&
        (!validFrom || validFrom <= now) &&
        (!validUntil || validUntil > now),
    );
    return { ...franchisee, delegated };
  });

  const { data: batch, error: batchError } = await service
    .from("franchise_template_rollout_batches")
    .insert({
      franchise_root_tenant_id: tenant.id,
      template_id: template.id,
      mode,
      status: "running",
      requested_by: user.id,
      summary: {
        total: rolloutRows.length,
        delegated: rolloutRows.filter((row) => row.delegated).length,
        skipped: rolloutRows.filter((row) => !row.delegated).length,
      },
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    redirectWith(returnTo, "error", batchError?.message.slice(0, 200) ?? "batch_create_failed");
  }

  let applied = 0;
  let dryRun = 0;
  let skipped = 0;
  let failed = 0;
  const rollbackLog: Array<Record<string, unknown>> = [];

  async function insertRolloutItem(payload: Record<string, unknown>) {
    const { error } = await service
      .from("franchise_template_rollout_items")
      .insert(payload);
    if (error) throw new Error(error.message);
  }

  try {
    for (const franchisee of rolloutRows) {
      if (!franchisee.delegated) {
        skipped += 1;
        await insertRolloutItem({
          batch_id: batch.id,
          franchisee_tenant_id: franchisee.id,
          action: "skipped",
          status: "skipped",
          message: "Template-delegatie ontbreekt of is niet actief.",
        });
        continue;
      }

      if (mode === "dry_run") {
        dryRun += 1;
        await insertRolloutItem({
          batch_id: batch.id,
          franchisee_tenant_id: franchisee.id,
          action: "dry_run",
          status: "dry_run",
          message: "Klaar voor toepassen op basis van actieve template-delegatie.",
        });
        continue;
      }

      const { data: activationId, error } = await service.rpc(
        "apply_franchise_template_as_franchisegever",
        {
          p_template_id: template.id,
          p_franchisee_tenant_id: franchisee.id,
          p_actor: user.id,
        },
      );

      if (error) {
        failed += 1;
        await insertRolloutItem({
          batch_id: batch.id,
          franchisee_tenant_id: franchisee.id,
          action: "failed",
          status: "failed",
          message: error.message.slice(0, 500),
        });
        continue;
      }

      applied += 1;
      const rollbackPayload = {
        template_id: template.id,
        activation_id: activationId,
        franchisee_tenant_id: franchisee.id,
        note: "Rollback vereist expliciete pakket-/activatiebeoordeling; deze batch verwijdert niets automatisch.",
      };
      rollbackLog.push(rollbackPayload);
      await insertRolloutItem({
        batch_id: batch.id,
        franchisee_tenant_id: franchisee.id,
        action: "applied",
        status: "applied",
        message: "Template toegepast via centrale franchisegever-flow.",
        resulting_activation_id: activationId,
        rollback_payload: rollbackPayload,
      });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 200) : "batch_item_failed";
    await service
      .from("franchise_template_rollout_batches")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        summary: {
          total: rolloutRows.length,
          delegated: rolloutRows.filter((row) => row.delegated).length,
          dry_run: dryRun,
          applied,
          skipped,
          failed: failed + 1,
          error: message,
        },
        rollback_log: rollbackLog,
      })
      .eq("id", batch.id);
    redirectWith(returnTo, "error", message);
  }

  const finalStatus = failed > 0 && applied === 0 && dryRun === 0 ? "failed" : "completed";
  await service
    .from("franchise_template_rollout_batches")
    .update({
      status: finalStatus,
      completed_at: new Date().toISOString(),
      summary: {
        total: rolloutRows.length,
        delegated: rolloutRows.filter((row) => row.delegated).length,
        dry_run: dryRun,
        applied,
        skipped,
        failed,
      },
      rollback_log: rollbackLog,
    })
    .eq("id", batch.id);

  await auditFranchiseAction(service, {
    actorUserId: user.id,
    tenantId: tenant.id,
    action:
      mode === "dry_run"
        ? "franchise.template_rollout_dry_run"
        : "franchise.template_rollout_applied",
    targetType: "franchise_template_rollout_batch",
    targetId: batch.id,
    payload: {
      template_id: template.id,
      template_name: template.name,
      mode,
      applied,
      dry_run: dryRun,
      skipped,
      failed,
    },
  });

  revalidateFranchiseControlPaths();
  redirectWith(returnTo, mode === "dry_run" ? "template_rollout_dry_run" : "template_rollout_applied");
}

export async function upsertFranchiseBenchmarkTarget(formData: FormData) {
  const returnTo = safeReturnPath(formData, "/backoffice/franchise/aandacht");
  const franchiseeTenantId = cleanField(formData, "franchisee_tenant_id", 120);
  const metricKey = cleanField(formData, "metric_key", 80);
  if (!franchiseeTenantId || !isBenchmarkMetricKey(metricKey)) {
    redirectWith(returnTo, "error", "missing_fields");
  }

  const unit = BENCHMARK_METRIC_UNITS.get(metricKey) ?? "percent";
  const targetValue = parseBenchmarkTargetValue(formData, unit);
  if (targetValue === null) redirectWith(returnTo, "error", "invalid_target");

  const { user, tenant, service } = await requireFranchisegeverAction(returnTo);
  const franchisee = await loadFranchiseeOrRedirect(
    service,
    tenant.id,
    franchiseeTenantId,
    returnTo,
  );

  const { data: target, error } = await service
    .from("franchise_benchmark_targets")
    .upsert(
      {
        franchise_root_tenant_id: tenant.id,
        franchisee_tenant_id: franchisee.id,
        metric_key: metricKey,
        target_value: targetValue,
        unit,
        status: "active",
        due_date: cleanField(formData, "due_date", 10) || null,
        reason: cleanOptionalField(formData, "reason", 700),
        created_by: user.id,
        updated_by: user.id,
      },
      {
        onConflict: "franchise_root_tenant_id,franchisee_tenant_id,metric_key",
      },
    )
    .select("id")
    .single();

  if (error || !target) {
    redirectWith(returnTo, "error", error?.message.slice(0, 200) ?? "target_save_failed");
  }

  await auditFranchiseAction(service, {
    actorUserId: user.id,
    tenantId: tenant.id,
    action: "franchise.benchmark_target_upserted",
    targetType: "franchise_benchmark_target",
    targetId: target.id,
    payload: {
      franchisee_tenant_id: franchisee.id,
      metric_key: metricKey,
      target_value: targetValue,
      unit,
    },
  });

  revalidateFranchiseControlPaths();
  redirectWith(returnTo, "benchmark_target_saved");
}

export async function routeFranchiseLead(formData: FormData) {
  const returnTo = safeReturnPath(formData, "/backoffice/franchise/aandacht");
  const leadId = cleanField(formData, "lead_id", 120);
  const branchId = cleanField(formData, "branch_id", 120);
  if (!leadId || !branchId) redirectWith(returnTo, "error", "missing_fields");

  const { user, tenant, service } = await requireFranchisegeverAction(returnTo);

  const { error } = await service.rpc("route_franchise_lead_to_owner", {
    p_franchise_root_tenant_id: tenant.id,
    p_lead_id: leadId,
    p_branch_id: branchId,
    p_actor: user.id,
  });
  if (error) redirectWith(returnTo, "error", error.message.slice(0, 200));

  revalidateFranchiseControlPaths();
  revalidatePath(`/backoffice/leads/${leadId}`);
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
  const signalKey =
    cleanField(formData, "signal_key", 180) ||
    benchmarkSignalKey(franchisee.id, followUpRoute, attentionPriority);

  try {
    const { error } = await service.rpc("create_franchise_benchmark_action", {
      p_franchise_root_tenant_id: tenant.id,
      p_franchisee_tenant_id: franchisee.id,
      p_actor: user.id,
      p_title: title,
      p_description: `${description}\n\nFranchisee: ${franchisee.name}`,
      p_priority: taskPriorityForFranchisePriority(attentionPriority),
      p_due_date: cleanField(formData, "due_date", 10) || null,
      p_follow_up_route: followUpRoute,
      p_attention_priority: attentionPriority,
      p_signal_key: signalKey,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirectWith(
      returnTo,
      "error",
      error instanceof Error
        ? error.message.slice(0, 200)
        : "task_create_failed",
    );
  }

  revalidateFranchiseControlPaths();
  revalidatePath("/backoffice/taken");
  redirectWith(returnTo, "benchmark_task_created");
}

export async function saveFranchiseBenchmarkCoachingPlan(formData: FormData) {
  const returnTo = safeReturnPath(formData, "/backoffice/franchise/aandacht");
  const actionId = cleanField(formData, "action_id", 120);
  if (!actionId) redirectWith(returnTo, "error", "missing_fields");

  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "franchise_admin",
    "branch_manager",
    "planner",
    "admin_staff",
    "marketing",
  ]);
  const service = createServiceRoleClient();
  const action = await loadBenchmarkActionForTenantOrRedirect(
    service,
    actionId,
    tenant.id,
    returnTo,
  );
  if (["completed", "declined", "cancelled"].includes(action.status as string)) {
    redirectWith(returnTo, "error", "benchmark_action_closed");
  }

  const metricKey = cleanField(formData, "target_metric_key", 80);
  const unit =
    metricKey && isBenchmarkMetricKey(metricKey)
      ? BENCHMARK_METRIC_UNITS.get(metricKey)
      : null;
  if (metricKey && !unit) redirectWith(returnTo, "error", "invalid_metric");

  const patch: Record<string, unknown> = {
    goal: cleanOptionalField(formData, "goal", 1200),
    action_plan: cleanOptionalField(formData, "action_plan", 4000),
    coaching_owner_label:
      cleanField(formData, "coaching_owner_label", 160) ||
      "Franchise manager",
    target_metric_key: metricKey || null,
    target_due_date: cleanField(formData, "target_due_date", 10) || null,
    next_check_in_date: cleanField(formData, "next_check_in_date", 10) || null,
    result_status: cleanField(formData, "result_status", 40) || "open",
  };
  if (
    ![
      "open",
      "on_track",
      "at_risk",
      "achieved",
      "not_achieved",
      "cancelled",
    ].includes(String(patch.result_status))
  ) {
    redirectWith(returnTo, "error", "invalid_result_status");
  }
  patch.target_value = unit
    ? parseBenchmarkMetricValue(formData, "target_value", unit)
    : null;
  patch.baseline_value = unit
    ? parseBenchmarkMetricValue(formData, "baseline_value", unit)
    : null;
  patch.latest_value = unit
    ? parseBenchmarkMetricValue(formData, "latest_value", unit)
    : null;
  if (action.status === "accepted") patch.status = "in_progress";

  const { error } = await service
    .from("franchise_benchmark_actions")
    .update(patch)
    .eq("id", action.id);
  if (error) redirectWith(returnTo, "error", error.message.slice(0, 200));

  await auditBenchmarkCoachingAction(service, {
    actorUserId: user.id,
    action: "franchise.benchmark_coaching_plan_saved",
    targetId: action.id,
    franchiseRootTenantId: action.franchise_root_tenant_id,
    franchiseeTenantId: action.franchisee_tenant_id,
    payload: {
      target_metric_key: patch.target_metric_key,
      target_value: patch.target_value,
      result_status: patch.result_status,
    },
  });

  revalidatePath("/backoffice/taken");
  revalidateFranchiseControlPaths();
  redirectWith(returnTo, "benchmark_coaching_plan_saved");
}

export async function addFranchiseBenchmarkCheckIn(formData: FormData) {
  const returnTo = safeReturnPath(formData, "/backoffice/franchise/aandacht");
  const actionId = cleanField(formData, "action_id", 120);
  const note = cleanField(formData, "note", 4000);
  if (!actionId || !note) redirectWith(returnTo, "error", "missing_fields");

  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "franchise_admin",
    "branch_manager",
    "planner",
    "admin_staff",
    "marketing",
  ]);
  const service = createServiceRoleClient();
  const action = await loadBenchmarkActionForTenantOrRedirect(
    service,
    actionId,
    tenant.id,
    returnTo,
  );
  if (["completed", "declined", "cancelled"].includes(action.status as string)) {
    redirectWith(returnTo, "error", "benchmark_action_closed");
  }

  const checkinType =
    tenant.id === action.franchise_root_tenant_id
      ? "central"
      : tenant.id === action.franchisee_tenant_id
        ? "local"
        : "joint";
  const status = cleanField(formData, "status", 40) || "done";
  if (!["planned", "done", "blocked"].includes(status)) {
    redirectWith(returnTo, "error", "invalid_checkin_status");
  }
  const metricKey = cleanField(formData, "target_metric_key", 80);
  const actionMetric = String(action.target_metric_key ?? "");
  const unit =
    metricKey && isBenchmarkMetricKey(metricKey)
      ? BENCHMARK_METRIC_UNITS.get(metricKey)
      : actionMetric && isBenchmarkMetricKey(actionMetric)
        ? BENCHMARK_METRIC_UNITS.get(actionMetric)
        : null;
  const measuredValue = unit
    ? parseBenchmarkMetricValue(formData, "measured_value", unit)
    : parseOptionalNumber(formData, "measured_value");
  const nextCheckInDate = cleanField(formData, "next_check_in_date", 10) || null;

  const { data: checkin, error } = await service
    .from("franchise_benchmark_checkins")
    .insert({
      action_id: action.id,
      franchise_root_tenant_id: action.franchise_root_tenant_id,
      franchisee_tenant_id: action.franchisee_tenant_id,
      checkin_type: checkinType,
      status,
      owner_label:
        cleanField(formData, "owner_label", 160) || "Franchise manager",
      note,
      measured_value: measuredValue,
      next_check_in_date: nextCheckInDate,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !checkin) {
    redirectWith(
      returnTo,
      "error",
      error?.message.slice(0, 200) ?? "checkin_failed",
    );
  }

  const actionPatch: Record<string, unknown> = {
    next_check_in_date: nextCheckInDate,
    latest_value: measuredValue,
    result_status:
      status === "blocked"
        ? "at_risk"
        : cleanField(formData, "result_status", 40) || "on_track",
  };
  if (!["created", "completed", "declined", "cancelled"].includes(action.status as string)) {
    actionPatch.status = "in_progress";
  }
  const { error: updateError } = await service
    .from("franchise_benchmark_actions")
    .update(actionPatch)
    .eq("id", action.id);
  if (updateError) {
    redirectWith(returnTo, "error", updateError.message.slice(0, 200));
  }

  await auditBenchmarkCoachingAction(service, {
    actorUserId: user.id,
    action: "franchise.benchmark_checkin_added",
    targetId: action.id,
    franchiseRootTenantId: action.franchise_root_tenant_id,
    franchiseeTenantId: action.franchisee_tenant_id,
    payload: {
      checkin_id: checkin.id,
      checkin_type: checkinType,
      status,
      measured_value: measuredValue,
      next_check_in_date: nextCheckInDate,
    },
  });

  revalidatePath("/backoffice/taken");
  revalidateFranchiseControlPaths();
  redirectWith(returnTo, "benchmark_checkin_added");
}

export async function recordFranchiseBenchmarkResult(formData: FormData) {
  const returnTo = safeReturnPath(formData, "/backoffice/franchise/aandacht");
  const actionId = cleanField(formData, "action_id", 120);
  const resultSummary = cleanField(formData, "result_summary", 4000);
  if (!actionId || !resultSummary) {
    redirectWith(returnTo, "error", "missing_fields");
  }

  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "franchise_admin",
    "branch_manager",
    "planner",
    "admin_staff",
    "marketing",
  ]);
  const service = createServiceRoleClient();
  const action = await loadBenchmarkActionForTenantOrRedirect(
    service,
    actionId,
    tenant.id,
    returnTo,
  );
  if (["completed", "declined", "cancelled"].includes(action.status as string)) {
    redirectWith(returnTo, "error", "benchmark_action_closed");
  }

  const resultStatus = cleanField(formData, "result_status", 40) || "achieved";
  if (!["achieved", "not_achieved", "cancelled"].includes(resultStatus)) {
    redirectWith(returnTo, "error", "invalid_result_status");
  }
  const actionStatus = resultStatus === "cancelled" ? "cancelled" : "completed";
  const metricKey = String(action.target_metric_key ?? "");
  const unit =
    metricKey && isBenchmarkMetricKey(metricKey)
      ? BENCHMARK_METRIC_UNITS.get(metricKey)
      : null;
  const resultValue = unit
    ? parseBenchmarkMetricValue(formData, "result_value", unit)
    : parseOptionalNumber(formData, "result_value");

  const { error } = await service
    .from("franchise_benchmark_actions")
    .update({
      status: actionStatus,
      latest_value: resultValue,
      result_status: resultStatus,
      result_summary: resultSummary,
      result_recorded_by: user.id,
      result_recorded_at: new Date().toISOString(),
      completed_by: actionStatus === "completed" ? user.id : null,
      completed_at: actionStatus === "completed" ? new Date().toISOString() : null,
      cancelled_by: actionStatus === "cancelled" ? user.id : null,
      cancelled_at: actionStatus === "cancelled" ? new Date().toISOString() : null,
      resolution: resultSummary,
    })
    .eq("id", action.id);
  if (error) redirectWith(returnTo, "error", error.message.slice(0, 200));

  const taskIds = [action.central_task_id, action.local_task_id].filter(Boolean);
  if (taskIds.length > 0) {
    await service
      .from("tasks")
      .update({ archived_at: new Date().toISOString() })
      .in("id", taskIds);
  }

  await auditBenchmarkCoachingAction(service, {
    actorUserId: user.id,
    action: "franchise.benchmark_result_recorded",
    targetId: action.id,
    franchiseRootTenantId: action.franchise_root_tenant_id,
    franchiseeTenantId: action.franchisee_tenant_id,
    payload: {
      result_status: resultStatus,
      result_value: resultValue,
      result_summary: resultSummary,
    },
  });

  revalidatePath("/backoffice/taken");
  revalidateFranchiseControlPaths();
  redirectWith(returnTo, "benchmark_result_recorded");
}

export async function createFranchisePlanningAction(formData: FormData) {
  const returnTo = safeReturnPath(formData, "/backoffice/franchise/planning");
  const franchiseeTenantId = cleanField(formData, "franchisee_tenant_id", 120);
  const actionType = cleanField(formData, "action_type", 80);
  if (!franchiseeTenantId || !actionType) {
    redirectWith(returnTo, "error", "missing_fields");
  }

  const { user, tenant, service } = await requireFranchisegeverAction(returnTo);
  const franchisee = await loadFranchiseeOrRedirect(
    service,
    tenant.id,
    franchiseeTenantId,
    returnTo,
  );

  const title =
    cleanField(formData, "title", 180) ||
    `Franchise planning: ${franchisee.name}`;
  const description =
    cleanField(formData, "description", 1600) ||
    "Planningsturing vanuit de franchisegever.";

  try {
    const { error } = await service.rpc("create_franchise_planning_action", {
      p_franchise_root_tenant_id: tenant.id,
      p_franchisee_tenant_id: franchisee.id,
      p_actor: user.id,
      p_action_type: actionType,
      p_title: title,
      p_description: description,
      p_priority: taskPriorityForFranchisePriority(
        cleanField(formData, "priority", 40),
      ),
      p_due_date: cleanField(formData, "due_date", 10) || null,
      p_branch_id: cleanField(formData, "branch_id", 120) || null,
      p_instructor_user_id:
        cleanField(formData, "instructor_user_id", 120) || null,
      p_requested_capacity_hours: parsePositiveNumber(
        formData,
        "requested_capacity_hours",
      ),
      p_requested_date: cleanField(formData, "requested_date", 10) || null,
      p_request_key: cleanField(formData, "request_key", 220) || null,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirectWith(
      returnTo,
      "error",
      error instanceof Error
        ? error.message.slice(0, 200)
        : "planning_action_create_failed",
    );
  }

  revalidateFranchiseControlPaths();
  revalidatePath("/backoffice/planning-board");
  revalidatePath("/backoffice/planning-queue");
  redirectWith(returnTo, "planning_action_created");
}

export async function acceptFranchisePlanningAction(formData: FormData) {
  const returnTo = safeReturnPath(formData, "/backoffice/taken");
  const actionId = cleanField(formData, "action_id", 120);
  if (!actionId) redirectWith(returnTo, "error", "missing_fields");

  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "franchise_admin",
    "branch_manager",
    "planner",
    "admin_staff",
    "instructor",
  ]);
  const service = createServiceRoleClient();
  const { error } = await service.rpc("accept_franchise_planning_action", {
    p_action_id: actionId,
    p_franchisee_tenant_id: tenant.id,
    p_actor: user.id,
    p_note: cleanField(formData, "note", 2000) || null,
  });
  if (error) redirectWith(returnTo, "error", error.message.slice(0, 200));

  revalidatePath("/backoffice/taken");
  revalidatePath("/backoffice/planning-board");
  revalidatePath("/backoffice/planning-queue");
  revalidateFranchiseControlPaths();
  redirectWith(returnTo, "planning_accepted");
}

export async function declineFranchisePlanningAction(formData: FormData) {
  const returnTo = safeReturnPath(formData, "/backoffice/taken");
  const actionId = cleanField(formData, "action_id", 120);
  if (!actionId) redirectWith(returnTo, "error", "missing_fields");

  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "franchise_admin",
    "branch_manager",
    "planner",
    "admin_staff",
    "instructor",
  ]);
  const service = createServiceRoleClient();
  const { error } = await service.rpc("decline_franchise_planning_action", {
    p_action_id: actionId,
    p_franchisee_tenant_id: tenant.id,
    p_actor: user.id,
    p_reason: cleanField(formData, "reason", 2000) || null,
  });
  if (error) redirectWith(returnTo, "error", error.message.slice(0, 200));

  revalidatePath("/backoffice/taken");
  revalidateFranchiseControlPaths();
  redirectWith(returnTo, "planning_declined");
}

export async function completeFranchisePlanningAction(formData: FormData) {
  const returnTo = safeReturnPath(formData, "/backoffice/taken");
  const actionId = cleanField(formData, "action_id", 120);
  if (!actionId) redirectWith(returnTo, "error", "missing_fields");

  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "franchise_admin",
    "branch_manager",
    "planner",
    "admin_staff",
    "instructor",
  ]);
  const service = createServiceRoleClient();
  const { error } = await service.rpc("complete_franchise_planning_action", {
    p_action_id: actionId,
    p_franchisee_tenant_id: tenant.id,
    p_actor: user.id,
    p_resolution: cleanField(formData, "resolution", 4000) || null,
  });
  if (error) redirectWith(returnTo, "error", error.message.slice(0, 200));

  revalidatePath("/backoffice/taken");
  revalidatePath("/backoffice/planning-board");
  revalidatePath("/backoffice/planning-queue");
  revalidateFranchiseControlPaths();
  redirectWith(returnTo, "planning_completed");
}

export async function acceptFranchiseBenchmarkAction(formData: FormData) {
  const returnTo = safeReturnPath(formData, "/backoffice/taken");
  const actionId = cleanField(formData, "action_id", 120);
  if (!actionId) redirectWith(returnTo, "error", "missing_fields");

  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "franchise_admin",
    "branch_manager",
    "planner",
    "admin_staff",
    "marketing",
  ]);
  const service = createServiceRoleClient();
  const { error } = await service.rpc("accept_franchise_benchmark_action", {
    p_action_id: actionId,
    p_franchisee_tenant_id: tenant.id,
    p_actor: user.id,
    p_note: cleanField(formData, "note", 2000) || null,
  });
  if (error) redirectWith(returnTo, "error", error.message.slice(0, 200));

  revalidatePath("/backoffice/taken");
  revalidateFranchiseControlPaths();
  redirectWith(returnTo, "benchmark_accepted");
}

export async function declineFranchiseBenchmarkAction(formData: FormData) {
  const returnTo = safeReturnPath(formData, "/backoffice/taken");
  const actionId = cleanField(formData, "action_id", 120);
  if (!actionId) redirectWith(returnTo, "error", "missing_fields");

  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "franchise_admin",
    "branch_manager",
    "planner",
    "admin_staff",
    "marketing",
  ]);
  const service = createServiceRoleClient();
  const { error } = await service.rpc("decline_franchise_benchmark_action", {
    p_action_id: actionId,
    p_franchisee_tenant_id: tenant.id,
    p_actor: user.id,
    p_reason: cleanField(formData, "reason", 2000) || null,
  });
  if (error) redirectWith(returnTo, "error", error.message.slice(0, 200));

  revalidatePath("/backoffice/taken");
  revalidateFranchiseControlPaths();
  redirectWith(returnTo, "benchmark_declined");
}

export async function completeFranchiseBenchmarkAction(formData: FormData) {
  const returnTo = safeReturnPath(formData, "/backoffice/taken");
  const actionId = cleanField(formData, "action_id", 120);
  if (!actionId) redirectWith(returnTo, "error", "missing_fields");

  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "franchise_admin",
    "branch_manager",
    "planner",
    "admin_staff",
    "marketing",
  ]);
  const service = createServiceRoleClient();
  const { error } = await service.rpc("complete_franchise_benchmark_action", {
    p_action_id: actionId,
    p_franchisee_tenant_id: tenant.id,
    p_actor: user.id,
    p_resolution: cleanField(formData, "resolution", 4000) || null,
  });
  if (error) redirectWith(returnTo, "error", error.message.slice(0, 200));

  revalidatePath("/backoffice/taken");
  revalidateFranchiseControlPaths();
  redirectWith(returnTo, "benchmark_completed");
}

// ─────────────────────────────────────────────────────────────────────────────
// Lead routing
// ─────────────────────────────────────────────────────────────────────────────

export async function createFranchisePlaybookProgram(formData: FormData) {
  const returnTo = safeReturnPath(formData, "/backoffice/franchise/playbook");
  const name = cleanField(formData, "name", 180);
  const objective = cleanField(formData, "objective", 1200);
  const category = cleanField(formData, "category", 40) || "operations";
  const ownerLabel =
    cleanField(formData, "owner_label", 120) || "Franchise manager";
  const cadence = cleanField(formData, "cadence", 80) || "eenmalig";
  const targetAudience =
    cleanField(formData, "target_audience", 160) || "Franchisees";
  const defaultDueDaysRaw = Number.parseInt(
    cleanField(formData, "default_due_days", 12) || "30",
    10,
  );
  const defaultDueDays =
    Number.isFinite(defaultDueDaysRaw) && defaultDueDaysRaw > 0
      ? Math.min(defaultDueDaysRaw, 365)
      : 30;
  const status = cleanField(formData, "status", 40) || "draft";

  if (!name || !objective) redirectWith(returnTo, "error", "missing_fields");
  if (
    ![
      "operations",
      "planning",
      "quality",
      "sales",
      "finance",
      "training",
      "compliance",
    ].includes(category)
  ) {
    redirectWith(returnTo, "error", "invalid_category");
  }
  if (!["draft", "active", "archived"].includes(status)) {
    redirectWith(returnTo, "error", "invalid_status");
  }

  const { user, tenant, service } = await requireFranchisegeverAction(returnTo);
  const { data: program, error } = await service
    .from("franchise_playbook_programs")
    .insert({
      franchise_root_tenant_id: tenant.id,
      name,
      category,
      objective,
      owner_label: ownerLabel,
      cadence,
      target_audience: targetAudience,
      default_due_days: defaultDueDays,
      status,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (error || !program) {
    redirectWith(
      returnTo,
      "error",
      error?.message.slice(0, 200) ?? "program_create_failed",
    );
  }

  await auditFranchiseAction(service, {
    actorUserId: user.id,
    tenantId: tenant.id,
    action: "franchise.playbook_program_created",
    targetType: "franchise_playbook_program",
    targetId: program.id,
    payload: { name, category, status },
  });

  revalidateFranchiseControlPaths();
  redirectWith(returnTo, "playbook_program_created");
}

export async function updateFranchisePlaybookProgram(formData: FormData) {
  const returnTo = safeReturnPath(formData, "/backoffice/franchise/playbook");
  const programId = cleanField(formData, "program_id", 120);
  if (!programId) redirectWith(returnTo, "error", "missing_fields");

  const status = cleanField(formData, "status", 40);
  const patch: Record<string, unknown> = {};
  const name = cleanOptionalField(formData, "name", 180);
  const objective = cleanOptionalField(formData, "objective", 1200);
  const ownerLabel = cleanOptionalField(formData, "owner_label", 120);
  const cadence = cleanOptionalField(formData, "cadence", 80);
  if (name) patch.name = name;
  if (objective) patch.objective = objective;
  if (ownerLabel) patch.owner_label = ownerLabel;
  if (cadence) patch.cadence = cadence;
  if (status) {
    if (!["draft", "active", "archived"].includes(status)) {
      redirectWith(returnTo, "error", "invalid_status");
    }
    patch.status = status;
  }

  const { user, tenant, service } = await requireFranchisegeverAction(returnTo);
  patch.updated_by = user.id;
  const { error } = await service
    .from("franchise_playbook_programs")
    .update(patch)
    .eq("id", programId)
    .eq("franchise_root_tenant_id", tenant.id);

  if (error) redirectWith(returnTo, "error", error.message.slice(0, 200));

  await auditFranchiseAction(service, {
    actorUserId: user.id,
    tenantId: tenant.id,
    action: "franchise.playbook_program_updated",
    targetType: "franchise_playbook_program",
    targetId: programId,
    payload: patch,
  });

  revalidateFranchiseControlPaths();
  redirectWith(returnTo, "playbook_program_saved");
}

export async function createFranchisePlaybookStep(formData: FormData) {
  const returnTo = safeReturnPath(formData, "/backoffice/franchise/playbook");
  const programId = cleanField(formData, "program_id", 120);
  const title = cleanField(formData, "title", 180);
  const description = cleanField(formData, "description", 1200);
  const stepType = cleanField(formData, "step_type", 40) || "checklist";
  const evidenceHint = cleanOptionalField(formData, "evidence_hint", 400);
  const positionRaw = Number.parseInt(cleanField(formData, "position", 12), 10);
  if (!programId || !title) redirectWith(returnTo, "error", "missing_fields");
  if (
    ![
      "checklist",
      "training",
      "rollout",
      "coaching",
      "audit",
      "communication",
      "measurement",
    ].includes(stepType)
  ) {
    redirectWith(returnTo, "error", "invalid_step_type");
  }

  const { user, tenant, service } = await requireFranchisegeverAction(returnTo);
  const { data: program } = await service
    .from("franchise_playbook_programs")
    .select("id")
    .eq("id", programId)
    .eq("franchise_root_tenant_id", tenant.id)
    .maybeSingle();
  if (!program) redirectWith(returnTo, "error", "program_not_found");

  let position =
    Number.isFinite(positionRaw) && positionRaw > 0 ? positionRaw : null;
  if (!position) {
    const { data: steps } = await service
      .from("franchise_playbook_steps")
      .select("position")
      .eq("program_id", programId)
      .order("position", { ascending: false })
      .limit(1);
    position = ((steps?.[0]?.position as number | undefined) ?? 0) + 1;
  }

  const { data: step, error } = await service
    .from("franchise_playbook_steps")
    .insert({
      program_id: programId,
      position,
      title,
      description,
      step_type: stepType,
      evidence_hint: evidenceHint,
      is_required: checked(formData, "is_required") || formData.get("is_required") === null,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (error || !step) {
    redirectWith(
      returnTo,
      "error",
      error?.message.slice(0, 200) ?? "step_create_failed",
    );
  }

  const progressRows = await buildMissingProgressRows(
    service,
    programId,
    step.id,
    user.id,
  );
  if (progressRows.length > 0) {
    await service.from("franchise_playbook_step_progress").insert(progressRows);
  }

  await auditFranchiseAction(service, {
    actorUserId: user.id,
    tenantId: tenant.id,
    action: "franchise.playbook_step_created",
    targetType: "franchise_playbook_step",
    targetId: step.id,
    payload: { program_id: programId, title, step_type: stepType, position },
  });

  revalidateFranchiseControlPaths();
  redirectWith(returnTo, "playbook_step_created");
}

export async function assignFranchisePlaybookProgram(formData: FormData) {
  const returnTo = safeReturnPath(formData, "/backoffice/franchise/playbook");
  const programId = cleanField(formData, "program_id", 120);
  const franchiseeTenantId = cleanField(formData, "franchisee_tenant_id", 120);
  if (!programId || !franchiseeTenantId) {
    redirectWith(returnTo, "error", "missing_fields");
  }

  const { user, tenant, service } = await requireFranchisegeverAction(returnTo);
  const franchisee = await loadFranchiseeOrRedirect(
    service,
    tenant.id,
    franchiseeTenantId,
    returnTo,
  );
  const { data: program, error: programError } = await service
    .from("franchise_playbook_programs")
    .select("id, name, status, default_due_days")
    .eq("id", programId)
    .eq("franchise_root_tenant_id", tenant.id)
    .maybeSingle();
  if (programError) {
    redirectWith(returnTo, "error", programError.message.slice(0, 200));
  }
  if (!program || program.status === "archived") {
    redirectWith(returnTo, "error", "program_not_assignable");
  }

  const dueDate =
    cleanField(formData, "due_date", 10) ||
    datePlusDays((program.default_due_days as number | null) ?? 30);

  const { data: assignment, error } = await service
    .from("franchise_playbook_assignments")
    .upsert(
      {
        program_id: programId,
        franchise_root_tenant_id: tenant.id,
        franchisee_tenant_id: franchisee.id,
        owner_label:
          cleanField(formData, "owner_label", 120) || "Lokale eigenaar",
        due_date: dueDate,
        note: cleanOptionalField(formData, "note", 700),
        updated_by: user.id,
        created_by: user.id,
      },
      { onConflict: "program_id,franchisee_tenant_id" },
    )
    .select("id")
    .single();

  if (error || !assignment) {
    redirectWith(
      returnTo,
      "error",
      error?.message.slice(0, 200) ?? "assignment_failed",
    );
  }

  const { data: steps } = await service
    .from("franchise_playbook_steps")
    .select("id")
    .eq("program_id", programId);
  const progressRows = (steps ?? []).map((step) => ({
    assignment_id: assignment.id,
    step_id: step.id,
    status: "not_started",
    updated_by: user.id,
  }));
  if (progressRows.length > 0) {
    await service
      .from("franchise_playbook_step_progress")
      .upsert(progressRows, { onConflict: "assignment_id,step_id" });
  }

  await auditFranchiseAction(service, {
    actorUserId: user.id,
    tenantId: tenant.id,
    action: "franchise.playbook_program_assigned",
    targetType: "franchise_playbook_assignment",
    targetId: assignment.id,
    payload: {
      program_id: programId,
      program_name: program.name,
      franchisee_tenant_id: franchisee.id,
      due_date: dueDate,
    },
  });

  revalidateFranchiseControlPaths();
  redirectWith(returnTo, "playbook_assigned");
}

export async function updateFranchisePlaybookAssignmentStatus(
  formData: FormData,
) {
  const returnTo = safeReturnPath(formData, "/backoffice/franchise/playbook");
  const assignmentId = cleanField(formData, "assignment_id", 120);
  const status = cleanField(formData, "status", 40);
  if (!assignmentId || !status) redirectWith(returnTo, "error", "missing_fields");
  if (
    !["not_started", "in_progress", "blocked", "completed", "declined"].includes(
      status,
    )
  ) {
    redirectWith(returnTo, "error", "invalid_assignment_status");
  }

  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "franchise_admin",
    "branch_manager",
    "planner",
    "admin_staff",
  ]);
  const service = createServiceRoleClient();
  const { data: assignment } = await service
    .from("franchise_playbook_assignments")
    .select("id, franchise_root_tenant_id, franchisee_tenant_id")
    .eq("id", assignmentId)
    .maybeSingle();
  if (
    !assignment ||
    ![assignment.franchise_root_tenant_id, assignment.franchisee_tenant_id].includes(
      tenant.id,
    )
  ) {
    redirectWith(returnTo, "error", "assignment_not_found");
  }

  const patch: Record<string, unknown> = {
    status,
    note: cleanOptionalField(formData, "note", 1000),
    updated_by: user.id,
  };
  if (status === "in_progress") patch.accepted_at = new Date().toISOString();
  if (status === "completed") patch.completed_at = new Date().toISOString();
  if (status === "declined") {
    patch.declined_reason =
      cleanOptionalField(formData, "declined_reason", 1000) ||
      cleanOptionalField(formData, "note", 1000);
  }

  const { error } = await service
    .from("franchise_playbook_assignments")
    .update(patch)
    .eq("id", assignmentId);
  if (error) redirectWith(returnTo, "error", error.message.slice(0, 200));

  await auditFranchiseAction(service, {
    actorUserId: user.id,
    tenantId: tenant.id,
    action: "franchise.playbook_assignment_status_updated",
    targetType: "franchise_playbook_assignment",
    targetId: assignmentId,
    payload: {
      status,
      note: patch.note,
      franchise_root_tenant_id: assignment.franchise_root_tenant_id,
      franchisee_tenant_id: assignment.franchisee_tenant_id,
    },
  });

  revalidateFranchiseControlPaths();
  redirectWith(returnTo, "playbook_assignment_updated");
}

export async function updateFranchisePlaybookStepProgress(formData: FormData) {
  const returnTo = safeReturnPath(formData, "/backoffice/franchise/playbook");
  const assignmentId = cleanField(formData, "assignment_id", 120);
  const stepId = cleanField(formData, "step_id", 120);
  const status = cleanField(formData, "status", 40);
  if (!assignmentId || !stepId || !status) {
    redirectWith(returnTo, "error", "missing_fields");
  }
  if (
    !["not_started", "in_progress", "blocked", "completed", "skipped"].includes(
      status,
    )
  ) {
    redirectWith(returnTo, "error", "invalid_step_status");
  }

  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "franchise_admin",
    "branch_manager",
    "planner",
    "admin_staff",
  ]);
  const service = createServiceRoleClient();
  const { data: assignment } = await service
    .from("franchise_playbook_assignments")
    .select("id, program_id, franchise_root_tenant_id, franchisee_tenant_id")
    .eq("id", assignmentId)
    .maybeSingle();
  if (
    !assignment ||
    ![assignment.franchise_root_tenant_id, assignment.franchisee_tenant_id].includes(
      tenant.id,
    )
  ) {
    redirectWith(returnTo, "error", "assignment_not_found");
  }
  const { data: step } = await service
    .from("franchise_playbook_steps")
    .select("id")
    .eq("id", stepId)
    .eq("program_id", assignment.program_id)
    .maybeSingle();
  if (!step) redirectWith(returnTo, "error", "step_not_found");

  const { data: progress, error } = await service
    .from("franchise_playbook_step_progress")
    .upsert(
      {
        assignment_id: assignmentId,
        step_id: stepId,
        status,
        note: cleanOptionalField(formData, "note", 1000),
        evidence_url: cleanOptionalField(formData, "evidence_url", 500),
        completed_by: status === "completed" ? user.id : null,
        completed_at: status === "completed" ? new Date().toISOString() : null,
        updated_by: user.id,
      },
      { onConflict: "assignment_id,step_id" },
    )
    .select("id")
    .single();
  if (error || !progress) {
    redirectWith(
      returnTo,
      "error",
      error?.message.slice(0, 200) ?? "progress_failed",
    );
  }

  await auditFranchiseAction(service, {
    actorUserId: user.id,
    tenantId: tenant.id,
    action: "franchise.playbook_step_progress_updated",
    targetType: "franchise_playbook_step_progress",
    targetId: progress.id,
    payload: {
      assignment_id: assignmentId,
      step_id: stepId,
      status,
      franchise_root_tenant_id: assignment.franchise_root_tenant_id,
      franchisee_tenant_id: assignment.franchisee_tenant_id,
    },
  });

  revalidateFranchiseControlPaths();
  redirectWith(returnTo, "playbook_progress_updated");
}

async function buildMissingProgressRows(
  service: ReturnType<typeof createServiceRoleClient>,
  programId: string,
  stepId: string,
  userId: string,
) {
  const { data: assignments } = await service
    .from("franchise_playbook_assignments")
    .select("id")
    .eq("program_id", programId);
  return (assignments ?? []).map((assignment) => ({
    assignment_id: assignment.id,
    step_id: stepId,
    status: "not_started",
    updated_by: userId,
  }));
}

function datePlusDays(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function routeLeadToBranch(formData: FormData) {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "franchise_admin",
  ]);

  const lead_id = String(formData.get("lead_id") ?? "").trim();
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
    p_lead_id: lead_id,
    p_branch_id: branch_id,
    p_actor: user.id,
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
