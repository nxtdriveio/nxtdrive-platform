"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrganizationPermission } from "@/lib/organization";
import { createServiceRoleClient } from "@/lib/supabase/service";

const PAGE = "/backoffice/voertuigen";

export async function createVehicle(formData: FormData) {
  const { organization: tenant, user } = await requireOrganizationPermission("vehicle:manage");
  const label = String(formData.get("label") ?? "").trim().slice(0, 120);
  const plate = String(formData.get("license_plate") ?? "").trim().slice(0, 20);
  const transmission = String(formData.get("transmission") ?? "").trim();
  if (!label) redirect(PAGE);

  const service = createServiceRoleClient();
  const { error } = await service.rpc("upsert_vehicle", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_id: null,
    p_label: label,
    p_license_plate: plate || null,
    p_transmission: transmission || null,
    p_active: true,
  });
  if (error) throw new Error(`Voertuig opslaan mislukt: ${error.message}`);

  revalidatePath(PAGE);
  redirect(PAGE);
}

export async function toggleVehicleActive(formData: FormData) {
  const { organization: tenant, user } = await requireOrganizationPermission("vehicle:manage");
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
  if (error) throw new Error(`Voertuigstatus wijzigen mislukt: ${error.message}`);

  revalidatePath(PAGE);
  redirect(PAGE);
}

export async function createLocation(formData: FormData) {
  const { organization: tenant, user } = await requireOrganizationPermission("vehicle:manage");
  const name = String(formData.get("name") ?? "").trim().slice(0, 160);
  const address = String(formData.get("address") ?? "").trim().slice(0, 300);
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
  const { organization: tenant, user } = await requireOrganizationPermission("vehicle:manage");
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
  if (error) throw new Error(`Locatiestatus wijzigen mislukt: ${error.message}`);

  revalidatePath(PAGE);
  redirect(PAGE);
}
