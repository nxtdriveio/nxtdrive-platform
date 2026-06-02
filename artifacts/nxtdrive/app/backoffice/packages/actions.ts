"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { hoursToMinutes } from "@/lib/students/types";

export async function createPackage(formData: FormData) {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);
  const name = String(formData.get("name") ?? "").trim().slice(0, 200);
  // Packages are sized in hours in the UI; stored as minutes.
  const hours = parseFloat(String(formData.get("credits_total") ?? "0"));
  const credits = hoursToMinutes(hours);
  const priceEuros = parseFloat(String(formData.get("price_euros") ?? "0"));
  const validDaysRaw = String(formData.get("valid_days") ?? "").trim();
  const validDays = validDaysRaw === "" ? null : parseInt(validDaysRaw, 10);

  if (!name || !Number.isFinite(credits) || credits <= 0) {
    redirect("/backoffice/packages");
  }
  if (!Number.isFinite(priceEuros) || priceEuros < 0) {
    redirect("/backoffice/packages");
  }
  if (validDays !== null && (!Number.isFinite(validDays) || validDays <= 0)) {
    redirect("/backoffice/packages");
  }

  const service = createServiceRoleClient();
  await service.from("packages").insert({
    tenant_id: tenant.id,
    name,
    credits_total: credits,
    price_cents: Math.round(priceEuros * 100),
    valid_days: validDays,
    active: true,
  });

  revalidatePath("/backoffice/packages");
  redirect("/backoffice/packages");
}

export async function togglePackageActive(formData: FormData) {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);
  const id = String(formData.get("package_id") ?? "");
  if (!id) redirect("/backoffice/packages");

  const service = createServiceRoleClient();
  const { data: existing } = await service
    .from("packages")
    .select("id, active")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (!existing) redirect("/backoffice/packages");

  await service
    .from("packages")
    .update({ active: !existing.active })
    .eq("id", id)
    .eq("tenant_id", tenant.id);

  revalidatePath("/backoffice/packages");
  redirect("/backoffice/packages");
}
