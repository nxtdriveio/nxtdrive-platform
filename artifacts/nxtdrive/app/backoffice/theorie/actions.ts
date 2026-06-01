"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";

const PAGE = "/backoffice/theorie";

export async function createTheoryModule(formData: FormData) {
  const { tenant, user } = await requireActiveTenant(["tenant_admin"]);
  const title = String(formData.get("title") ?? "").trim().slice(0, 160);
  const code = String(formData.get("code") ?? "").trim().slice(0, 60);
  const description = String(formData.get("description") ?? "").trim().slice(0, 1000);
  if (!title) redirect(PAGE);

  const service = createServiceRoleClient();
  const { error } = await service.rpc("upsert_theory_module", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_id: null,
    p_code: code || null,
    p_title: title,
    p_description: description || null,
    p_active: true,
  });
  if (error) throw new Error(`Theoriemodule opslaan mislukt: ${error.message}`);

  revalidatePath(PAGE);
  redirect(PAGE);
}

export async function toggleTheoryModuleActive(formData: FormData) {
  const { tenant, user } = await requireActiveTenant(["tenant_admin"]);
  const id = String(formData.get("module_id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) redirect(PAGE);

  const service = createServiceRoleClient();
  const { error } = await service.rpc("set_theory_module_active", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_id: id,
    p_active: !active,
  });
  if (error) throw new Error(`Modulestatus wijzigen mislukt: ${error.message}`);

  revalidatePath(PAGE);
  redirect(PAGE);
}

export async function setTheoryModuleSkillsAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const { tenant, user } = await requireActiveTenant(["tenant_admin"]);
  const moduleId = String(formData.get("module_id") ?? "").trim();
  if (!moduleId) return { error: "module_id ontbreekt" };
  const skillIds = formData
    .getAll("skill_ids")
    .map((v) => String(v))
    .filter(Boolean);

  const service = createServiceRoleClient();
  const { error } = await service.rpc("set_theory_module_skills", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_module_id: moduleId,
    p_skill_ids: skillIds,
  });
  if (error) return { error: error.message };

  revalidatePath(PAGE);
  return {};
}
