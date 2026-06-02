"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/leads/types";

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
