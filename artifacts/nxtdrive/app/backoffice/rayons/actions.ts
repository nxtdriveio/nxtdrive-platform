"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  loadOrganizationBranchScope,
  requireOrganizationPermission,
} from "@/lib/organization";
import { canAccessBranch } from "@/lib/permissions";
import { createServiceRoleClient } from "@/lib/supabase/service";

const PAGE = "/backoffice/rayons";

function text(raw: FormDataEntryValue | null, max = 500): string | null {
  const value = String(raw ?? "")
    .trim()
    .slice(0, max);
  return value || null;
}

function int(raw: FormDataEntryValue | null, fallback: number): number {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(raw: FormDataEntryValue | null): boolean {
  return String(raw ?? "") === "on" || String(raw ?? "") === "true";
}

async function requirePlanningManage() {
  const context = await requireOrganizationPermission("planning:manage");
  const service = createServiceRoleClient();
  const branchScope = await loadOrganizationBranchScope(service, context);
  return { context, service, branchScope };
}

function assertBranchAccess(
  branchScope: Awaited<ReturnType<typeof loadOrganizationBranchScope>>,
  branchId: string | null,
) {
  if (branchId && !canAccessBranch(branchScope, branchId)) {
    redirect(`${PAGE}?error=forbidden`);
  }
}

export async function savePlanningSettings(formData: FormData) {
  const { context, service } = await requirePlanningManage();
  const { organization: tenant, user } = context;
  const { error } = await service.rpc("upsert_planning_settings", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_rayon_policy: text(formData.get("rayon_policy"), 40) ?? "hard_block",
    p_default_travel_buffer_minutes: int(
      formData.get("default_travel_buffer_minutes"),
      15,
    ),
    p_same_area_travel_minutes: int(formData.get("same_area_travel_minutes"), 10),
    p_different_area_travel_minutes: int(
      formData.get("different_area_travel_minutes"),
      30,
    ),
  });
  if (error) throw new Error(`Planninginstellingen opslaan mislukt: ${error.message}`);
  revalidatePath(PAGE);
  redirect(PAGE);
}

export async function saveServiceArea(formData: FormData) {
  const { context, service, branchScope } = await requirePlanningManage();
  const { organization: tenant, user } = context;
  const branchId = text(formData.get("branch_id"), 80);
  assertBranchAccess(branchScope, branchId);

  const { error } = await service.rpc("upsert_service_area", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_id: text(formData.get("service_area_id"), 80),
    p_branch_id: branchId,
    p_name: text(formData.get("name"), 160),
    p_description: text(formData.get("description"), 1000),
    p_active: bool(formData.get("active")),
  });
  if (error) throw new Error(`Rayon opslaan mislukt: ${error.message}`);
  revalidatePath(PAGE);
  redirect(PAGE);
}

export async function saveServiceAreaZone(formData: FormData) {
  const { context, service } = await requirePlanningManage();
  const { organization: tenant, user } = context;
  const { error } = await service.rpc("upsert_service_area_zone", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_id: text(formData.get("zone_id"), 80),
    p_service_area_id: text(formData.get("service_area_id"), 80),
    p_type: text(formData.get("type"), 40) ?? "city",
    p_value: text(formData.get("value"), 160),
  });
  if (error) throw new Error(`Rayonzone opslaan mislukt: ${error.message}`);
  revalidatePath(PAGE);
  redirect(PAGE);
}

export async function deleteServiceAreaZone(formData: FormData) {
  const { context, service } = await requirePlanningManage();
  const { organization: tenant, user } = context;
  const zoneId = text(formData.get("zone_id"), 80);
  if (!zoneId) redirect(PAGE);

  const { error } = await service.rpc("delete_service_area_zone", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_id: zoneId,
  });
  if (error) throw new Error(`Rayonzone verwijderen mislukt: ${error.message}`);
  revalidatePath(PAGE);
  redirect(PAGE);
}

export async function saveInstructorServiceAreaAssignment(formData: FormData) {
  const { context, service } = await requirePlanningManage();
  const { organization: tenant, user } = context;
  const { error } = await service.rpc("upsert_instructor_service_area_assignment", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_id: text(formData.get("assignment_id"), 80),
    p_instructor_id: text(formData.get("instructor_id"), 80),
    p_service_area_id: text(formData.get("service_area_id"), 80),
    p_priority: text(formData.get("priority"), 40) ?? "primary",
    p_enabled: bool(formData.get("enabled")),
  });
  if (error) throw new Error(`Rayontoewijzing opslaan mislukt: ${error.message}`);
  revalidatePath(PAGE);
  redirect(PAGE);
}

export async function saveTravelMatrixEntry(formData: FormData) {
  const { context, service } = await requirePlanningManage();
  const { organization: tenant, user } = context;
  const { error } = await service.rpc("upsert_service_area_travel_matrix", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_from_service_area_id: text(formData.get("from_service_area_id"), 80),
    p_to_service_area_id: text(formData.get("to_service_area_id"), 80),
    p_estimated_minutes: int(formData.get("estimated_minutes"), 30),
  });
  if (error) throw new Error(`Reistijd opslaan mislukt: ${error.message}`);
  revalidatePath(PAGE);
  redirect(PAGE);
}
