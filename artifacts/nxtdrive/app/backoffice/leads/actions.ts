"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  LEAD_STATUSES,
  LEAD_SOURCES,
  type Lead,
  type LeadIntakeDetail,
  type LeadSource,
  type LeadStatus,
} from "@/lib/leads/types";
import { reconcileLeadSafe } from "@/lib/leads/automation";
import { LEAD_ELIGIBLE_STATUSES } from "@/lib/lesson-planning/candidates";
import { notifyTrialLessonConfirmed } from "@/lib/notifications/dispatch";
import {
  analyzeIntake,
  intakeAttentionDedupeKey,
  intakeAttentionTask,
  type IntakeAttentionPoint,
  type LeadIntakeAnalysis,
} from "@/lib/leads/intake-analysis";

export async function convertLeadToStudent(formData: FormData) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const leadId = String(formData.get("lead_id") ?? "");
  const rawPackage = String(formData.get("package_id") ?? "").trim();
  const packageId = rawPackage === "" ? null : rawPackage;
  if (!leadId) redirect("/backoffice/leads");

  const service = createServiceRoleClient();
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

  revalidatePath(`/backoffice/leads/${leadId}`);
  revalidatePath("/backoffice/leads");
  revalidatePath("/backoffice/leerlingen");
  redirect(`/backoffice/leerlingen/${studentId as string}`);
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

export async function confirmTrialLesson(formData: FormData) {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const leadId = String(formData.get("lead_id") ?? "");
  const trialId = String(formData.get("trial_id") ?? "");
  if (!leadId || !trialId) redirect("/backoffice/leads");

  const service = createServiceRoleClient();
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
export async function bookTrialAtSlot(formData: FormData) {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const leadId = String(formData.get("lead_id") ?? "").trim();
  const instructorId = String(formData.get("instructor_id") ?? "").trim();
  const startsAt = String(formData.get("starts_at") ?? "").trim();
  const durationRaw = Number(formData.get("duration_min"));
  const pickupLocation =
    String(formData.get("pickup_location") ?? "").trim() || null;
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

  // The lead must belong to this tenant AND still be trial-eligible. These
  // mirror the candidate engine's eligibility (open status, not yet a student,
  // no active trial) — never trust the form to have respected them.
  const { data: lead } = await service
    .from("leads")
    .select("id, status")
    .eq("id", leadId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (!lead) redirect("/backoffice/leads");
  if (
    !(LEAD_ELIGIBLE_STATUSES as readonly string[]).includes(
      (lead as { status: string }).status,
    )
  ) {
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

  const { error } = await service.rpc("book_trial_lesson", {
    p_lead_id: leadId,
    p_tenant_id: tenant.id,
    p_instructor_id: instructorId,
    p_starts_at: new Date(startMs).toISOString(),
    p_duration_min: durationMin,
    p_pickup_location: pickupLocation,
    p_score: 0,
    p_reason: "Herbezetting vrijgekomen moment",
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
  const { user, tenant } = await requireActiveTenant([
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

  // Lead must belong to this tenant (also gives us the name for task titles).
  const { data: leadRaw } = await service
    .from("leads")
    .select("id, full_name")
    .eq("id", leadId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (!leadRaw) {
    return { ok: false, created: 0, existing: 0, error: "Lead niet gevonden." };
  }
  const lead = leadRaw as Pick<Lead, "id" | "full_name">;

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

export async function completeLeadTask(formData: FormData) {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const leadId = String(formData.get("lead_id") ?? "");
  const taskId = String(formData.get("task_id") ?? "");
  if (!leadId || !taskId) redirect("/backoffice/leads");

  const service = createServiceRoleClient();
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
