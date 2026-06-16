"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  loadOrganizationBranchScope,
  requireOrganizationPermission,
} from "@/lib/organization";
import { canAccessBranch } from "@/lib/permissions";
import { createServiceRoleClient } from "@/lib/supabase/service";

function text(raw: FormDataEntryValue | null, max = 500): string | null {
  const value = String(raw ?? "")
    .trim()
    .slice(0, max);
  return value || null;
}

function enabled(raw: FormDataEntryValue | null): boolean {
  return String(raw ?? "") === "true" || String(raw ?? "") === "on";
}

function safeReturnTo(raw: FormDataEntryValue | null, fallback: string): string {
  const value = String(raw ?? "").trim();
  return value.startsWith("/backoffice/instructeurs") ? value : fallback;
}

async function assertInstructorMembership(
  tenantId: string,
  instructorId: string | null,
) {
  if (!instructorId) throw new Error("Instructeur ontbreekt.");
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("memberships")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("user_id", instructorId)
    .eq("role", "instructor")
    .maybeSingle();

  if (error) throw new Error(`Instructeur controleren mislukt: ${error.message}`);
  if (!data) throw new Error("Deze instructeur hoort niet bij deze organisatie.");
}

async function assertVehicleAccess(
  context: Awaited<ReturnType<typeof requireOrganizationPermission>>,
  vehicleId: string | null,
) {
  if (!vehicleId) throw new Error("Voertuig ontbreekt.");
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("vehicles")
    .select("id, branch_id")
    .eq("tenant_id", context.organization.id)
    .eq("id", vehicleId)
    .maybeSingle();

  if (error) throw new Error(`Voertuig controleren mislukt: ${error.message}`);
  if (!data) throw new Error("Dit voertuig hoort niet bij deze organisatie.");

  const branchScope = await loadOrganizationBranchScope(service, context);
  if (data.branch_id && !canAccessBranch(branchScope, data.branch_id)) {
    throw new Error("Je hebt geen toegang tot de vestiging van dit voertuig.");
  }

  return data;
}

export async function updateInstructorProfile(formData: FormData) {
  const { organization } = await requireOrganizationPermission("user:manage");
  const instructorId = text(formData.get("instructor_id"), 80);
  const returnTo = safeReturnTo(
    formData.get("return_to"),
    instructorId
      ? `/backoffice/instructeurs/${instructorId}`
      : "/backoffice/instructeurs",
  );
  await assertInstructorMembership(organization.id, instructorId);

  const fullName = text(formData.get("full_name"), 160);
  if (!fullName) throw new Error("Naam is verplicht.");

  const service = createServiceRoleClient();
  const { error } = await service
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", instructorId);

  if (error) throw new Error(`Instructeurgegevens opslaan mislukt: ${error.message}`);

  revalidatePath("/backoffice/instructeurs");
  revalidatePath(returnTo);
  redirect(`${returnTo}?success=profile_updated`);
}

export async function toggleInstructorCapability(formData: FormData) {
  const { organization, user } =
    await requireOrganizationPermission("settings:manage");
  const instructorId = text(formData.get("instructor_id"), 80);
  const capabilityId = text(formData.get("capability_id"), 80);
  const returnTo = safeReturnTo(
    formData.get("return_to"),
    instructorId
      ? `/backoffice/instructeurs/${instructorId}`
      : "/backoffice/instructeurs",
  );

  await assertInstructorMembership(organization.id, instructorId);
  if (!capabilityId) throw new Error("Eigenschap ontbreekt.");

  const service = createServiceRoleClient();
  const { error } = await service.rpc("set_instructor_capability", {
    p_tenant_id: organization.id,
    p_actor: user.id,
    p_instructor_id: instructorId,
    p_capability_id: capabilityId,
    p_enabled: enabled(formData.get("enabled")),
  });

  if (error)
    throw new Error(`Instructeur-eigenschap opslaan mislukt: ${error.message}`);

  revalidatePath("/backoffice/instructeurs");
  revalidatePath("/backoffice/eigenschappen");
  revalidatePath(returnTo);
  redirect(`${returnTo}?success=capability_updated`);
}

export async function assignInstructorVehicle(formData: FormData) {
  const context = await requireOrganizationPermission("vehicle:manage");
  const instructorId = text(formData.get("instructor_id"), 80);
  const vehicleId = text(formData.get("vehicle_id"), 80);
  const returnTo = safeReturnTo(
    formData.get("return_to"),
    instructorId
      ? `/backoffice/instructeurs/${instructorId}`
      : "/backoffice/instructeurs",
  );

  await assertInstructorMembership(context.organization.id, instructorId);
  await assertVehicleAccess(context, vehicleId);

  const service = createServiceRoleClient();
  const { error } = await service
    .from("vehicles")
    .update({ default_instructor_id: instructorId })
    .eq("tenant_id", context.organization.id)
    .eq("id", vehicleId);

  if (error) throw new Error(`Voertuig koppelen mislukt: ${error.message}`);

  revalidatePath("/backoffice/instructeurs");
  revalidatePath("/backoffice/voertuigen");
  revalidatePath(returnTo);
  redirect(`${returnTo}?success=vehicle_updated`);
}

export async function clearInstructorVehicle(formData: FormData) {
  const context = await requireOrganizationPermission("vehicle:manage");
  const instructorId = text(formData.get("instructor_id"), 80);
  const vehicleId = text(formData.get("vehicle_id"), 80);
  const returnTo = safeReturnTo(
    formData.get("return_to"),
    instructorId
      ? `/backoffice/instructeurs/${instructorId}`
      : "/backoffice/instructeurs",
  );

  await assertInstructorMembership(context.organization.id, instructorId);
  await assertVehicleAccess(context, vehicleId);

  const service = createServiceRoleClient();
  const { error } = await service
    .from("vehicles")
    .update({ default_instructor_id: null })
    .eq("tenant_id", context.organization.id)
    .eq("id", vehicleId)
    .eq("default_instructor_id", instructorId);

  if (error) throw new Error(`Voertuig ontkoppelen mislukt: ${error.message}`);

  revalidatePath("/backoffice/instructeurs");
  revalidatePath("/backoffice/voertuigen");
  revalidatePath(returnTo);
  redirect(`${returnTo}?success=vehicle_updated`);
}
