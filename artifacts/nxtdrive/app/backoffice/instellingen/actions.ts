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
  DEFAULT_STUDENT_SELF_BOOKING_POLICY,
  STUDENT_SELF_BOOKING_POLICY_KEY,
  mergeStudentSelfBookingPolicy,
} from "@/lib/student-booking/policy";
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
  loadTenantEntitlementSnapshot,
} from "@/lib/platform/entitlements";
import {
  checkOwnershipTxt,
  classifyHostname,
  normalizeHostname,
} from "@/lib/tenant/domains";
import {
  BRANDED_PWA_PUBLICATION_KEY,
  type BrandedPwaPublicationStatus,
  type BrandedPwaSurface,
  normalizeBrandedPwaPublication,
} from "@/lib/tenant/branded-pwa-publication";
import {
  DEFAULT_TENANT_WORKFLOW_CATALOG,
  TENANT_WORKFLOW_CATALOG_KEY,
  mergeTenantWorkflowCatalogSettings,
} from "@/lib/tenant/workflow-catalog";

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

function assertWhiteLabelPlanAccess(
  allowed: boolean,
  path = "/backoffice/instellingen",
): void {
  if (!allowed) {
    redirect(
      `${path}?branding=error&reason=` +
        encodeURIComponent(
          "White-label en eigen domeinen vereisen het Elite-abonnement.",
        ),
    );
  }
}

function platformOnlyResult(isPlatformAdmin: boolean): PolicyActionResult | null {
  if (isPlatformAdmin) return null;
  return {
    ok: false,
    error:
      "Deze actie kan alleen door NXTDRIVE platformbeheer worden uitgevoerd.",
  };
}

function revalidateBrandingSurfaces() {
  revalidatePath("/", "layout");
  revalidatePath("/login");
  revalidatePath("/manifest.webmanifest");
  revalidatePath("/backoffice", "layout");
  revalidatePath("/backoffice/instellingen");
  revalidatePath("/student", "layout");
  revalidatePath("/student/manifest.webmanifest");
  revalidatePath("/instructeur", "layout");
  revalidatePath("/instructeur/manifest.webmanifest");
}

export async function saveBranding(formData: FormData) {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);
  const logoUrlRaw = String(formData.get("logo_url") ?? "").trim();
  const welcomeMessageRaw = String(formData.get("welcome_message") ?? "").trim().slice(0, 120);
  const service = createServiceRoleClient();
  const snapshot = await loadTenantEntitlementSnapshot(service, tenant.id);
  assertWhiteLabelPlanAccess(snapshot.featureAccess.white_label.allowed);
  const { data: currentBranding } = await service
    .from("tenant_branding")
    .select("theme_preset_id")
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  const hasThemePreset = typeof currentBranding?.theme_preset_id === "string";
  const primaryRaw = hasThemePreset
    ? ""
    : String(formData.get("primary_color") ?? "").trim();
  const foregroundRaw = hasThemePreset
    ? ""
    : String(formData.get("primary_foreground") ?? "").trim();

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

  const { error } = await service.from("tenant_branding").upsert(
    {
      tenant_id: tenant.id,
      logo_url: logoUrlRaw || null,
      primary_color: primaryRaw || null,
      primary_foreground: foregroundRaw || null,
      welcome_message: welcomeMessageRaw || null,
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

  revalidateBrandingSurfaces();
  redirect("/backoffice/instellingen?branding=saved");
}

export async function resetBrandingToNxtdriveDefaults(_formData: FormData) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const service = createServiceRoleClient();

  const { error } = await service.from("tenant_branding").upsert(
    {
      tenant_id: tenant.id,
      logo_url: null,
      primary_color: null,
      primary_foreground: null,
      welcome_message: null,
      theme_preset_id: null,
      theme_overrides: null,
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

  await service.from("audit_log").insert({
    actor_user_id: user.id,
    tenant_id: tenant.id,
    action: "tenant.branding_reset_to_nxtdrive_defaults",
    target_type: "tenant",
    target_id: tenant.id,
    payload: {
      logo_url: null,
      primary_color: null,
      primary_foreground: null,
      welcome_message: null,
      theme_preset_id: null,
      theme_overrides: null,
    },
  });

  revalidateBrandingSurfaces();
  redirect("/backoffice/instellingen?branding=reset");
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

const BRANDED_PWA_STATUSES = [
  "not_requested",
  "review",
  "published",
  "paused",
] as const satisfies readonly BrandedPwaPublicationStatus[];
const BRANDED_PWA_SURFACES = [
  "admin",
  "instructor",
  "student",
  "parent",
] as const satisfies readonly BrandedPwaSurface[];

function parseBrandedPwaStatus(
  value: FormDataEntryValue | null,
): BrandedPwaPublicationStatus {
  return typeof value === "string" &&
    (BRANDED_PWA_STATUSES as readonly string[]).includes(value)
    ? (value as BrandedPwaPublicationStatus)
    : "not_requested";
}

function parseBrandedPwaSurfaces(values: FormDataEntryValue[]): BrandedPwaSurface[] {
  return Array.from(
    new Set(
      values.filter((value): value is BrandedPwaSurface =>
        typeof value === "string" &&
        (BRANDED_PWA_SURFACES as readonly string[]).includes(value),
      ),
    ),
  );
}

export async function saveBrandedPwaPublication(
  formData: FormData,
): Promise<PolicyActionResult> {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const platformOnly = platformOnlyResult(user.profile?.is_platform_admin === true);
  if (platformOnly) return platformOnly;

  const service = createServiceRoleClient();
  const snapshot = await loadTenantEntitlementSnapshot(service, tenant.id);
  if (!snapshot.featureAccess.white_label.allowed) {
    return {
      ok: false,
      error: "Branded PWA-publicatie vereist white-label toegang.",
    };
  }

  const status = parseBrandedPwaStatus(formData.get("status"));
  const surfaces = parseBrandedPwaSurfaces(formData.getAll("surfaces"));
  if (status === "published" && surfaces.length === 0) {
    return {
      ok: false,
      error: "Kies minimaal één portaal om te publiceren.",
    };
  }

  const { data: currentRow, error: currentError } = await service
    .from("tenant_settings")
    .select("value")
    .eq("tenant_id", tenant.id)
    .eq("key", BRANDED_PWA_PUBLICATION_KEY)
    .maybeSingle();
  if (currentError) return { ok: false, error: currentError.message };

  const previous = normalizeBrandedPwaPublication(currentRow?.value);
  const now = new Date().toISOString();
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 500);
  const value = {
    status,
    surfaces,
    notes: notes || null,
    updated_at: now,
    updated_by: user.id,
    published_at:
      status === "published" ? previous.published_at ?? now : previous.published_at,
    published_by:
      status === "published" ? previous.published_by ?? user.id : previous.published_by,
  };

  const { error } = await service.from("tenant_settings").upsert(
    {
      tenant_id: tenant.id,
      key: BRANDED_PWA_PUBLICATION_KEY,
      value,
    },
    { onConflict: "tenant_id,key" },
  );
  if (error) return { ok: false, error: error.message };

  await service.from("audit_log").insert({
    actor_user_id: user.id,
    tenant_id: tenant.id,
    action: "tenant.branded_pwa_publication_updated",
    target_type: "tenant",
    target_id: tenant.id,
    payload: { previous, next: value },
  });

  revalidateBrandingSurfaces();
  return { ok: true };
}

export async function resetBrandedPwaPublication(
  _formData: FormData,
): Promise<PolicyActionResult> {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const platformOnly = platformOnlyResult(user.profile?.is_platform_admin === true);
  if (platformOnly) return platformOnly;

  const service = createServiceRoleClient();
  const now = new Date().toISOString();
  const value = {
    status: "not_requested",
    surfaces: [],
    notes: null,
    updated_at: now,
    updated_by: user.id,
    published_at: null,
    published_by: null,
  };

  const { error } = await service.from("tenant_settings").upsert(
    {
      tenant_id: tenant.id,
      key: BRANDED_PWA_PUBLICATION_KEY,
      value,
    },
    { onConflict: "tenant_id,key" },
  );
  if (error) return { ok: false, error: error.message };

  await service.from("audit_log").insert({
    actor_user_id: user.id,
    tenant_id: tenant.id,
    action: "tenant.branded_pwa_publication_reset",
    target_type: "tenant",
    target_id: tenant.id,
    payload: value,
  });

  revalidateBrandingSurfaces();
  return { ok: true };
}

function parseOptionalNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

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

  try {
    await recomputeLeadScoresForTenant(service, tenant.id, user.id);
  } catch (err) {
    console.error("[settings] lead score recompute failed", err);
  }

  revalidatePath("/backoffice/instellingen");
  revalidatePath("/backoffice/leads");
  return { ok: true };
}

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

export async function saveStudentSelfBookingPolicy(
  formData: FormData,
): Promise<PolicyActionResult> {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);

  const policy = mergeStudentSelfBookingPolicy({
    self_booking_enabled: formData.get("self_booking_enabled") === "true",
    students_can_book_lessons:
      formData.get("students_can_book_lessons") === "true",
    students_can_reschedule_lessons:
      formData.get("students_can_reschedule_lessons") === "true",
    students_can_cancel_lessons:
      formData.get("students_can_cancel_lessons") === "true",
    manual_approval_required:
      formData.get("manual_approval_required") === "true",
    instructor_approval_required:
      formData.get("instructor_approval_required") === "true",
    student_final_confirmation_required:
      formData.get("student_final_confirmation_required") === "true",
    allow_booking_with_unpaid_invoice:
      formData.get("allow_booking_with_unpaid_invoice") === "true",
    allow_booking_without_sufficient_credit:
      formData.get("allow_booking_without_sufficient_credit") === "true",
    max_future_bookings_per_student: formData.get(
      "max_future_bookings_per_student",
    ),
    max_lessons_per_week: formData.get("max_lessons_per_week"),
    min_notice_hours_for_booking: formData.get(
      "min_notice_hours_for_booking",
    ),
    booking_window_days: formData.get("booking_window_days"),
  });

  const service = createServiceRoleClient();
  const { error } = await service.from("tenant_settings").upsert(
    {
      tenant_id: tenant.id,
      key: STUDENT_SELF_BOOKING_POLICY_KEY,
      value: policy,
    },
    { onConflict: "tenant_id,key" },
  );
  if (error) return { ok: false, error: error.message };

  await service.from("audit_log").insert({
    actor_user_id: user.id,
    tenant_id: tenant.id,
    action: "student_self_booking.policy_updated",
    target_type: "tenant",
    target_id: tenant.id,
    payload: policy,
  });

  revalidatePath("/backoffice/instellingen");
  revalidatePath("/student/lessons");
  return { ok: true };
}

export async function resetStudentSelfBookingPolicy(): Promise<PolicyActionResult> {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);

  const service = createServiceRoleClient();
  const { error } = await service.from("tenant_settings").upsert(
    {
      tenant_id: tenant.id,
      key: STUDENT_SELF_BOOKING_POLICY_KEY,
      value: DEFAULT_STUDENT_SELF_BOOKING_POLICY,
    },
    { onConflict: "tenant_id,key" },
  );
  if (error) return { ok: false, error: error.message };

  await service.from("audit_log").insert({
    actor_user_id: user.id,
    tenant_id: tenant.id,
    action: "student_self_booking.policy_reset",
    target_type: "tenant",
    target_id: tenant.id,
    payload: DEFAULT_STUDENT_SELF_BOOKING_POLICY,
  });

  revalidatePath("/backoffice/instellingen");
  revalidatePath("/student/lessons");
  return { ok: true };
}

export async function saveTenantWorkflowCatalog(
  formData: FormData,
): Promise<PolicyActionResult> {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const raw = formData.get("settings");
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, error: "Workflowconfiguratie ontbreekt." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Workflowconfiguratie is geen geldige JSON." };
  }

  const service = createServiceRoleClient();
  const { data: currentRow, error: currentError } = await service
    .from("tenant_settings")
    .select("value")
    .eq("tenant_id", tenant.id)
    .eq("key", TENANT_WORKFLOW_CATALOG_KEY)
    .maybeSingle();
  if (currentError) return { ok: false, error: currentError.message };

  const previous = mergeTenantWorkflowCatalogSettings(currentRow?.value);
  const next = mergeTenantWorkflowCatalogSettings(parsed);
  const { error } = await service.from("tenant_settings").upsert(
    {
      tenant_id: tenant.id,
      key: TENANT_WORKFLOW_CATALOG_KEY,
      value: next,
    },
    { onConflict: "tenant_id,key" },
  );
  if (error) return { ok: false, error: error.message };

  await service.from("audit_log").insert({
    actor_user_id: user.id,
    tenant_id: tenant.id,
    action: "tenant.workflow_catalog_saved",
    target_type: "tenant",
    target_id: tenant.id,
    payload: { previous, next },
  });

  revalidatePath("/backoffice/instellingen");
  revalidatePath("/backoffice/instellingen/workflows");
  return { ok: true };
}

export async function resetTenantWorkflowCatalog(): Promise<PolicyActionResult> {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const service = createServiceRoleClient();

  const { data: currentRow, error: currentError } = await service
    .from("tenant_settings")
    .select("value")
    .eq("tenant_id", tenant.id)
    .eq("key", TENANT_WORKFLOW_CATALOG_KEY)
    .maybeSingle();
  if (currentError) return { ok: false, error: currentError.message };

  const previous = mergeTenantWorkflowCatalogSettings(currentRow?.value);
  const next = DEFAULT_TENANT_WORKFLOW_CATALOG;
  const { error } = await service.from("tenant_settings").upsert(
    {
      tenant_id: tenant.id,
      key: TENANT_WORKFLOW_CATALOG_KEY,
      value: next,
    },
    { onConflict: "tenant_id,key" },
  );
  if (error) return { ok: false, error: error.message };

  await service.from("audit_log").insert({
    actor_user_id: user.id,
    tenant_id: tenant.id,
    action: "tenant.workflow_catalog_reset",
    target_type: "tenant",
    target_id: tenant.id,
    payload: { previous, next },
  });

  revalidatePath("/backoffice/instellingen");
  revalidatePath("/backoffice/instellingen/workflows");
  return { ok: true };
}

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

export async function addTenantDomain(
  formData: FormData,
): Promise<PolicyActionResult> {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const platformOnly = platformOnlyResult(user.profile?.is_platform_admin === true);
  if (platformOnly) return platformOnly;

  const service = createServiceRoleClient();
  const snapshot = await loadTenantEntitlementSnapshot(service, tenant.id);
  if (!snapshot.featureAccess.white_label.allowed) {
    return {
      ok: false,
      error: "Eigen domeinen vereisen het Elite-abonnement.",
    };
  }

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

  if (classified.type === "custom") {
    const domainLimit = snapshot.limitStatuses.custom_domains;
    if (domainLimit.isAtLimit) {
      return {
        ok: false,
        error: `Je hebt het maximum aantal eigen domeinen bereikt (${domainLimit.limitLabel}).`,
      };
    }
  }
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
  const platformOnly = platformOnlyResult(user.profile?.is_platform_admin === true);
  if (platformOnly) return platformOnly;

  const service = createServiceRoleClient();
  const snapshot = await loadTenantEntitlementSnapshot(service, tenant.id);
  if (!snapshot.featureAccess.white_label.allowed) {
    return {
      ok: false,
      error: "Eigen domeinen vereisen het Elite-abonnement.",
    };
  }
  const domainId = String(formData.get("domain_id") ?? "").trim();
  if (!domainId) {
    return { ok: false, error: "Onbekend domein." };
  }

  const { data: domain, error: loadErr } = await service
    .from("tenant_domains")
    .select("id, tenant_id, hostname, type, status, verification_token")
    .eq("id", domainId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (loadErr || !domain) {
    return { ok: false, error: "Domein niet gevonden." };
  }

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
  const platformOnly = platformOnlyResult(user.profile?.is_platform_admin === true);
  if (platformOnly) return platformOnly;

  const service = createServiceRoleClient();
  const snapshot = await loadTenantEntitlementSnapshot(service, tenant.id);
  if (!snapshot.featureAccess.white_label.allowed) {
    return {
      ok: false,
      error: "Eigen domeinen vereisen het Elite-abonnement.",
    };
  }
  const domainId = String(formData.get("domain_id") ?? "").trim();
  if (!domainId) {
    return { ok: false, error: "Onbekend domein." };
  }

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
  const platformOnly = platformOnlyResult(user.profile?.is_platform_admin === true);
  if (platformOnly) return platformOnly;

  const service = createServiceRoleClient();
  const snapshot = await loadTenantEntitlementSnapshot(service, tenant.id);
  if (!snapshot.featureAccess.white_label.allowed) {
    return {
      ok: false,
      error: "Eigen domeinen vereisen het Elite-abonnement.",
    };
  }
  const domainId = String(formData.get("domain_id") ?? "").trim();
  if (!domainId) {
    return { ok: false, error: "Onbekend domein." };
  }

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
