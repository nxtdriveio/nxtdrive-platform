"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { hoursToMinutes } from "@/lib/students/types";
import { OFFERING_CATEGORIES, type OfferingCategory } from "@/lib/packages/types";

function parseCategory(raw: string, fallback: OfferingCategory): OfferingCategory {
  return (OFFERING_CATEGORIES as readonly string[]).includes(raw)
    ? (raw as OfferingCategory)
    : fallback;
}

export async function createPackage(formData: FormData) {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);
  const name = String(formData.get("name") ?? "").trim().slice(0, 200);
  // Packages are sized in hours in the UI; stored as minutes.
  const hours = parseFloat(String(formData.get("credits_total") ?? "0"));
  const credits = hoursToMinutes(hours);
  const priceEuros = parseFloat(String(formData.get("price_euros") ?? "0"));
  const validDaysRaw = String(formData.get("valid_days") ?? "").trim();
  const validDays = validDaysRaw === "" ? null : parseInt(validDaysRaw, 10);
  const category = parseCategory(
    String(formData.get("category") ?? ""),
    "pakket",
  );
  const terms = String(formData.get("terms") ?? "").trim().slice(0, 2000) || null;
  const autoGrant = formData.get("auto_grant") !== null;
  const visibleOnWebsite = formData.get("visible_on_website") !== null;
  const visibleInApp = formData.get("visible_in_app") !== null;
  const installmentsEnabled = formData.get("installments_enabled") !== null;
  const installmentRaw = String(formData.get("installment_count") ?? "").trim();
  const installmentCount =
    installmentsEnabled && installmentRaw !== ""
      ? parseInt(installmentRaw, 10)
      : null;
  // Threshold entered in hours; stored in minutes. Empty = no signal.
  const thresholdRaw = String(formData.get("signal_threshold_hours") ?? "").trim();
  const signalThresholdMinutes =
    thresholdRaw === "" ? null : hoursToMinutes(parseFloat(thresholdRaw));

  if (!name || !Number.isFinite(credits) || credits <= 0) {
    redirect("/backoffice/packages");
  }
  if (!Number.isFinite(priceEuros) || priceEuros < 0) {
    redirect("/backoffice/packages");
  }
  if (validDays !== null && (!Number.isFinite(validDays) || validDays <= 0)) {
    redirect("/backoffice/packages");
  }
  if (
    installmentCount !== null &&
    (!Number.isFinite(installmentCount) || installmentCount <= 1)
  ) {
    redirect("/backoffice/packages");
  }
  if (
    signalThresholdMinutes !== null &&
    (!Number.isFinite(signalThresholdMinutes) || signalThresholdMinutes <= 0)
  ) {
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
    category,
    terms,
    auto_grant: autoGrant,
    visible_on_website: visibleOnWebsite,
    visible_in_app: visibleInApp,
    installments_enabled: installmentsEnabled,
    installment_count: installmentCount,
    signal_threshold_minutes: signalThresholdMinutes,
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

export async function createProduct(formData: FormData) {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);
  const name = String(formData.get("name") ?? "").trim().slice(0, 200);
  const description =
    String(formData.get("description") ?? "").trim().slice(0, 2000) || null;
  const category = parseCategory(String(formData.get("category") ?? ""), "los");
  const priceEuros = parseFloat(String(formData.get("price_euros") ?? "0"));
  // Optional hour-credit; entered in hours, stored in minutes. Empty = none.
  const creditHoursRaw = String(formData.get("credit_hours") ?? "").trim();
  const creditMinutes =
    creditHoursRaw === "" ? null : hoursToMinutes(parseFloat(creditHoursRaw));
  const visibleOnWebsite = formData.get("visible_on_website") !== null;
  const visibleInApp = formData.get("visible_in_app") !== null;

  if (!name) redirect("/backoffice/packages");
  if (!Number.isFinite(priceEuros) || priceEuros < 0) {
    redirect("/backoffice/packages");
  }
  if (
    creditMinutes !== null &&
    (!Number.isFinite(creditMinutes) || creditMinutes <= 0)
  ) {
    redirect("/backoffice/packages");
  }

  const service = createServiceRoleClient();
  await service.from("products").insert({
    tenant_id: tenant.id,
    name,
    description,
    category,
    price_cents: Math.round(priceEuros * 100),
    credit_minutes: creditMinutes,
    visible_on_website: visibleOnWebsite,
    visible_in_app: visibleInApp,
    active: true,
  });

  revalidatePath("/backoffice/packages");
  redirect("/backoffice/packages");
}

export async function addPackageProduct(formData: FormData) {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);
  const packageId = String(formData.get("package_id") ?? "");
  const productId = String(formData.get("product_id") ?? "");
  const qtyRaw = String(formData.get("quantity") ?? "1").trim();
  const quantity = qtyRaw === "" ? 1 : parseInt(qtyRaw, 10);

  if (!packageId || !productId) redirect("/backoffice/packages");
  if (!Number.isFinite(quantity) || quantity <= 0) {
    redirect("/backoffice/packages");
  }

  const service = createServiceRoleClient();
  // Both rows must belong to this tenant; the composite FKs enforce tenant
  // consistency at the DB level, but verify here for a clean redirect path.
  const [{ data: pkg }, { data: prod }] = await Promise.all([
    service
      .from("packages")
      .select("id")
      .eq("id", packageId)
      .eq("tenant_id", tenant.id)
      .maybeSingle(),
    service
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("tenant_id", tenant.id)
      .maybeSingle(),
  ]);
  if (!pkg || !prod) redirect("/backoffice/packages");

  // Idempotent: bump quantity if the product is already linked.
  const { data: existing } = await service
    .from("package_products")
    .select("id, quantity")
    .eq("tenant_id", tenant.id)
    .eq("package_id", packageId)
    .eq("product_id", productId)
    .maybeSingle();
  if (existing) {
    await service
      .from("package_products")
      .update({ quantity })
      .eq("id", existing.id)
      .eq("tenant_id", tenant.id);
  } else {
    await service.from("package_products").insert({
      tenant_id: tenant.id,
      package_id: packageId,
      product_id: productId,
      quantity,
    });
  }

  revalidatePath("/backoffice/packages");
  redirect("/backoffice/packages");
}

export async function removePackageProduct(formData: FormData) {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);
  const id = String(formData.get("package_product_id") ?? "");
  if (!id) redirect("/backoffice/packages");

  const service = createServiceRoleClient();
  await service
    .from("package_products")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenant.id);

  revalidatePath("/backoffice/packages");
  redirect("/backoffice/packages");
}

export async function toggleProductActive(formData: FormData) {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);
  const id = String(formData.get("product_id") ?? "");
  if (!id) redirect("/backoffice/packages");

  const service = createServiceRoleClient();
  const { data: existing } = await service
    .from("products")
    .select("id, active")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (!existing) redirect("/backoffice/packages");

  await service
    .from("products")
    .update({ active: !existing.active })
    .eq("id", id)
    .eq("tenant_id", tenant.id);

  revalidatePath("/backoffice/packages");
  redirect("/backoffice/packages");
}
