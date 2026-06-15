"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireOrganizationPermission } from "@/lib/organization";
import { createServiceRoleClient } from "@/lib/supabase/service";

const PAGE = "/backoffice/eigenschappen";

function text(raw: FormDataEntryValue | null, max = 500): string | null {
  const value = String(raw ?? "")
    .trim()
    .slice(0, max);
  return value || null;
}

function enabled(raw: FormDataEntryValue | null): boolean {
  return String(raw ?? "") === "on" || String(raw ?? "") === "true";
}

export async function saveCapabilityDefinition(formData: FormData) {
  const { organization: tenant, user } =
    await requireOrganizationPermission("settings:manage");
  const service = createServiceRoleClient();
  const { error } = await service.rpc("upsert_capability_definition", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_id: text(formData.get("capability_id"), 80),
    p_key: text(formData.get("key"), 120),
    p_label: text(formData.get("label"), 160),
    p_category: text(formData.get("category"), 40) ?? "custom",
    p_applies_to: text(formData.get("applies_to"), 40) ?? "appointment",
    p_match_behavior: text(formData.get("match_behavior"), 40) ?? "preferred",
    p_active: enabled(formData.get("active")),
  });
  if (error) throw new Error(`Eigenschap opslaan mislukt: ${error.message}`);
  revalidatePath(PAGE);
  redirect(PAGE);
}

export async function setInstructorCapability(formData: FormData) {
  const { organization: tenant, user } =
    await requireOrganizationPermission("settings:manage");
  const service = createServiceRoleClient();
  const { error } = await service.rpc("set_instructor_capability", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_instructor_id: text(formData.get("instructor_id"), 80),
    p_capability_id: text(formData.get("capability_id"), 80),
    p_enabled: enabled(formData.get("enabled")),
  });
  if (error) throw new Error(`Instructeur-eigenschap opslaan mislukt: ${error.message}`);
  revalidatePath(PAGE);
  redirect(PAGE);
}

export async function setVehicleCapability(formData: FormData) {
  const { organization: tenant, user } =
    await requireOrganizationPermission("vehicle:manage");
  const service = createServiceRoleClient();
  const { error } = await service.rpc("set_vehicle_capability", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_vehicle_id: text(formData.get("vehicle_id"), 80),
    p_capability_id: text(formData.get("capability_id"), 80),
    p_enabled: enabled(formData.get("enabled")),
  });
  if (error) throw new Error(`Voertuig-eigenschap opslaan mislukt: ${error.message}`);
  revalidatePath(PAGE);
  revalidatePath("/backoffice/voertuigen");
  redirect(PAGE);
}

export async function setStudentRequirement(formData: FormData) {
  const { organization: tenant, user } =
    await requireOrganizationPermission("student:manage");
  const service = createServiceRoleClient();
  const { error } = await service.rpc("upsert_student_requirement", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_student_id: text(formData.get("student_id"), 80),
    p_capability_id: text(formData.get("capability_id"), 80),
    p_requirement_type: text(formData.get("requirement_type"), 40) ?? "required",
    p_enabled: enabled(formData.get("enabled")),
  });
  if (error) throw new Error(`Leerling-eis opslaan mislukt: ${error.message}`);
  revalidatePath(PAGE);
  redirect(PAGE);
}
