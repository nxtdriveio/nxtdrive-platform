"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { setMollieApiKey as storeMollieApiKey } from "@/lib/mollie/secrets";
import { LEAD_SCORE_WEIGHT_CODES } from "@/lib/leads/lead-score";
import {
  LEAD_SCORE_POLICY_KEY,
  mergeLeadScorePolicy,
} from "@/lib/leads/lead-score-policy";
import { recomputeLeadScoresForTenant } from "@/lib/leads/automation";
import {
  CANCELLATION_POLICY_KEY,
  mergeCancellationPolicy,
} from "@/lib/lessons/cancellation-policy";
import {
  LESSON_REFILL_POLICY_KEY,
  mergeRefillPolicy,
} from "@/lib/lesson-refill/policy";
import {
  PARENT_PORTAL_SECTIONS,
  PARENT_PORTAL_VISIBILITY_KEY,
  mergeParentPortalVisibility,
} from "@/lib/parent-portal/visibility";
import {
  PAYMENT_REMINDER_POLICY_KEY,
  mergePaymentReminderPolicy,
} from "@/lib/invoices/payment-reminder-policy";
import {
  INSTALLMENT_CREDIT_POLICY_KEY,
  mergeInstallmentCreditPolicy,
} from "@/lib/invoices/installment-credit";
import { REVIEW_MOMENTS, REVIEW_MOMENTS_KEY } from "@/lib/notifications/settings";
import { CONTACT_PHONE_KEY } from "@/lib/tenant/contact-phone";
import {
  checkOwnershipTxt,
  classifyHostname,
  normalizeHostname,
} from "@/lib/tenant/domains";
import {
  setSendgridApiKey,
  setEmailFromAddress,
} from "@/lib/email/config";

export async function saveEmailConfig(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const rawKey = String(formData.get("sg_api_key") ?? "").trim();
  const fromEmail = String(formData.get("from_email") ?? "").trim();

  if (!fromEmail) {
    redirect("/backoffice/instellingen?email=error&reason=Vul+een+afzenderadres+in.");
  }

  const service = createServiceRoleClient();
  try {
    if (rawKey) {
      await setSendgridApiKey(service, tenant.id, user.id, rawKey);
    }
    await setEmailFromAddress(service, tenant.id, fromEmail);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Onbekende fout bij opslaan";
    redirect(
      `/backoffice/instellingen?email=error&reason=${encodeURIComponent(msg.slice(0, 200))}`,
    );
  }

  revalidatePath("/backoffice/instellingen");
  redirect("/backoffice/instellingen?email=saved");
}

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

export type PolicyActionResult = { ok: boolean; error?: string };

function parseOptionalNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Persist the tenant's lead scoring policy. The raw form values are passed
// through mergeLeadScorePolicy so the stored JSON is always sanitised: unknown
// codes dropped, weights clamped to 0–50, bands clamped to 0–100 and ordered
// (warm <= hot). Service-role write — RLS bypassed intentionally, tenant_id is
// always taken from the authenticated membership, never from the client.
export async function saveLeadScorePolicy(
  formData: FormData,
): Promise<PolicyActionResult> {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);

  const weights: Record<string, number> = {};
  for (const code of LEAD_SCORE_WEIGHT_CODES) {
    const v = parseOptionalNumber(formData.get(`weight_${code}`));
    if (v !== null) weights[code] = v;
  }

  const override = {
    weights,
    bands: {
      warm: parseOptionalNumber(formData.get("band_warm")),
      hot: parseOptionalNumber(formData.get("band_hot")),
    },
  };

  const policy = mergeLeadScorePolicy(override);

  const service = createServiceRoleClient();
  const { error } = await service.from("tenant_settings").upsert(
    {
      tenant_id: tenant.id,
      key: LEAD_SCORE_POLICY_KEY,
      value: policy,
    },
    { onConflict: "tenant_id,key" },
  );
  if (error) return { ok: false, error: error.message };

  // Recompute persisted lead scores under the new policy so the dashboard
  // (scores + "Hot (≥N)" KPI) reflects the change immediately. Best-effort:
  // the policy is already saved, so a recompute hiccup must not fail the save —
  // the activity sweep reconciles any stragglers later.
  try {
    await recomputeLeadScoresForTenant(service, tenant.id, user.id);
  } catch (err) {
    console.error("[settings] lead score recompute failed", err);
  }

  revalidatePath("/backoffice/instellingen");
  revalidatePath("/backoffice/leads");
  return { ok: true };
}

// --- Annuleringsbeleid (Task #91) ------------------------------------------
// The cancel_lesson RPC reads tenant_settings key `cancellation_policy`. We
// validate the incoming tiers strictly (clear message on bad input) and store
// the sanitised result via the service role so the JSON can never corrupt the
// refund calculation. Tenant-configurable, never hardcoded.

export async function saveCancellationPolicy(
  formData: FormData,
): Promise<PolicyActionResult> {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);

  const tiersRaw = formData.get("tiers");
  if (typeof tiersRaw !== "string" || tiersRaw.trim() === "") {
    return { ok: false, error: "Ongeldige drempels." };
  }
  let parsedTiers: unknown;
  try {
    parsedTiers = JSON.parse(tiersRaw);
  } catch {
    return { ok: false, error: "Ongeldige drempels." };
  }
  if (!Array.isArray(parsedTiers)) {
    return { ok: false, error: "Ongeldige drempels." };
  }

  const seen = new Set<number>();
  for (const tier of parsedTiers) {
    if (!tier || typeof tier !== "object") {
      return { ok: false, error: "Een drempel is ongeldig." };
    }
    const r = tier as Record<string, unknown>;
    const hours = Number(r.hours_before);
    const pct = Number(r.refund_pct);
    if (!Number.isFinite(hours) || hours < 0) {
      return { ok: false, error: "Uur vooraf moet 0 of hoger zijn." };
    }
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return { ok: false, error: "Percentage moet tussen 0 en 100 liggen." };
    }
    const rounded = Math.round(hours);
    if (seen.has(rounded)) {
      return {
        ok: false,
        error: "Twee drempels hebben hetzelfde aantal uur vooraf.",
      };
    }
    seen.add(rounded);
  }

  const minNoticeRaw = formData.get("min_notice_hours");
  const minNotice =
    typeof minNoticeRaw === "string" && minNoticeRaw.trim() !== ""
      ? Number(minNoticeRaw)
      : 0;
  if (!Number.isFinite(minNotice) || minNotice < 0) {
    return {
      ok: false,
      error: "De minimale opzegtermijn moet 0 of hoger zijn.",
    };
  }

  const policy = mergeCancellationPolicy({
    tiers: parsedTiers,
    min_notice_hours: minNotice,
  });

  const service = createServiceRoleClient();
  const { error } = await service.from("tenant_settings").upsert(
    {
      tenant_id: tenant.id,
      key: CANCELLATION_POLICY_KEY,
      value: policy,
    },
    { onConflict: "tenant_id,key" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/instellingen");
  revalidatePath("/backoffice/agenda");
  return { ok: true };
}

export async function resetCancellationPolicy(): Promise<PolicyActionResult> {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);

  const policy = mergeCancellationPolicy(null);

  const service = createServiceRoleClient();
  const { error } = await service.from("tenant_settings").upsert(
    {
      tenant_id: tenant.id,
      key: CANCELLATION_POLICY_KEY,
      value: policy,
    },
    { onConflict: "tenant_id,key" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/instellingen");
  revalidatePath("/backoffice/agenda");
  return { ok: true };
}

// Reset to the platform defaults by writing the merged default policy
// (mergeLeadScorePolicy with no override returns DEFAULT_LEAD_SCORE_POLICY).
export async function resetLeadScorePolicy(): Promise<PolicyActionResult> {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);

  const policy = mergeLeadScorePolicy(null);

  const service = createServiceRoleClient();
  const { error } = await service.from("tenant_settings").upsert(
    {
      tenant_id: tenant.id,
      key: LEAD_SCORE_POLICY_KEY,
      value: policy,
    },
    { onConflict: "tenant_id,key" },
  );
  if (error) return { ok: false, error: error.message };

  try {
    await recomputeLeadScoresForTenant(service, tenant.id, user.id);
  } catch (err) {
    console.error("[settings] lead score recompute failed", err);
  }

  revalidatePath("/backoffice/instellingen");
  revalidatePath("/backoffice/leads");
  return { ok: true };
}

// --- Herbezet-uitnodigingen / wachtlijst (Task #93) ------------------------
// Tenant-configurable rules for the refill invitation flow. The create RPC reads
// these from tenant_settings key `lesson_refill_policy`. We pass the raw form
// values through mergeRefillPolicy so the stored JSON is always sanitised:
// enabled coerced to boolean, valid_minutes and max_candidates clamped to a sane
// range. Service-role write — tenant_id always from the authenticated membership.

export async function saveRefillPolicy(
  formData: FormData,
): Promise<PolicyActionResult> {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);

  const enabledRaw = formData.get("enabled");
  const enabled = enabledRaw === "true" || enabledRaw === "on";

  const policy = mergeRefillPolicy({
    enabled,
    valid_minutes: parseOptionalNumber(formData.get("valid_minutes")),
    max_candidates: parseOptionalNumber(formData.get("max_candidates")),
  });

  const service = createServiceRoleClient();
  const { error } = await service.from("tenant_settings").upsert(
    {
      tenant_id: tenant.id,
      key: LESSON_REFILL_POLICY_KEY,
      value: policy,
    },
    { onConflict: "tenant_id,key" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/instellingen");
  revalidatePath("/backoffice/agenda");
  return { ok: true };
}

export async function resetRefillPolicy(): Promise<PolicyActionResult> {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);

  const policy = mergeRefillPolicy(null);

  const service = createServiceRoleClient();
  const { error } = await service.from("tenant_settings").upsert(
    {
      tenant_id: tenant.id,
      key: LESSON_REFILL_POLICY_KEY,
      value: policy,
    },
    { onConflict: "tenant_id,key" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/instellingen");
  revalidatePath("/backoffice/agenda");
  return { ok: true };
}

// --- Ouderportaal zichtbaarheid (Task #96) ---------------------------------
// Which sections of the read-only parent portal (/ouder) a tenant exposes to
// parents. Every section defaults to visible; an admin opts OUT. The raw form
// values are passed through mergeParentPortalVisibility so the stored JSON is
// always sanitised (unknown keys dropped, values coerced to strict booleans).
// Service-role write — tenant_id always from the authenticated membership.

export async function saveParentPortalVisibility(
  formData: FormData,
): Promise<PolicyActionResult> {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);

  const override: Record<string, boolean> = {};
  for (const section of PARENT_PORTAL_SECTIONS) {
    const raw = formData.get(section);
    override[section] = raw === "true" || raw === "on";
  }

  const visibility = mergeParentPortalVisibility(override);

  const service = createServiceRoleClient();
  const { error } = await service.from("tenant_settings").upsert(
    {
      tenant_id: tenant.id,
      key: PARENT_PORTAL_VISIBILITY_KEY,
      value: visibility,
    },
    { onConflict: "tenant_id,key" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/instellingen");
  revalidatePath("/ouder", "layout");
  return { ok: true };
}

export async function resetParentPortalVisibility(): Promise<PolicyActionResult> {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);

  const visibility = mergeParentPortalVisibility(null);

  const service = createServiceRoleClient();
  const { error } = await service.from("tenant_settings").upsert(
    {
      tenant_id: tenant.id,
      key: PARENT_PORTAL_VISIBILITY_KEY,
      value: visibility,
    },
    { onConflict: "tenant_id,key" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/instellingen");
  revalidatePath("/ouder", "layout");
  return { ok: true };
}

// --- Betaalherinneringen (Module 6) ----------------------------------------
// Tenant-configurable cadence for overdue-payment reminders. The cron job reads
// these from tenant_settings key `payment_reminder`. Raw form values pass
// through mergePaymentReminderPolicy so the stored JSON is always sanitised:
// enabled coerced to boolean, days clamped to a sorted, de-duplicated list of
// positive day offsets. Service-role write — tenant_id always from the
// authenticated membership.

export async function savePaymentReminderPolicy(
  formData: FormData,
): Promise<PolicyActionResult> {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);

  const enabledRaw = formData.get("enabled");
  const enabled = enabledRaw === "true" || enabledRaw === "on";

  const daysRaw = formData.get("days");
  let days: unknown = [];
  if (typeof daysRaw === "string" && daysRaw.trim() !== "") {
    try {
      days = JSON.parse(daysRaw);
    } catch {
      return { ok: false, error: "Ongeldige herinneringsmomenten." };
    }
  }

  const policy = mergePaymentReminderPolicy({ enabled, days });

  const service = createServiceRoleClient();
  const { error } = await service.from("tenant_settings").upsert(
    {
      tenant_id: tenant.id,
      key: PAYMENT_REMINDER_POLICY_KEY,
      value: policy,
    },
    { onConflict: "tenant_id,key" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/instellingen");
  return { ok: true };
}

export async function resetPaymentReminderPolicy(): Promise<PolicyActionResult> {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);

  const policy = mergePaymentReminderPolicy(null);

  const service = createServiceRoleClient();
  const { error } = await service.from("tenant_settings").upsert(
    {
      tenant_id: tenant.id,
      key: PAYMENT_REMINDER_POLICY_KEY,
      value: policy,
    },
    { onConflict: "tenant_id,key" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/instellingen");
  return { ok: true };
}

// --- Termijn-tegoed vrijgavebeleid (Task #112) -----------------------------
// How a package's tegoed is released across a termijn-schema. The policy is
// snapshot onto each installment_plan at creation (create_installment_plan reads
// tenant_settings key `installment_credit_release`), so changing it here only
// affects NEW plans — existing plans keep their snapshot. Raw form value passes
// through mergeInstallmentCreditPolicy so the stored JSON is always a valid mode.
// Service-role write — tenant_id always from the authenticated membership.

export async function saveInstallmentCreditPolicy(
  formData: FormData,
): Promise<PolicyActionResult> {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);

  const policy = mergeInstallmentCreditPolicy({ mode: formData.get("mode") });

  const service = createServiceRoleClient();
  const { error } = await service.from("tenant_settings").upsert(
    {
      tenant_id: tenant.id,
      key: INSTALLMENT_CREDIT_POLICY_KEY,
      value: policy,
    },
    { onConflict: "tenant_id,key" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/instellingen");
  return { ok: true };
}

export async function resetInstallmentCreditPolicy(): Promise<PolicyActionResult> {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);

  const policy = mergeInstallmentCreditPolicy(null);

  const service = createServiceRoleClient();
  const { error } = await service.from("tenant_settings").upsert(
    {
      tenant_id: tenant.id,
      key: INSTALLMENT_CREDIT_POLICY_KEY,
      value: policy,
    },
    { onConflict: "tenant_id,key" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/instellingen");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Task #113 — reviewmomenten-beleid. Welke automatische reviewverzoek-momenten
// actief zijn, de lesdrempel voor "na N lessen" en de optionele Google-review-
// URL. Service-role write; tenant_id altijd uit de geauthenticeerde membership.
// De opgeslagen JSON wordt door getReviewMomentsSettings opnieuw gesanitiseerd.
// ---------------------------------------------------------------------------
export async function saveReviewMomentsPolicy(
  formData: FormData,
): Promise<PolicyActionResult> {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);

  const activeMoments: Record<string, boolean> = {};
  for (const moment of REVIEW_MOMENTS) {
    const raw = formData.get(`moment_${moment}`);
    activeMoments[moment] = raw === "true" || raw === "on";
  }

  const thresholdRaw = parseOptionalNumber(formData.get("lesson_threshold"));
  if (
    thresholdRaw === null ||
    thresholdRaw < 1 ||
    thresholdRaw > 1000 ||
    !Number.isInteger(thresholdRaw)
  ) {
    return {
      ok: false,
      error: "De lesdrempel moet een heel getal tussen 1 en 1000 zijn.",
    };
  }

  const urlRaw = String(formData.get("google_review_url") ?? "").trim();
  let googleReviewUrl: string | null = null;
  if (urlRaw !== "") {
    try {
      const u = new URL(urlRaw);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return { ok: false, error: "De review-URL moet met http(s) beginnen." };
      }
      googleReviewUrl = u.toString();
    } catch {
      return { ok: false, error: "Vul een geldige review-URL in." };
    }
  }

  const service = createServiceRoleClient();
  const { error } = await service.from("tenant_settings").upsert(
    {
      tenant_id: tenant.id,
      key: REVIEW_MOMENTS_KEY,
      value: {
        active_moments: activeMoments,
        lesson_threshold: thresholdRaw,
        google_review_url: googleReviewUrl,
      },
    },
    { onConflict: "tenant_id,key" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/instellingen");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Task #113 — markeer (of ontmarkeer) de beloning van een referral als
// afgehandeld. Handmatig — er is bewust géén automatische beloningsmotor. De
// locked RPC (admin-only, geaudit) is de enige schrijfweg.
// ---------------------------------------------------------------------------
export async function setReferralRewardHandled(
  leadId: string,
  handled: boolean,
): Promise<PolicyActionResult> {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const id = String(leadId ?? "").trim();
  if (!id) return { ok: false, error: "Lead ontbreekt." };

  const service = createServiceRoleClient();
  const { error } = await service.rpc("mark_referral_reward_handled", {
    p_lead_id: id,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_handled: handled,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/referrals");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Task #115 — Berichten: het publieke contacttelefoonnummer van de school.
// Tenant-configurable via tenant_settings (key `contact_phone`). De leerling-
// app toont de "Bel"-actie alleen wanneer dit gezet is. Service-role write;
// tenant_id altijd uit de geauthenticeerde membership. Nooit hardcoded.
// ---------------------------------------------------------------------------
export async function saveContactPhone(
  formData: FormData,
): Promise<PolicyActionResult> {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);

  const raw = String(formData.get("contact_phone") ?? "").trim();
  if (raw.length > 40) {
    return { ok: false, error: "Telefoonnummer is te lang." };
  }
  if (raw !== "" && !/^[\d\s+()./-]+$/.test(raw)) {
    return { ok: false, error: "Vul een geldig telefoonnummer in." };
  }

  const service = createServiceRoleClient();
  const { error } = await service.from("tenant_settings").upsert(
    {
      tenant_id: tenant.id,
      key: CONTACT_PHONE_KEY,
      value: { phone: raw },
    },
    { onConflict: "tenant_id,key" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/instellingen");
  revalidatePath("/student", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Task #201 — Eigen domeinen (multi-tenant domains).
//
// Een school koppelt een wildcard-subdomein (<slug>.nxtdrive.io) of een eigen
// domein (rijschoolxyz.nl). Alle schrijfacties lopen via service-role RPC's die
// de actor her-valideren (RPC is service_role-only). Verificatie gebeurt hier in
// de app-laag via een DNS TXT-lookup; pas bij succes zet de RPC de status op
// 'active'. De tenant_id komt altijd uit de geauthenticeerde membership.
// ---------------------------------------------------------------------------
export async function addTenantDomain(
  formData: FormData,
): Promise<PolicyActionResult> {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);

  const host = normalizeHostname(String(formData.get("hostname") ?? ""));
  if (!host) {
    return { ok: false, error: "Vul een geldige domeinnaam in." };
  }
  const classified = classifyHostname(host);
  if (!classified) {
    return {
      ok: false,
      error: "nxtdrive.io zelf kan niet als domein worden toegevoegd.",
    };
  }

  const service = createServiceRoleClient();
  const { error } = await service.rpc("add_tenant_domain", {
    p_tenant_id: tenant.id,
    p_hostname: host,
    p_type: classified.type,
    p_actor: user.id,
  });
  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/backoffice/instellingen");
  return { ok: true };
}

export async function verifyTenantDomain(
  formData: FormData,
): Promise<PolicyActionResult> {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const domainId = String(formData.get("domain_id") ?? "").trim();
  if (!domainId) {
    return { ok: false, error: "Onbekend domein." };
  }

  const service = createServiceRoleClient();
  const { data: domain, error: loadErr } = await service
    .from("tenant_domains")
    .select("id, tenant_id, hostname, type, status, verification_token")
    .eq("id", domainId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (loadErr || !domain) {
    return { ok: false, error: "Domein niet gevonden." };
  }

  // Subdomeinen van nxtdrive.io vereisen geen DNS-eigendomsbewijs (wij beheren
  // de zone) — die mogen direct actief.
  let verified = domain.type === "subdomain";
  if (!verified) {
    verified = await checkOwnershipTxt(
      domain.hostname as string,
      domain.verification_token as string,
    );
  }

  const { error: statusErr } = await service.rpc("set_tenant_domain_status", {
    p_domain_id: domainId,
    p_status: verified ? "active" : "failed",
    p_actor: user.id,
  });
  if (statusErr) {
    return { ok: false, error: statusErr.message };
  }

  revalidatePath("/backoffice/instellingen");
  if (!verified) {
    return {
      ok: false,
      error:
        "Verificatie mislukt: het TXT-record is (nog) niet gevonden. DNS-wijzigingen kunnen even duren.",
    };
  }
  return { ok: true };
}

export async function removeTenantDomain(
  formData: FormData,
): Promise<PolicyActionResult> {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const domainId = String(formData.get("domain_id") ?? "").trim();
  if (!domainId) {
    return { ok: false, error: "Onbekend domein." };
  }

  const service = createServiceRoleClient();
  // Verify ownership before mutating (RPC also re-checks the actor).
  const { data: domain } = await service
    .from("tenant_domains")
    .select("id")
    .eq("id", domainId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (!domain) {
    return { ok: false, error: "Domein niet gevonden." };
  }

  const { error } = await service.rpc("remove_tenant_domain", {
    p_domain_id: domainId,
    p_actor: user.id,
  });
  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/backoffice/instellingen");
  return { ok: true };
}

export async function setPrimaryTenantDomain(
  formData: FormData,
): Promise<PolicyActionResult> {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const domainId = String(formData.get("domain_id") ?? "").trim();
  if (!domainId) {
    return { ok: false, error: "Onbekend domein." };
  }

  const service = createServiceRoleClient();
  const { data: domain } = await service
    .from("tenant_domains")
    .select("id")
    .eq("id", domainId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (!domain) {
    return { ok: false, error: "Domein niet gevonden." };
  }

  const { error } = await service.rpc("set_primary_tenant_domain", {
    p_domain_id: domainId,
    p_actor: user.id,
  });
  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/backoffice/instellingen");
  return { ok: true };
}
