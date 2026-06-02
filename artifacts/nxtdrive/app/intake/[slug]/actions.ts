"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  INTAKE_APPLICANT_TYPES,
  INTAKE_DAYPARTS,
  INTAKE_LICENSE_GOALS,
  INTAKE_PACES,
  INTAKE_STATUSES,
  INTAKE_TRANSMISSIONS,
  INTAKE_WEEKDAYS,
  LEAD_SOURCES,
  type IntakeApplicantType,
  type IntakeLicenseGoal,
  type IntakePace,
  type IntakeStatus,
  type IntakeTransmission,
  type LeadSource,
} from "@/lib/leads/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d][\d\s\-()]{5,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function err(slug: string, message: string): never {
  redirect(`/intake/${slug}?error=${encodeURIComponent(message)}`);
}

function trimOrNull(value: FormDataEntryValue | null, max = 200): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().slice(0, max);
  return v.length > 0 ? v : null;
}

/** "true"/"false"/"" form value → boolean | null (null = unknown). */
function triBool(value: FormDataEntryValue | null): boolean | null {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function oneOf<T extends string>(
  value: FormDataEntryValue | null,
  allowed: readonly T[],
): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/** A required date (yyyy-mm-dd) or null if absent; throws via err on invalid. */
function dateOrNull(
  slug: string,
  value: FormDataEntryValue | null,
  label: string,
): string | null {
  const v = trimOrNull(value, 10);
  if (!v) return null;
  if (!DATE_RE.test(v) || Number.isNaN(Date.parse(v))) {
    err(slug, `Vul een geldige datum in bij ${label}.`);
  }
  return v;
}

function filterList<T extends string>(
  values: FormDataEntryValue[],
  allowed: readonly T[],
): T[] {
  const set = new Set<string>();
  for (const v of values) {
    if (typeof v === "string" && (allowed as readonly string[]).includes(v)) {
      set.add(v);
    }
  }
  return Array.from(set) as T[];
}

export async function submitIntake(formData: FormData) {
  const slug = String(formData.get("tenant_slug") ?? "").trim();
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) {
    redirect("/");
  }

  // Honeypot — silently accept and redirect, do not reveal the trap.
  if (String(formData.get("website_url") ?? "").trim() !== "") {
    redirect(`/intake/${slug}/thanks`);
  }

  // --- Step 1: person -----------------------------------------------------
  const full_name = trimOrNull(formData.get("full_name"));
  const email = trimOrNull(formData.get("email"))?.toLowerCase() ?? null;
  const phone = trimOrNull(formData.get("phone"), 50);
  const applicant_type: IntakeApplicantType =
    oneOf(formData.get("applicant_type"), INTAKE_APPLICANT_TYPES) ?? "student";
  const date_of_birth = dateOrNull(slug, formData.get("date_of_birth"), "geboortedatum");
  const city = trimOrNull(formData.get("city"), 200);
  const pickup_location = trimOrNull(formData.get("pickup_location"), 200);

  if (!full_name) err(slug, "Vul je naam in.");
  if (!email && !phone)
    err(slug, "Vul minimaal een e-mailadres of telefoonnummer in.");
  if (email && !EMAIL_RE.test(email)) err(slug, "Vul een geldig e-mailadres in.");
  if (phone && !PHONE_RE.test(phone))
    err(slug, "Vul een geldig telefoonnummer in.");

  // --- Step 2: driving education -----------------------------------------
  const license_goal: IntakeLicenseGoal | null = oneOf(
    formData.get("license_goal"),
    INTAKE_LICENSE_GOALS,
  );
  const transmission: IntakeTransmission | null = oneOf(
    formData.get("transmission"),
    INTAKE_TRANSMISSIONS,
  );
  if (!license_goal) err(slug, "Kies een rijbewijsdoel.");
  if (!transmission) err(slug, "Kies schakel of automaat.");
  const has_driving_experience = triBool(formData.get("has_driving_experience"));
  const had_lessons_before = triBool(formData.get("had_lessons_before"));
  const has_done_exam = triBool(formData.get("has_done_exam"));
  const theory_status: IntakeStatus =
    oneOf(formData.get("theory_status"), INTAKE_STATUSES) ?? "unknown";
  const health_declaration_status: IntakeStatus =
    oneOf(formData.get("health_declaration_status"), INTAKE_STATUSES) ?? "unknown";
  const cbr_authorization_status: IntakeStatus =
    oneOf(formData.get("cbr_authorization_status"), INTAKE_STATUSES) ?? "unknown";

  // --- Step 3: availability ----------------------------------------------
  const preferred_days = filterList(
    formData.getAll("preferred_days"),
    INTAKE_WEEKDAYS,
  );
  const preferred_times = filterList(
    formData.getAll("preferred_times"),
    INTAKE_DAYPARTS,
  );
  const weekly_availability = trimOrNull(formData.get("weekly_availability"), 500);
  const desired_start_date = dateOrNull(
    slug,
    formData.get("desired_start_date"),
    "gewenste startdatum",
  );
  let lessons_per_week: number | null = null;
  const lpwRaw = trimOrNull(formData.get("lessons_per_week"), 4);
  if (lpwRaw) {
    const n = Number.parseInt(lpwRaw, 10);
    if (!Number.isInteger(n) || n < 1 || n > 14)
      err(slug, "Aantal lessen per week moet tussen 1 en 14 liggen.");
    lessons_per_week = n;
  }

  // --- Step 4: learner profile -------------------------------------------
  const pace: IntakePace | null = oneOf(formData.get("pace"), INTAKE_PACES);
  const has_anxiety = triBool(formData.get("has_anxiety"));
  const remarks = trimOrNull(formData.get("remarks"), 2000);

  // --- Step 5: agreements -------------------------------------------------
  const terms_accepted = formData.get("terms_accepted") === "on";
  if (!terms_accepted)
    err(slug, "Je moet akkoord gaan met de voorwaarden en privacyverklaring.");

  const rawSource = String(formData.get("source") ?? "website") as LeadSource;
  const source: LeadSource = LEAD_SOURCES.includes(rawSource)
    ? rawSource
    : "website";

  const service = createServiceRoleClient();

  const { data: tenant, error: tErr } = await service
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (tErr || !tenant) err(slug, "Deze rijschool is niet gevonden.");

  const hdrs = await headers();
  const ipHeader =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    hdrs.get("x-real-ip") ??
    null;
  const userAgent = hdrs.get("user-agent") ?? null;

  // Transactional RPC: lead + intake detail + lead_event + audit_log atomically.
  const { error: rpcErr } = await service.rpc("create_lead_with_intake", {
    p_tenant_id: tenant.id,
    p_source: source,
    p_full_name: full_name,
    p_email: email,
    p_phone: phone,
    p_applicant_type: applicant_type,
    p_date_of_birth: date_of_birth,
    p_city: city,
    p_pickup_location: pickup_location,
    p_license_goal: license_goal,
    p_transmission: transmission,
    p_has_driving_experience: has_driving_experience,
    p_had_lessons_before: had_lessons_before,
    p_has_done_exam: has_done_exam,
    p_theory_status: theory_status,
    p_health_declaration_status: health_declaration_status,
    p_cbr_authorization_status: cbr_authorization_status,
    p_preferred_days: preferred_days,
    p_preferred_times: preferred_times,
    p_weekly_availability: weekly_availability,
    p_desired_start_date: desired_start_date,
    p_lessons_per_week: lessons_per_week,
    p_pace: pace,
    p_has_anxiety: has_anxiety,
    p_remarks: remarks,
    p_terms_accepted: terms_accepted,
    p_submitted_ip: ipHeader,
    p_user_agent: userAgent,
  });

  if (rpcErr) {
    err(slug, "Er ging iets mis bij het versturen. Probeer het opnieuw.");
  }

  redirect(`/intake/${slug}/thanks`);
}
