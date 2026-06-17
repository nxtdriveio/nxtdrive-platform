"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  loadOrganizationBranchScope,
  requireOrganizationPermission,
} from "@/lib/organization";
import { canAccessBranch } from "@/lib/permissions";
import { createServiceRoleClient } from "@/lib/supabase/service";

const PAGE = "/backoffice/voertuigen";

function parseBranchId(raw: FormDataEntryValue | null): string | null {
  const value = String(raw ?? "").trim();
  return value || null;
}

function parseOptionalString(
  raw: FormDataEntryValue | null,
  max = 500,
): string | null {
  const value = String(raw ?? "")
    .trim()
    .slice(0, max);
  return value || null;
}

function parseOptionalInt(raw: FormDataEntryValue | null): number | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalDate(raw: FormDataEntryValue | null): string | null {
  const value = String(raw ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function parseOptionalDateTime(raw: FormDataEntryValue | null): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

async function assertBranchAllowed(
  formData: FormData,
  context: Awaited<ReturnType<typeof requireOrganizationPermission>>,
): Promise<string | null> {
  const branchId = parseBranchId(formData.get("branch_id"));
  if (!branchId) return null;

  const service = createServiceRoleClient();
  const branchScope = await loadOrganizationBranchScope(service, context);
  if (!canAccessBranch(branchScope, branchId)) {
    redirect(`${PAGE}?error=forbidden`);
  }
  return branchId;
}

export async function createVehicle(formData: FormData) {
  const context = await requireOrganizationPermission("vehicle:manage");
  const { organization: tenant, user } = context;
  const label = parseOptionalString(formData.get("label"), 120);
  const plate = parseOptionalString(formData.get("license_plate"), 20);
  const transmission = parseOptionalString(formData.get("transmission"), 20);
  const branchId = await assertBranchAllowed(formData, context);
  if (!label) redirect(PAGE);

  const service = createServiceRoleClient();
  const { error } = await service.rpc("upsert_vehicle_operational", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_id: null,
    p_label: label,
    p_license_plate: plate,
    p_brand: parseOptionalString(formData.get("brand"), 80),
    p_model: parseOptionalString(formData.get("model"), 80),
    p_transmission: transmission,
    p_vehicle_type:
      parseOptionalString(formData.get("vehicle_type"), 40) ?? "car",
    p_status: parseOptionalString(formData.get("status"), 40) ?? "active",
    p_branch_id: branchId,
    p_apk_expires_at: parseOptionalDate(formData.get("apk_expires_at")),
    p_insurance_expires_at: parseOptionalDate(
      formData.get("insurance_expires_at"),
    ),
    p_current_odometer_km: parseOptionalInt(
      formData.get("current_odometer_km"),
    ),
    p_default_instructor_id: parseOptionalString(
      formData.get("default_instructor_id"),
      80,
    ),
    p_notes: parseOptionalString(formData.get("notes"), 1000),
  });
  if (error) throw new Error(`Voertuig opslaan mislukt: ${error.message}`);

  revalidatePath(PAGE);
  redirect(PAGE);
}

export async function updateVehicle(formData: FormData) {
  const context = await requireOrganizationPermission("vehicle:manage");
  const { organization: tenant, user } = context;
  const id = String(formData.get("vehicle_id") ?? "").trim();
  const label = parseOptionalString(formData.get("label"), 120);
  const branchId = await assertBranchAllowed(formData, context);
  if (!id || !label) redirect(PAGE);

  const service = createServiceRoleClient();
  const { error } = await service.rpc("upsert_vehicle_operational", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_id: id,
    p_label: label,
    p_license_plate: parseOptionalString(formData.get("license_plate"), 20),
    p_brand: parseOptionalString(formData.get("brand"), 80),
    p_model: parseOptionalString(formData.get("model"), 80),
    p_transmission: parseOptionalString(formData.get("transmission"), 20),
    p_vehicle_type:
      parseOptionalString(formData.get("vehicle_type"), 40) ?? "car",
    p_status: parseOptionalString(formData.get("status"), 40) ?? "active",
    p_branch_id: branchId,
    p_apk_expires_at: parseOptionalDate(formData.get("apk_expires_at")),
    p_insurance_expires_at: parseOptionalDate(
      formData.get("insurance_expires_at"),
    ),
    p_current_odometer_km: parseOptionalInt(
      formData.get("current_odometer_km"),
    ),
    p_default_instructor_id: parseOptionalString(
      formData.get("default_instructor_id"),
      80,
    ),
    p_notes: parseOptionalString(formData.get("notes"), 1000),
  });
  if (error) throw new Error(`Voertuig wijzigen mislukt: ${error.message}`);

  revalidatePath(PAGE);
  redirect(PAGE);
}

export async function toggleVehicleActive(formData: FormData) {
  const { organization: tenant, user } =
    await requireOrganizationPermission("vehicle:manage");
  const id = String(formData.get("vehicle_id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) redirect(PAGE);

  const service = createServiceRoleClient();
  const { error } = await service.rpc("set_vehicle_active", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_id: id,
    p_active: !active,
  });
  if (error)
    throw new Error(`Voertuigstatus wijzigen mislukt: ${error.message}`);

  revalidatePath(PAGE);
  redirect(PAGE);
}

export async function setVehicleStatus(formData: FormData) {
  const { organization: tenant, user } =
    await requireOrganizationPermission("vehicle:manage");
  const id = String(formData.get("vehicle_id") ?? "").trim();
  const status = parseOptionalString(formData.get("status"), 40);
  if (!id || !status) redirect(PAGE);

  const service = createServiceRoleClient();
  const { error } = await service.rpc("set_vehicle_operational_status", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_id: id,
    p_status: status,
  });
  if (error)
    throw new Error(`Voertuigstatus wijzigen mislukt: ${error.message}`);

  revalidatePath(PAGE);
  redirect(PAGE);
}

export async function assignVehicleBranch(formData: FormData) {
  const context = await requireOrganizationPermission("vehicle:manage");
  const { organization: tenant, user } = context;
  const id = String(formData.get("vehicle_id") ?? "").trim();
  const branchId = parseBranchId(formData.get("branch_id"));
  if (!id) redirect(PAGE);

  const service = createServiceRoleClient();
  const branchScope = await loadOrganizationBranchScope(service, context);
  if (branchId && !canAccessBranch(branchScope, branchId)) {
    redirect(`${PAGE}?error=forbidden`);
  }

  const { error } = await service.rpc("assign_vehicle_branch", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_id: id,
    p_branch_id: branchId,
  });
  if (error)
    throw new Error(`Voertuigvestiging wijzigen mislukt: ${error.message}`);

  revalidatePath(PAGE);
  redirect(PAGE);
}

export async function addOdometerEntry(formData: FormData) {
  const { organization: tenant, user } =
    await requireOrganizationPermission("vehicle:manage");
  const vehicleId = String(formData.get("vehicle_id") ?? "").trim();
  const readingKm = parseOptionalInt(formData.get("reading_km"));
  if (!vehicleId || readingKm === null) redirect(PAGE);

  const service = createServiceRoleClient();
  const { error } = await service.rpc("add_vehicle_odometer_entry", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_vehicle_id: vehicleId,
    p_instructor_id: parseOptionalString(formData.get("instructor_id"), 80),
    p_appointment_id: parseOptionalString(formData.get("appointment_id"), 80),
    p_reading_km: readingKm,
    p_entry_type:
      parseOptionalString(formData.get("entry_type"), 40) ?? "manual",
    p_recorded_at: parseOptionalDateTime(formData.get("recorded_at")),
    p_notes: parseOptionalString(formData.get("notes"), 1000),
  });
  if (error)
    throw new Error(`Kilometerstand opslaan mislukt: ${error.message}`);

  revalidatePath(PAGE);
  redirect(PAGE);
}

export async function saveDamageReport(formData: FormData) {
  const { organization: tenant, user } =
    await requireOrganizationPermission("vehicle:manage");
  const vehicleId = String(formData.get("vehicle_id") ?? "").trim();
  if (!vehicleId) redirect(PAGE);

  const service = createServiceRoleClient();
  const { error } = await service.rpc("upsert_vehicle_damage_report", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_id: parseOptionalString(formData.get("damage_id"), 80),
    p_vehicle_id: vehicleId,
    p_severity: parseOptionalString(formData.get("severity"), 40) ?? "minor",
    p_status: parseOptionalString(formData.get("status"), 40) ?? "open",
    p_occurred_at: parseOptionalDateTime(formData.get("occurred_at")),
    p_description: parseOptionalString(formData.get("description"), 2000) ?? "",
    p_blocks_planning: String(formData.get("blocks_planning") ?? "") === "on",
  });
  if (error) throw new Error(`Schade opslaan mislukt: ${error.message}`);

  revalidatePath(PAGE);
  redirect(PAGE);
}

export async function saveMaintenanceEvent(formData: FormData) {
  const { organization: tenant, user } =
    await requireOrganizationPermission("vehicle:manage");
  const vehicleId = String(formData.get("vehicle_id") ?? "").trim();
  if (!vehicleId) redirect(PAGE);

  const service = createServiceRoleClient();
  const { error } = await service.rpc("upsert_vehicle_maintenance_event", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_id: parseOptionalString(formData.get("maintenance_id"), 80),
    p_vehicle_id: vehicleId,
    p_type: parseOptionalString(formData.get("type"), 40) ?? "service",
    p_status: parseOptionalString(formData.get("status"), 40) ?? "planned",
    p_starts_at: parseOptionalDateTime(formData.get("starts_at")),
    p_ends_at: parseOptionalDateTime(formData.get("ends_at")),
    p_odometer_km: parseOptionalInt(formData.get("odometer_km")),
    p_blocks_planning: String(formData.get("blocks_planning") ?? "") === "on",
    p_notes: parseOptionalString(formData.get("notes"), 1000),
  });
  if (error) throw new Error(`Onderhoud opslaan mislukt: ${error.message}`);

  revalidatePath(PAGE);
  redirect(PAGE);
}

export async function createLocation(formData: FormData) {
  const { organization: tenant, user } =
    await requireOrganizationPermission("vehicle:manage");
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, 160);
  const address = String(formData.get("address") ?? "")
    .trim()
    .slice(0, 300);
  if (!name) redirect(PAGE);

  const service = createServiceRoleClient();
  const { error } = await service.rpc("upsert_location", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_id: null,
    p_name: name,
    p_address: address || null,
    p_active: true,
  });
  if (error) throw new Error(`Locatie opslaan mislukt: ${error.message}`);

  revalidatePath(PAGE);
  redirect(PAGE);
}

export async function toggleLocationActive(formData: FormData) {
  const { organization: tenant, user } =
    await requireOrganizationPermission("vehicle:manage");
  const id = String(formData.get("location_id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) redirect(PAGE);

  const service = createServiceRoleClient();
  const { error } = await service.rpc("set_location_active", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_id: id,
    p_active: !active,
  });
  if (error)
    throw new Error(`Locatiestatus wijzigen mislukt: ${error.message}`);

  revalidatePath(PAGE);
  redirect(PAGE);
}

export async function assignLocationBranch(formData: FormData) {
  const context = await requireOrganizationPermission("vehicle:manage");
  const { organization: tenant, user } = context;
  const id = String(formData.get("location_id") ?? "").trim();
  const branchId = parseBranchId(formData.get("branch_id"));
  if (!id) redirect(PAGE);

  const service = createServiceRoleClient();
  const branchScope = await loadOrganizationBranchScope(service, context);
  if (branchId && !canAccessBranch(branchScope, branchId)) {
    redirect(`${PAGE}?error=forbidden`);
  }

  const { error } = await service.rpc("assign_location_branch", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_id: id,
    p_branch_id: branchId,
  });
  if (error)
    throw new Error(`Locatievestiging wijzigen mislukt: ${error.message}`);

  revalidatePath(PAGE);
  redirect(PAGE);
}
