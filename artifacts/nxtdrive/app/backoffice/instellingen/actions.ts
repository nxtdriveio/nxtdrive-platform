"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { setMollieApiKey as storeMollieApiKey } from "@/lib/mollie/secrets";

export async function saveMollieApiKey(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const raw = String(formData.get("api_key") ?? "").trim();

  if (!raw) {
    redirect("/backoffice/instellingen?mollie=empty");
  }

  const service = createServiceRoleClient();
  try {
    await storeMollieApiKey(service, tenant.id, user.id, raw);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Onbekende fout bij opslaan";
    redirect(
      `/backoffice/instellingen?mollie=error&reason=${encodeURIComponent(msg.slice(0, 200))}`,
    );
  }

  revalidatePath("/backoffice/instellingen");
  redirect("/backoffice/instellingen?mollie=saved");
}

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export async function saveBranding(formData: FormData) {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);

  const logoUrlRaw = String(formData.get("logo_url") ?? "").trim();
  const primaryRaw = String(formData.get("primary_color") ?? "").trim();
  const foregroundRaw = String(formData.get("primary_foreground") ?? "").trim();

  if (logoUrlRaw && !/^https?:\/\//i.test(logoUrlRaw)) {
    redirect("/backoffice/instellingen?branding=error&reason=Ongeldige+logo-URL");
  }
  if (primaryRaw && !HEX_RE.test(primaryRaw)) {
    redirect(
      "/backoffice/instellingen?branding=error&reason=Ongeldige+primaire+kleur",
    );
  }
  if (foregroundRaw && !HEX_RE.test(foregroundRaw)) {
    redirect(
      "/backoffice/instellingen?branding=error&reason=Ongeldige+tekstkleur",
    );
  }

  const service = createServiceRoleClient();
  const { error } = await service.from("tenant_branding").upsert(
    {
      tenant_id: tenant.id,
      logo_url: logoUrlRaw || null,
      primary_color: primaryRaw || null,
      primary_foreground: foregroundRaw || null,
    },
    { onConflict: "tenant_id" },
  );

  if (error) {
    redirect(
      `/backoffice/instellingen?branding=error&reason=${encodeURIComponent(
        error.message.slice(0, 200),
      )}`,
    );
  }

  revalidatePath("/backoffice", "layout");
  redirect("/backoffice/instellingen?branding=saved");
}

export type RuleActionResult = { ok: boolean; error?: string };

const MATCH_TYPES = ["contains", "equals", "starts_with"] as const;
type MatchType = (typeof MATCH_TYPES)[number];

function matchTypeOf(v: unknown): MatchType {
  return typeof v === "string" && (MATCH_TYPES as readonly string[]).includes(v)
    ? (v as MatchType)
    : "contains";
}

export async function createAssignmentRule(
  formData: FormData,
): Promise<RuleActionResult> {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);

  const keyword = String(formData.get("keyword") ?? "").trim();
  const departmentId = String(formData.get("department_id") ?? "").trim();
  if (!keyword) return { ok: false, error: "Trefwoord is verplicht." };
  if (!departmentId) return { ok: false, error: "Kies een afdeling." };

  const service = createServiceRoleClient();
  const { error } = await service.rpc("create_task_assignment_rule", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_keyword: keyword.slice(0, 120),
    p_match_type: matchTypeOf(formData.get("match_type")),
    p_department_id: departmentId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/instellingen");
  return { ok: true };
}

export async function updateAssignmentRule(
  formData: FormData,
): Promise<RuleActionResult> {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);

  const ruleId = String(formData.get("rule_id") ?? "").trim();
  if (!ruleId) return { ok: false, error: "Regel ontbreekt." };

  const keywordRaw = formData.get("keyword");
  const departmentRaw = formData.get("department_id");
  const matchRaw = formData.get("match_type");
  const activeRaw = formData.get("active");

  const service = createServiceRoleClient();
  const { error } = await service.rpc("update_task_assignment_rule", {
    p_rule_id: ruleId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_keyword:
      typeof keywordRaw === "string" ? keywordRaw.trim().slice(0, 120) : null,
    p_match_type: typeof matchRaw === "string" ? matchTypeOf(matchRaw) : null,
    p_department_id:
      typeof departmentRaw === "string" && departmentRaw.trim()
        ? departmentRaw.trim()
        : null,
    p_active:
      activeRaw === null ? null : activeRaw === "true" || activeRaw === "on",
    p_sort_order: null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/instellingen");
  return { ok: true };
}

export async function deleteAssignmentRule(
  formData: FormData,
): Promise<RuleActionResult> {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);

  const ruleId = String(formData.get("rule_id") ?? "").trim();
  if (!ruleId) return { ok: false, error: "Regel ontbreekt." };

  const service = createServiceRoleClient();
  const { error } = await service.rpc("delete_task_assignment_rule", {
    p_rule_id: ruleId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/instellingen");
  return { ok: true };
}
