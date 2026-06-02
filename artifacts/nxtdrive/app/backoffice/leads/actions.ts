"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { LEAD_STATUSES, LEAD_SOURCES, type LeadSource, type LeadStatus } from "@/lib/leads/types";
import { reconcileLeadSafe } from "@/lib/leads/automation";

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

  revalidatePath(`/backoffice/leads/${leadId}`);
  revalidatePath("/backoffice/agenda");
  redirect(`/backoffice/leads/${leadId}`);
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
