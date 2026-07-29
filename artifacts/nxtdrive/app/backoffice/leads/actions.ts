"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  getPlanningPreview,
  loadPlanningKernelData,
  type PlanningActorAccess,
  type PlanningCandidateInput,
} from "@/lib/planning-core";
import {
  LEAD_STATUSES,
  LEAD_SOURCES,
  type Lead,
  type LeadIntakeDetail,
  type LeadSource,
  type LeadStatus,
} from "@/lib/leads/types";
import { requireLeadBackofficeAccess } from "@/lib/leads/access";
import { reconcileLeadSafe } from "@/lib/leads/automation";
import { LEAD_ELIGIBLE_STATUSES } from "@/lib/lesson-planning/candidates";
import { notifyTrialLessonConfirmed } from "@/lib/notifications/dispatch";
import { generateTemporaryPassword } from "@/lib/auth/generate-password";
import { loadEmailBranding } from "@/lib/notifications/branding";
import { renderStudentWelcome } from "@/lib/notifications/templates";
import { sendEmail } from "@/lib/notifications/provider";
import { getPlatformEmailConfig } from "@/lib/email/platform-config";
import { loadTenantEntitlementSnapshot } from "@/lib/platform/entitlements";
import {
  analyzeIntake,
  intakeAttentionDedupeKey,
  intakeAttentionTask,
  type IntakeAttentionPoint,
  type LeadIntakeAnalysis,
} from "@/lib/leads/intake-analysis";
import { primeAiClientIfNeeded } from "@/lib/ai/platform-config";
import {
  generatePackageAdvice,
  type PackageAdvice,
} from "@/lib/ai/leskaart-advisor";
import { isFeatureEnabled } from "@/lib/features/flags";
import {
  completeBookingHold,
  createBookingConfirmationsForCandidate,
  createBookingHold,
  releaseBookingHold,
  respondBookingConfirmation,
} from "@/lib/smart-booking/service";
import type { MemberRole } from "@/lib/types";

export async function convertLeadToStudent(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const leadId = String(formData.get("lead_id") ?? "");
  const rawPackage = String(formData.get("package_id") ?? "").trim();
  const packageId = rawPackage === "" ? null : rawPackage;
  if (!leadId) redirect("/backoffice/leads");

  const service = createServiceRoleClient();
  const { lead } = await requireLeadBackofficeAccess(service, leadId, "admin");
  if (!lead) redirect("/backoffice/leads");

  const { data: studentId, error } = await service.rpc(
    "convert_lead_to_student",
    {
      p_lead_id: leadId,
      p_tenant_id: tenant.id,
      p_actor: user.id,
      p_package_id: packageId,
    },
  );
  if (error || !studentId) redirect(`/backoffice/leads/${leadId}`);

  const newStudentId = studentId as string;

  // Provision a Supabase Auth user and send a welcome email with temporary
  // credentials. Best-effort: a failure here never blocks the conversion.
  try {
    const { data: studentRow } = await service
      .from("students")
      .select("full_name, email, user_id")
      .eq("id", newStudentId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();

    const studentEmail = (studentRow as { full_name: string; email: string | null; user_id: string | null } | null)?.email;
    const studentName = (studentRow as { full_name: string; email: string | null; user_id: string | null } | null)?.full_name ?? "";
    const existingUserId = (studentRow as { full_name: string; email: string | null; user_id: string | null } | null)?.user_id;

    if (studentEmail && !existingUserId) {
      const tijdelijkWachtwoord = generateTemporaryPassword();

      const { data: created, error: createErr } =
        await service.auth.admin.createUser({
          email: studentEmail,
          password: tijdelijkWachtwoord,
          email_confirm: true,
          user_metadata: { must_change_password: true, full_name: studentName },
        });

      if (!createErr && created.user) {
        const newUserId = created.user.id;

        // Wire up profile + membership (idempotent upsert).
        await service.from("profiles").upsert(
          { id: newUserId, email: studentEmail, full_name: studentName },
          { onConflict: "id" },
        );
        await service.from("memberships").upsert(
          { user_id: newUserId, tenant_id: tenant.id, role: "student" },
          { onConflict: "user_id,tenant_id,role" },
        );
        // Link the auth user to the student row.
        await service
          .from("students")
          .update({ user_id: newUserId })
          .eq("id", newStudentId)
          .eq("tenant_id", tenant.id);

        const appUrl =
          process.env["NEXT_PUBLIC_APP_URL"] ??
          process.env["NEXTAUTH_URL"] ??
          "https://nxtdrive.io";
        const [branding, platformConfig] = await Promise.all([
          loadEmailBranding(service, tenant.id),
          getPlatformEmailConfig(service).catch(() => null),
        ]);
        const emailContent = renderStudentWelcome(branding, {
          studentName,
          email: studentEmail,
          temporaryPassword: tijdelijkWachtwoord,
          loginUrl: `${appUrl}/login`,
        });
        await sendEmail({
          to: studentEmail,
          fromName: branding.tenantName,
          email: emailContent,
          platformConfig: platformConfig ?? undefined,
        });
      }
    }
  } catch {
    // Best-effort — conversion already succeeded.
  }

  revalidatePath(`/backoffice/leads/${leadId}`);
  revalidatePath("/backoffice/leads");
  revalidatePath("/backoffice/leerlingen");
  redirect(`/backoffice/leerlingen/${newStudentId}`);
}

function isValidStatus(v: unknown): v is LeadStatus {
  return typeof v === "string" && (LEAD_STATUSES as readonly string[]).includes(v);
}

export async function updateStatus(formData: FormData) {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const leadId = String(formData.get("lead_id") ?? "");
  const next = formData.get("status");
  if (!leadId || !isValidStatus(next)) redirect("/backoffice/leads");

  const service = createServiceRoleClient();
  const { lead } = await requireLeadBackofficeAccess(service, leadId, "collaborate");
  if (!lead) redirect("/backoffice/leads");

  const { error } = await service.rpc("update_lead_status", {
    p_lead_id: leadId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_to: next,
  });
  if (error) {
    // RPC raises when the lead is not in this tenant — fall back to the list.
    redirect("/backoffice/leads");
  }

  // Task #54 — recompute action status, score and tasks for the new step.
  await reconcileLeadSafe(service, tenant.id, leadId, user.id);

  revalidatePath(`/backoffice/leads/${leadId}`);
  revalidatePath("/backoffice/leads");
  redirect(`/backoffice/leads/${leadId}`);
}

// ---------------------------------------------------------------------------
// Fase 2 — Slimme Proeflesplanner: backoffice trial-lesson actions.
// ---------------------------------------------------------------------------

const TRIAL_DURATIONS = [60, 90, 120] as const;

function planningActorForLeadFlow(input: {
  userId: string;
  tenantId: string;
  roles: readonly MemberRole[];
  isPlatformAdmin?: boolean;
  branchId?: string | null;
}): PlanningActorAccess {
  const canManageTenant =
    Boolean(input.isPlatformAdmin) ||
    input.roles.includes("tenant_admin") ||
    input.roles.includes("franchise_admin");
  return {
    userId: input.userId,
    roles: input.roles,
    isPlatformAdmin: Boolean(input.isPlatformAdmin),
    tenantIds: canManageTenant ? [input.tenantId] : [],
    branchAccess: [
      {
        tenantId: input.tenantId,
        branchIds: canManageTenant
          ? "all"
          : input.branchId
            ? [input.branchId]
            : "all",
      },
    ],
  };
}

function trialRequiredTransmission(
  value: Lead["preferred_transmission"],
): PlanningCandidateInput["requiredTransmission"] {
  if (value === "manual") return "schakel";
  if (value === "automatic") return "automaat";
  return null;
}

function planningBlockMessage(
  reasons: readonly { message: string }[],
): string {
  return reasons[0]?.message ?? "Dit proeflesmoment past niet binnen de planning.";
}

async function validateTrialPlanning(input: {
  userId: string;
  roles: readonly MemberRole[];
  isPlatformAdmin?: boolean;
  lead: Lead;
  instructorId: string;
  startsAt: Date;
  durationMin: number;
  trialId?: string | null;
}): Promise<string | null> {
  const endsAt = new Date(input.startsAt.getTime() + input.durationMin * 60000);
  const service = createServiceRoleClient();
  const planningInput: PlanningCandidateInput = {
    actor: planningActorForLeadFlow({
      userId: input.userId,
      tenantId: input.lead.tenant_id,
      roles: input.roles,
      isPlatformAdmin: input.isPlatformAdmin,
      branchId: input.lead.branch_id,
    }),
    scope: input.lead.branch_id
      ? { type: "branch", tenantId: input.lead.tenant_id, branchId: input.lead.branch_id }
      : { type: "tenant", tenantId: input.lead.tenant_id },
    entityType: "trial_lesson",
    entityId: input.trialId ?? null,
    tenantId: input.lead.tenant_id,
    branchId: input.lead.branch_id,
    instructorId: input.instructorId,
    vehicleId: null,
    startAt: input.startsAt,
    endAt: endsAt,
    pickupServiceAreaId: null,
    requiredTransmission: trialRequiredTransmission(input.lead.preferred_transmission),
  };
  const kernelData = await loadPlanningKernelData(service, planningInput);
  const validation = await getPlanningPreview(planningInput, kernelData);
  return validation.allowed ? null : planningBlockMessage(validation.blockingReasons);
}

export async function confirmTrialLesson(formData: FormData) {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const leadId = String(formData.get("lead_id") ?? "");
  const trialId = String(formData.get("trial_id") ?? "");
  if (!leadId || !trialId) redirect("/backoffice/leads");

  const service = createServiceRoleClient();
  const { lead } = await requireLeadBackofficeAccess(service, leadId, "collaborate");
  if (!lead) redirect("/backoffice/leads");

  const { error } = await service.rpc("confirm_trial_lesson", {
    p_trial_id: trialId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
  });
  if (error) {
    redirect(`/backoffice/leads/${leadId}?trial=error`);
  }

  await reconcileLeadSafe(service, tenant.id, leadId, user.id);

  // Task #61 — email the prospect that their proefles is confirmed.
  // Best-effort + idempotent: a failure here must never fail the confirmation,
  // and it degrades gracefully when SendGrid is not yet connected.
  try {
    await notifyTrialLessonConfirmed(service, tenant.id, trialId);
  } catch (e) {
    console.error("[trial] notifyTrialLessonConfirmed failed", e);
  }

  revalidatePath(`/backoffice/leads/${leadId}`);
  revalidatePath("/backoffice/agenda");
  redirect(`/backoffice/leads/${leadId}`);
}

/**
 * Task #92 — book a (provisional) trial lesson for a lead on a freed slot. Used
 * by the "slim herbezetten" flow when the planner picks a lead candidate for a
 * cancelled lesson's slot. Provisional only — never auto-confirmed; the planner
 * still confirms via the normal trial flow. Service role (mutation).
 */
export async function confirmTrialBookingPreference(formData: FormData) {
  const { user, tenant, roles } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const leadId = String(formData.get("lead_id") ?? "").trim();
  const preferenceId = String(formData.get("booking_preference_id") ?? "").trim();
  if (!leadId || !preferenceId) redirect("/backoffice/leads");

  const service = createServiceRoleClient();
  const { lead } = await requireLeadBackofficeAccess(service, leadId, "collaborate");
  if (!lead) redirect("/backoffice/leads");
  if (!(LEAD_ELIGIBLE_STATUSES as readonly string[]).includes(lead.status)) {
    redirect(`/backoffice/leads/${leadId}?trial=ineligible`);
  }

  const { data: linkedStudent } = await service
    .from("students")
    .select("id")
    .eq("lead_id", leadId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (linkedStudent) {
    redirect(`/backoffice/leads/${leadId}?trial=ineligible`);
  }

  const { data: activeTrial } = await service
    .from("trial_lessons")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("lead_id", leadId)
    .in("status", ["provisional", "confirmed"])
    .maybeSingle();
  if (activeTrial) {
    redirect(`/backoffice/leads/${leadId}?trial=ineligible`);
  }

  const { data: preferenceRaw, error: preferenceError } = await service
    .from("booking_candidate_preferences")
    .select(
      `
        id,
        tenant_id,
        booking_request_id,
        booking_candidate_id,
        status,
        booking_candidates (
          id,
          instructor_id,
          starts_at,
          ends_at,
          duration_min,
          pickup_location,
          pickup_lat,
          pickup_lng,
          pickup_place_id,
          pickup_formatted_address,
          score,
          route_status,
          route_travel_to_min,
          route_travel_from_min,
          route_needs_confirm,
          reason,
          status
        ),
        booking_requests (
          id,
          lead_id,
          tenant_id,
          branch_id,
          entity_type,
          status
        )
      `,
    )
    .eq("id", preferenceId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  type PreferenceRow = {
    id: string;
    tenant_id: string;
    booking_request_id: string;
    booking_candidate_id: string;
    status: string;
    booking_candidates: {
      id: string;
      instructor_id: string;
      starts_at: string;
      ends_at: string;
      duration_min: number;
      pickup_location: string | null;
      pickup_lat: number | null;
      pickup_lng: number | null;
      pickup_place_id: string | null;
      pickup_formatted_address: string | null;
      score: number | null;
      route_status: string | null;
      route_travel_to_min: number | null;
      route_travel_from_min: number | null;
      route_needs_confirm: boolean | null;
      reason: string | null;
      status: string;
    } | null;
    booking_requests: {
      id: string;
      lead_id: string | null;
      tenant_id: string;
      branch_id: string | null;
      entity_type: string;
      status: string;
    } | null;
  };

  const preference = preferenceRaw as unknown as PreferenceRow | null;
  const candidate = preference?.booking_candidates ?? null;
  const request = preference?.booking_requests ?? null;
  if (
    preferenceError ||
    !preference ||
    !candidate ||
    !request ||
    request.lead_id !== leadId ||
    request.tenant_id !== tenant.id ||
    request.entity_type !== "trial_lesson" ||
    !["selected", "confirmed"].includes(preference.status)
  ) {
    redirect(`/backoffice/leads/${leadId}?trial=error`);
  }

  const startMs = Date.parse(candidate.starts_at);
  if (Number.isNaN(startMs) || startMs <= Date.now()) {
    redirect(`/backoffice/leads/${leadId}?trial=error`);
  }
  const durationMin = [60, 90, 120].includes(candidate.duration_min)
    ? candidate.duration_min
    : 60;

  const planningError = await validateTrialPlanning({
    userId: user.id,
    roles,
    isPlatformAdmin: Boolean(user.profile?.is_platform_admin),
    lead,
    instructorId: candidate.instructor_id,
    startsAt: new Date(startMs),
    durationMin,
  });
  if (planningError) {
    redirect(`/backoffice/leads/${leadId}?trial=${encodeURIComponent(planningError)}`);
  }

  const { data: existingConfirmationsRaw } = await service
    .from("booking_confirmations")
    .select("id, actor_type, status")
    .eq("tenant_id", tenant.id)
    .eq("booking_request_id", request.id)
    .eq("booking_candidate_id", candidate.id);
  const existingConfirmations = (existingConfirmationsRaw ?? []) as {
    id: string;
    actor_type: string;
    status: string;
  }[];
  const hasPendingInstructor = existingConfirmations.some(
    (c) => c.actor_type === "instructor" && c.status === "pending",
  );
  if (hasPendingInstructor) {
    revalidatePath(`/backoffice/leads/${leadId}`);
    redirect(`/backoffice/leads/${leadId}?booking=pending_instructor`);
  }
  const hasAcceptedInstructor = existingConfirmations.some(
    (c) => c.actor_type === "instructor" && c.status === "accepted",
  );
  const requiresInstructor =
    Boolean(candidate.route_needs_confirm) &&
    candidate.instructor_id !== user.id &&
    !hasAcceptedInstructor;

  let holdId: string | null = null;
  let pendingInstructor = false;
  try {
    await createBookingConfirmationsForCandidate(service, {
      tenantId: tenant.id,
      bookingRequestId: request.id,
      bookingCandidateId: candidate.id,
      actor: user.id,
      requiresBackoffice: true,
      requiresInstructor,
      requiresStudent: false,
      backofficeExpiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      instructorExpiresAt: requiresInstructor
        ? new Date(Date.now() + 24 * 60 * 60_000).toISOString()
        : null,
      metadata: { source: "lead_detail_confirm_preference" },
    });

    const { data: backofficeConfirmationRaw, error: backofficeConfirmationError } =
      await service
        .from("booking_confirmations")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("booking_request_id", request.id)
        .eq("booking_candidate_id", candidate.id)
        .eq("actor_type", "backoffice")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    const backofficeConfirmationId =
      typeof backofficeConfirmationRaw?.id === "string"
        ? backofficeConfirmationRaw.id
        : null;
    if (backofficeConfirmationError || !backofficeConfirmationId) {
      throw new Error("Backoffice confirmation was not created.");
    }

    const nextStatus = await respondBookingConfirmation(service, {
      tenantId: tenant.id,
      bookingConfirmationId: backofficeConfirmationId,
      actor: user.id,
      response: "accepted",
      metadata: { source: "lead_detail_confirm_preference" },
    });

    if (nextStatus === "pending_instructor") {
      pendingInstructor = true;
    } else if (nextStatus !== "candidates_ready") {
      throw new Error(`Unexpected booking status ${nextStatus}.`);
    }

    if (!pendingInstructor) {
      holdId = await createBookingHold(service, {
        tenantId: tenant.id,
        bookingRequestId: request.id,
        bookingCandidateId: candidate.id,
        actor: user.id,
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      });

      const { data: trialId, error: bookError } = await service.rpc(
        "book_trial_lesson",
        {
          p_lead_id: leadId,
          p_tenant_id: tenant.id,
          p_instructor_id: candidate.instructor_id,
          p_starts_at: new Date(startMs).toISOString(),
          p_duration_min: durationMin,
          p_pickup_location:
            candidate.pickup_formatted_address ?? candidate.pickup_location,
          p_score: candidate.score ?? 0,
          p_reason: candidate.reason ?? "Door leerling gekozen voorkeur",
          p_pickup_lat: candidate.pickup_lat,
          p_pickup_lng: candidate.pickup_lng,
          p_pickup_place_id: candidate.pickup_place_id,
          p_pickup_formatted_address: candidate.pickup_formatted_address,
          p_route_status: candidate.route_status ?? "unavailable",
          p_route_travel_to_min: candidate.route_travel_to_min,
          p_route_travel_from_min: candidate.route_travel_from_min,
          p_route_needs_confirm: Boolean(candidate.route_needs_confirm),
        },
      );
      if (bookError || typeof trialId !== "string") {
        throw new Error(bookError?.message ?? "Trial lesson booking failed.");
      }

      const { error: confirmError } = await service.rpc("confirm_trial_lesson", {
        p_trial_id: trialId,
        p_tenant_id: tenant.id,
        p_actor: user.id,
      });
      if (confirmError) throw new Error(confirmError.message);

      await completeBookingHold(service, {
        tenantId: tenant.id,
        bookingHoldId: holdId,
        actor: user.id,
        confirmedEntityType: "trial_lesson",
        confirmedEntityId: trialId,
      });
      await service
        .from("booking_candidate_preferences")
        .update({ status: "confirmed" })
        .eq("id", preference.id)
        .eq("tenant_id", tenant.id);

      await reconcileLeadSafe(service, tenant.id, leadId, user.id);
      try {
        await notifyTrialLessonConfirmed(service, tenant.id, trialId);
      } catch (e) {
        console.error("[trial] notifyTrialLessonConfirmed failed", e);
      }
    }
  } catch (e) {
    if (holdId) {
      try {
        await releaseBookingHold(service, {
          tenantId: tenant.id,
          bookingHoldId: holdId,
          actor: user.id,
          reason: "trial_confirmation_failed",
        });
      } catch (releaseError) {
        console.error("[trial] releaseBookingHold failed", releaseError);
      }
    }
    console.error("[trial] confirmTrialBookingPreference failed", e);
    redirect(`/backoffice/leads/${leadId}?trial=error`);
  }

  revalidatePath(`/backoffice/leads/${leadId}`);
  revalidatePath("/backoffice/agenda");
  redirect(
    pendingInstructor
      ? `/backoffice/leads/${leadId}?booking=pending_instructor`
      : `/backoffice/leads/${leadId}?booking=confirmed`,
  );
}

export async function respondTrialBookingConfirmation(formData: FormData) {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const leadId = String(formData.get("lead_id") ?? "").trim();
  const confirmationId = String(formData.get("booking_confirmation_id") ?? "").trim();
  const response = String(formData.get("response") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500) || null;
  if (!leadId || !confirmationId || !["accepted", "declined"].includes(response)) {
    redirect(leadId ? `/backoffice/leads/${leadId}` : "/backoffice/leads");
  }

  const service = createServiceRoleClient();
  const { lead } = await requireLeadBackofficeAccess(service, leadId, "collaborate");
  if (!lead) redirect("/backoffice/leads");

  let nextStatus = "error";
  try {
    nextStatus = await respondBookingConfirmation(service, {
      tenantId: tenant.id,
      bookingConfirmationId: confirmationId,
      actor: user.id,
      response: response as "accepted" | "declined",
      reason,
      metadata: { source: "lead_detail_confirmation_response" },
    });
  } catch (e) {
    console.error("[trial] respondTrialBookingConfirmation failed", e);
    redirect(`/backoffice/leads/${leadId}?booking=error`);
  }

  revalidatePath(`/backoffice/leads/${leadId}`);
  revalidatePath("/backoffice/agenda");
  redirect(`/backoffice/leads/${leadId}?booking=${encodeURIComponent(nextStatus)}`);
}

export async function bookTrialAtSlot(formData: FormData) {
  const { user, tenant, roles } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const leadId = String(formData.get("lead_id") ?? "").trim();
  const instructorId = String(formData.get("instructor_id") ?? "").trim();
  const startsAt = String(formData.get("starts_at") ?? "").trim();
  const durationRaw = Number(formData.get("duration_min"));
  const pickupLocation =
    String(formData.get("pickup_location") ?? "").trim() || null;
  const pickupFormattedAddress =
    String(formData.get("pickup_formatted_address") ?? "").trim() || null;
  const parseCoord = (raw: FormDataEntryValue | null, max: number) => {
    if (typeof raw !== "string" || raw.trim() === "") return null;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) && n >= -max && n <= max ? n : null;
  };
  const parseOptionalInt = (raw: FormDataEntryValue | null) => {
    if (typeof raw !== "string" || raw.trim() === "") return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  };
  const pickupLat = parseCoord(formData.get("pickup_lat"), 90);
  const pickupLng = parseCoord(formData.get("pickup_lng"), 180);
  const pickupPlaceId =
    String(formData.get("pickup_place_id") ?? "").trim().slice(0, 300) || null;
  const routeStatusRaw = String(formData.get("route_status") ?? "").trim();
  const routeStatus = ["computed", "estimated", "unavailable"].includes(routeStatusRaw)
    ? routeStatusRaw
    : "unavailable";
  const routeTravelToMin = parseOptionalInt(formData.get("route_travel_to_min"));
  const routeTravelFromMin = parseOptionalInt(
    formData.get("route_travel_from_min"),
  );
  const routeNeedsConfirm =
    String(formData.get("route_needs_confirm") ?? "") === "true";
  const reason =
    String(formData.get("reason") ?? "").trim().slice(0, 500) ||
    "Herbezetting vrijgekomen moment";
  if (!leadId || !instructorId || !startsAt) {
    redirect(leadId ? `/backoffice/leads/${leadId}` : "/backoffice/leads");
  }
  // The RPC only accepts 60/90/120-minute trials.
  const durationMin = [60, 90, 120].includes(durationRaw) ? durationRaw : 60;
  const startMs = Date.parse(startsAt);
  if (Number.isNaN(startMs)) {
    redirect(`/backoffice/leads/${leadId}?trial=error`);
  }
  // The freed slot must still be in the future. The UI checks this too, but the
  // form input is bypassable so re-validate server-side before mutating.
  if (startMs <= Date.now()) {
    redirect(`/backoffice/leads/${leadId}?trial=error`);
  }

  const service = createServiceRoleClient();
  const { lead } = await requireLeadBackofficeAccess(service, leadId, "collaborate");
  if (!lead) redirect("/backoffice/leads");
  if (!(LEAD_ELIGIBLE_STATUSES as readonly string[]).includes(lead.status)) {
    redirect(`/backoffice/leads/${leadId}?trial=ineligible`);
  }

  // Already converted to a student → no trial lesson.
  const { data: linkedStudent } = await service
    .from("students")
    .select("id")
    .eq("lead_id", leadId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (linkedStudent) {
    redirect(`/backoffice/leads/${leadId}?trial=ineligible`);
  }

  // A lead that already holds an active (provisional/confirmed) trial is skipped.
  const { data: activeTrial } = await service
    .from("trial_lessons")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("lead_id", leadId)
    .in("status", ["provisional", "confirmed"])
    .maybeSingle();
  if (activeTrial) {
    redirect(`/backoffice/leads/${leadId}?trial=ineligible`);
  }

  const planningError = await validateTrialPlanning({
    userId: user.id,
    roles,
    isPlatformAdmin: Boolean(user.profile?.is_platform_admin),
    lead,
    instructorId,
    startsAt: new Date(startMs),
    durationMin,
  });
  if (planningError) {
    redirect(`/backoffice/leads/${leadId}?trial=${encodeURIComponent(planningError)}`);
  }

  const { error } = await service.rpc("book_trial_lesson", {
    p_lead_id: leadId,
    p_tenant_id: tenant.id,
    p_instructor_id: instructorId,
    p_starts_at: new Date(startMs).toISOString(),
    p_duration_min: durationMin,
    p_pickup_location: pickupFormattedAddress ?? pickupLocation,
    p_score: 0,
    p_reason: reason,
    p_pickup_lat: pickupLat,
    p_pickup_lng: pickupLng,
    p_pickup_place_id: pickupPlaceId,
    p_pickup_formatted_address: pickupFormattedAddress,
    p_route_status: routeStatus,
    p_route_travel_to_min: routeTravelToMin,
    p_route_travel_from_min: routeTravelFromMin,
    p_route_needs_confirm: routeNeedsConfirm,
  });
  if (error) {
    redirect(`/backoffice/leads/${leadId}?trial=error`);
  }

  // Advance the funnel to trial_planned + queue the "bevestig proefles" task.
  await reconcileLeadSafe(service, tenant.id, leadId, user.id);

  revalidatePath(`/backoffice/leads/${leadId}`);
  revalidatePath("/backoffice/agenda");
  redirect(`/backoffice/leads/${leadId}?trial=planned`);
}

export async function rejectTrialLesson(formData: FormData) {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const leadId = String(formData.get("lead_id") ?? "");
  const trialId = String(formData.get("trial_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500) || null;
  if (!leadId || !trialId) redirect("/backoffice/leads");

  const service = createServiceRoleClient();
  const { lead } = await requireLeadBackofficeAccess(service, leadId, "collaborate");
  if (!lead) redirect("/backoffice/leads");

  const { error } = await service.rpc("reject_trial_lesson", {
    p_trial_id: trialId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_reason: reason,
  });
  if (error) {
    redirect(`/backoffice/leads/${leadId}?trial=error`);
  }

  await reconcileLeadSafe(service, tenant.id, leadId, user.id);

  revalidatePath(`/backoffice/leads/${leadId}`);
  revalidatePath("/backoffice/agenda");
  redirect(`/backoffice/leads/${leadId}`);
}

export async function rescheduleTrialLesson(formData: FormData) {
  const { user, tenant, roles } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const leadId = String(formData.get("lead_id") ?? "");
  const trialId = String(formData.get("trial_id") ?? "");
  const date = String(formData.get("date") ?? "").trim();
  const time = String(formData.get("time") ?? "").trim();
  const durationRaw = Number.parseInt(String(formData.get("duration_min") ?? ""), 10);
  const pickup =
    String(formData.get("pickup_location") ?? "").trim().slice(0, 200) || null;
  if (!leadId || !trialId) redirect("/backoffice/leads");

  const duration = (TRIAL_DURATIONS as readonly number[]).includes(durationRaw)
    ? durationRaw
    : 60;

  // Combine the local date + time into an ISO timestamp.
  const startsAt = new Date(`${date}T${time}:00`);
  if (!date || !time || Number.isNaN(startsAt.getTime())) {
    redirect(`/backoffice/leads/${leadId}?trial=error`);
  }

  const service = createServiceRoleClient();
  const { lead } = await requireLeadBackofficeAccess(service, leadId, "collaborate");
  if (!lead) redirect("/backoffice/leads");

  const { data: trialRaw } = await service
    .from("trial_lessons")
    .select("id, instructor_id")
    .eq("id", trialId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  const trial = trialRaw as { id: string; instructor_id: string } | null;
  if (!trial) redirect(`/backoffice/leads/${leadId}?trial=error`);

  const planningError = await validateTrialPlanning({
    userId: user.id,
    roles,
    isPlatformAdmin: Boolean(user.profile?.is_platform_admin),
    lead,
    instructorId: trial.instructor_id,
    startsAt,
    durationMin: duration,
    trialId,
  });
  if (planningError) {
    redirect(`/backoffice/leads/${leadId}?trial=${encodeURIComponent(planningError)}`);
  }

  const { error } = await service.rpc("reschedule_trial_lesson", {
    p_trial_id: trialId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_starts_at: startsAt.toISOString(),
    p_duration_min: duration,
    p_pickup_location: pickup,
  });
  if (error) {
    redirect(`/backoffice/leads/${leadId}?trial=error`);
  }

  await reconcileLeadSafe(service, tenant.id, leadId, user.id);

  revalidatePath(`/backoffice/leads/${leadId}`);
  revalidatePath("/backoffice/agenda");
  redirect(`/backoffice/leads/${leadId}`);
}

export async function addNote(formData: FormData) {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const leadId = String(formData.get("lead_id") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000);
  if (!leadId || !note) redirect("/backoffice/leads");

  const service = createServiceRoleClient();
  const { lead } = await requireLeadBackofficeAccess(service, leadId, "collaborate");
  if (!lead) redirect("/backoffice/leads");

  const { error } = await service.rpc("add_lead_note", {
    p_lead_id: leadId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_note: note,
  });
  if (error) redirect("/backoffice/leads");

  revalidatePath(`/backoffice/leads/${leadId}`);
  redirect(`/backoffice/leads/${leadId}`);
}

// ---------------------------------------------------------------------------
// Task #54 — Slimme Opvolging: manual lead actions.
// ---------------------------------------------------------------------------

export async function markLeadLost(formData: FormData) {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const leadId = String(formData.get("lead_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500) || null;
  if (!leadId) redirect("/backoffice/leads");

  const service = createServiceRoleClient();
  const { lead } = await requireLeadBackofficeAccess(service, leadId, "collaborate");
  if (!lead) redirect("/backoffice/leads");

  const { error } = await service.rpc("mark_lead_lost", {
    p_lead_id: leadId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_reason: reason,
  });
  if (error) redirect(`/backoffice/leads/${leadId}`);

  // Archive any open auto-tasks now that the lead is closed.
  await reconcileLeadSafe(service, tenant.id, leadId, user.id);

  revalidatePath(`/backoffice/leads/${leadId}`);
  revalidatePath("/backoffice/leads");
  redirect(`/backoffice/leads/${leadId}`);
}

export async function scheduleLeadFollowUp(formData: FormData) {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const leadId = String(formData.get("lead_id") ?? "");
  const date = String(formData.get("date") ?? "").trim();
  const time = String(formData.get("time") ?? "").trim() || "09:00";
  if (!leadId) redirect("/backoffice/leads");

  const nextAt = new Date(`${date}T${time}:00`);
  if (!date || Number.isNaN(nextAt.getTime())) {
    redirect(`/backoffice/leads/${leadId}?followup=error`);
  }

  const service = createServiceRoleClient();
  const { lead } = await requireLeadBackofficeAccess(service, leadId, "collaborate");
  if (!lead) redirect("/backoffice/leads");

  const { error } = await service.rpc("schedule_lead_follow_up", {
    p_lead_id: leadId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_next_action_at: nextAt.toISOString(),
  });
  if (error) redirect(`/backoffice/leads/${leadId}?followup=error`);

  revalidatePath(`/backoffice/leads/${leadId}`);
  revalidatePath("/backoffice/leads");
  redirect(`/backoffice/leads/${leadId}`);
}

function isValidSource(v: unknown): v is LeadSource {
  return typeof v === "string" && (LEAD_SOURCES as readonly string[]).includes(v);
}

export async function createLeadManual(formData: FormData) {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const fullName = String(formData.get("full_name") ?? "").trim().slice(0, 200);
  const email = String(formData.get("email") ?? "").trim().slice(0, 200) || null;
  const phone = String(formData.get("phone") ?? "").trim().slice(0, 50) || null;
  const message = String(formData.get("message") ?? "").trim().slice(0, 2000) || null;
  const rawSource = formData.get("source");
  const source: LeadSource = isValidSource(rawSource) ? rawSource : "manual";

  if (!fullName || (!email && !phone)) {
    redirect("/backoffice/leads?new=error");
  }

  const service = createServiceRoleClient();
  const { data: leadId, error } = await service.rpc("create_lead_manual", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_source: source,
    p_full_name: fullName,
    p_email: email,
    p_phone: phone,
    p_message: message,
  });
  if (error || typeof leadId !== "string") {
    redirect("/backoffice/leads?new=error");
  }

  // Run automation so the new lead immediately gets a "bel nieuwe lead" task.
  await reconcileLeadSafe(service, tenant.id, leadId, user.id);

  revalidatePath("/backoffice/leads");
  redirect(`/backoffice/leads/${leadId}`);
}

// ---------------------------------------------------------------------------
// Task #58 — intake "aandachtspunten" → one-click backoffice tasks.
//
// Re-derives the attention points server-side (source of truth: the lead's
// intake answers), so the caller can only ever create tasks for points that
// genuinely apply. Each point becomes an idempotent, lead-linked task routed
// via the tenant's assignment rules. Clicking twice is a no-op.
// ---------------------------------------------------------------------------

export type CreateIntakeTasksResult = {
  ok: boolean;
  created: number;
  existing: number;
  error?: string;
};

export async function createTasksFromIntakePoints(
  leadId: string,
  codes: string[],
): Promise<CreateIntakeTasksResult> {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);

  if (!leadId || !Array.isArray(codes) || codes.length === 0) {
    return { ok: false, created: 0, existing: 0, error: "Geen aandachtspunten opgegeven." };
  }

  const service = createServiceRoleClient();
  const { lead } = await requireLeadBackofficeAccess(service, leadId, "collaborate");
  if (!lead) {
    return { ok: false, created: 0, existing: 0, error: "Lead niet gevonden." };
  }

  // Source of truth for which attention points exist: stored analysis, or a
  // fresh compute from the intake answers when no analysis row exists yet.
  const { data: analysisRaw } = await service
    .from("lead_intake_analysis")
    .select("attention_points")
    .eq("lead_id", leadId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  let points = (analysisRaw as { attention_points: IntakeAttentionPoint[] } | null)
    ?.attention_points;

  if (!points) {
    const { data: intakeRaw } = await service
      .from("lead_intake_details")
      .select("*")
      .eq("lead_id", leadId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    const intake = intakeRaw as LeadIntakeDetail | null;
    if (!intake) {
      return { ok: false, created: 0, existing: 0, error: "Geen intake beschikbaar." };
    }
    points = analyzeIntake({
      city: intake.city,
      pickup_location: intake.pickup_location,
      has_driving_experience: intake.has_driving_experience,
      had_lessons_before: intake.had_lessons_before,
      has_done_exam: intake.has_done_exam,
      theory_status: intake.theory_status,
      health_declaration_status: intake.health_declaration_status,
      cbr_authorization_status: intake.cbr_authorization_status,
      preferred_days: intake.preferred_days,
      preferred_times: intake.preferred_times,
      desired_start_date: intake.desired_start_date,
      lessons_per_week: intake.lessons_per_week,
      pace: intake.pace,
      has_anxiety: intake.has_anxiety,
    }).attention_points;
  }

  const requested = new Set(codes);
  const targets = points.filter((p) => requested.has(p.code));
  if (targets.length === 0) {
    return { ok: false, created: 0, existing: 0, error: "Aandachtspunt niet (meer) van toepassing." };
  }

  let created = 0;
  let existing = 0;

  for (const point of targets) {
    const dedupeKey = intakeAttentionDedupeKey(leadId, point.code);

    // Was an open task already covering this point before we called the RPC?
    const { data: before } = await service
      .from("tasks")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("dedupe_key", dedupeKey)
      .is("archived_at", null)
      .maybeSingle();

    const task = intakeAttentionTask(point, lead.full_name);
    const { error } = await service.rpc("ensure_lead_intake_task", {
      p_tenant_id: tenant.id,
      p_actor: user.id,
      p_lead_id: leadId,
      p_dedupe_key: dedupeKey,
      p_title: task.title,
      p_description: task.description,
      p_priority: task.priority,
      p_due_date: null,
    });

    if (error) {
      // Unique-violation = a concurrent click already created it: treat as existing.
      if (error.code === "23505") {
        existing += 1;
        continue;
      }
      return {
        ok: false,
        created,
        existing,
        error: "Taak aanmaken mislukt. Probeer het opnieuw.",
      };
    }

    if (before) existing += 1;
    else created += 1;
  }

  revalidatePath(`/backoffice/leads/${leadId}`);
  revalidatePath("/backoffice/taken");
  return { ok: true, created, existing };
}

// ---------------------------------------------------------------------------
// Module 15 — AI-pakketadvies. On-demand advisory call combining the lead's
// intake-analysis profile with the tenant's REAL active packages. Advisory only:
// nothing is persisted, and the model may only recommend from the tenant's own
// packages. Degrades to a friendly NL message when AI is not configured.
// ---------------------------------------------------------------------------

function aiAdviceError(err: unknown): string {
  // Log redacted metadata only — never the full provider error, which can echo
  // the prompt payload (profile summary / package data).
  if (err instanceof Error) {
    console.error(`[Module 15 AI] ${err.name}: ${err.message.slice(0, 200)}`);
    if (err.message && err.message.length < 160) return err.message;
  } else {
    console.error("[Module 15 AI] onbekende fout");
  }
  return "De AI-functie is momenteel niet beschikbaar. Probeer het later opnieuw.";
}

export async function generatePackageAdviceAction(
  leadId: string,
): Promise<{ advice?: PackageAdvice; error?: string }> {
  if (!isFeatureEnabled("ai.admin.enabled")) {
    return { error: "Deze functie is tijdens de pilot uitgeschakeld." };
  }
  const { tenant } = await requireActiveTenant(["tenant_admin", "instructor"]);
  if (!leadId) return { error: "lead_id ontbreekt." };

  const service = createServiceRoleClient();
  const snapshot = await loadTenantEntitlementSnapshot(service, tenant.id);
  if (!snapshot.featureAccess.ai_features.allowed) {
    return { error: "AI-functies vereisen het Elite-abonnement." };
  }
  const { lead } = await requireLeadBackofficeAccess(service, leadId, "read");
  if (!lead) return { error: "Lead niet gevonden." };

  // Intake-analysis profile: stored row, or a fresh compute from intake answers.
  const { data: analysisRaw } = await service
    .from("lead_intake_analysis")
    .select("labels, score, attention_points, summary, recommended_step")
    .eq("lead_id", leadId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  let analysis = analysisRaw as Pick<
    LeadIntakeAnalysis,
    "labels" | "score" | "attention_points" | "summary" | "recommended_step"
  > | null;

  if (!analysis) {
    const { data: intakeRaw } = await service
      .from("lead_intake_details")
      .select("*")
      .eq("lead_id", leadId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    const intake = intakeRaw as LeadIntakeDetail | null;
    if (!intake) {
      return {
        error: "Geen intake beschikbaar om een pakketadvies op te baseren.",
      };
    }
    const computed = analyzeIntake({
      city: intake.city,
      pickup_location: intake.pickup_location,
      has_driving_experience: intake.has_driving_experience,
      had_lessons_before: intake.had_lessons_before,
      has_done_exam: intake.has_done_exam,
      theory_status: intake.theory_status,
      health_declaration_status: intake.health_declaration_status,
      cbr_authorization_status: intake.cbr_authorization_status,
      preferred_days: intake.preferred_days,
      preferred_times: intake.preferred_times,
      desired_start_date: intake.desired_start_date,
      lessons_per_week: intake.lessons_per_week,
      pace: intake.pace,
      has_anxiety: intake.has_anxiety,
    });
    analysis = {
      labels: computed.labels,
      score: computed.score,
      attention_points: computed.attention_points,
      summary: computed.summary,
      recommended_step: computed.recommended_step,
    };
  }

  // The tenant's actual active packages — the only candidates the advice may use.
  const { data: pkgRaw, error: pkgErr } = await service
    .from("packages")
    .select("name, credits_total, price_cents, category, valid_days")
    .eq("tenant_id", tenant.id)
    .eq("active", true)
    .order("credits_total", { ascending: true });
  if (pkgErr) return { error: "Pakketten konden niet worden geladen." };
  const packages = (pkgRaw ?? []) as {
    name: string;
    credits_total: number;
    price_cents: number;
    category: string;
    valid_days: number | null;
  }[];
  if (packages.length === 0) {
    return {
      error: "Er zijn nog geen actieve pakketten om een advies op te baseren.",
    };
  }

  await primeAiClientIfNeeded(service);

  const points = (analysis.attention_points as IntakeAttentionPoint[]).map(
    (p) => p.label,
  );

  try {
    const advice = await generatePackageAdvice({
      leadName: lead.full_name,
      profileSummary: analysis.summary,
      labels: analysis.labels,
      attentionPoints: points,
      recommendedStep: analysis.recommended_step,
      packages: packages.map((p) => ({
        name: p.name,
        creditsTotal: p.credits_total,
        priceCents: p.price_cents,
        category: p.category,
        validDays: p.valid_days,
      })),
    });
    return { advice };
  } catch (err) {
    return { error: aiAdviceError(err) };
  }
}

export async function completeLeadTask(formData: FormData) {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const leadId = String(formData.get("lead_id") ?? "");
  const taskId = String(formData.get("task_id") ?? "");
  if (!leadId || !taskId) redirect("/backoffice/leads");

  const service = createServiceRoleClient();
  const { lead } = await requireLeadBackofficeAccess(service, leadId, "collaborate");
  if (!lead) redirect("/backoffice/leads");

  const { error } = await service.rpc("complete_lead_task", {
    p_task_id: taskId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
  });
  if (error) redirect(`/backoffice/leads/${leadId}`);

  revalidatePath(`/backoffice/leads/${leadId}`);
  revalidatePath("/backoffice/leads");
  redirect(`/backoffice/leads/${leadId}`);
}
