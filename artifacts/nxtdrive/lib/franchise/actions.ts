"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { requirePlatformAdmin } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { formatEuros } from "@/lib/packages/types";
import { tenantHasFeature } from "@/lib/platform/features";

function assertFranchisegeVerEnabled(tenant: { plan: string }) {
  if (!tenantHasFeature({ plan: tenant.plan as "start" | "pro" | "elite" }, "franchise_as_franchisegever")) {
    redirect("/backoffice/franchise?error=plan_required&plan=elite");
  }
}

function assertFranchiseeEnabled(tenant: { plan: string }) {
  if (!tenantHasFeature({ plan: tenant.plan as "start" | "pro" | "elite" }, "franchise_as_franchisee")) {
    redirect("/backoffice?error=plan_required&plan=pro");
  }
}

function assertMultiBranchEnabled(tenant: { plan: string }) {
  if (!tenantHasFeature({ plan: tenant.plan as "start" | "pro" | "elite" }, "multi_branch")) {
    redirect("/backoffice/leads?error=plan_required&plan=pro");
  }
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
  assertFranchisegeVerEnabled(tenant);

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
  assertFranchisegeVerEnabled(tenant);

  const template_id  = String(formData.get("template_id") ?? "").trim();
  const name         = String(formData.get("name") ?? "").trim() || null;
  const is_active_raw = formData.get("is_active");
  const is_active    = is_active_raw !== null ? is_active_raw === "true" : null;

  if (!template_id) redirect("/backoffice/franchise/templates?error=missing_fields");

  const service = createServiceRoleClient();
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
  assertFranchisegeVerEnabled(tenant);

  const template_id          = String(formData.get("template_id") ?? "").trim();
  const franchisee_tenant_id = String(formData.get("franchisee_tenant_id") ?? "").trim();

  if (!template_id || !franchisee_tenant_id) {
    redirect("/backoffice/franchise/templates?error=missing_fields");
  }

  const service = createServiceRoleClient();
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
  assertFranchiseeEnabled(tenant);

  const template_id = String(formData.get("template_id") ?? "").trim();
  if (!template_id) redirect("/backoffice/packages?error=missing_fields");

  const service = createServiceRoleClient();

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

// ─────────────────────────────────────────────────────────────────────────────
// Lead routing
// ─────────────────────────────────────────────────────────────────────────────

export async function routeLeadToBranch(formData: FormData) {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "franchise_admin",
  ]);
  assertMultiBranchEnabled(tenant);

  const lead_id   = String(formData.get("lead_id") ?? "").trim();
  const branch_id = String(formData.get("branch_id") ?? "").trim();

  if (!lead_id || !branch_id) {
    redirect(`/backoffice/leads/${lead_id}?error=missing_fields`);
  }

  const service = createServiceRoleClient();
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
