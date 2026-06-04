"use server";

import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { loadExamSignals } from "./data";

// ---------------------------------------------------------------------------
// Examenflow B — schoolsignaal → Kanban-taak (één klik, idempotent).
//
// Spiegelt createTasksFromIntakePoints: de signalen worden NIET vertrouwd vanuit
// de client maar server-side opnieuw afgeleid uit de feiten, daarna omgezet via
// de SECURITY DEFINER RPC ensure_exam_signal_task. De dedupe_key
// (exam:{appointmentId}:{code}) garandeert dat dezelfde knop tweemaal indrukken
// (of twee instructeurs tegelijk) nooit dubbele taken oplevert.
// ---------------------------------------------------------------------------

export type ConvertExamSignalsResult = {
  ok: boolean;
  created: number;
  existing: number;
  error?: string;
};


export async function convertExamSignalsToTasks(
  appointmentId: string,
  codes: string[],
): Promise<ConvertExamSignalsResult> {
  const { user, tenant, roles } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const isAdmin =
    roles.includes("tenant_admin") || !!user.profile?.is_platform_admin;

  if (!appointmentId || !Array.isArray(codes) || codes.length === 0) {
    return { ok: false, created: 0, existing: 0, error: "Geen signalen opgegeven." };
  }

  const service = createServiceRoleClient();

  // Non-admins mogen alleen signalen van hun eigen afspraken omzetten.
  if (!isAdmin) {
    const { data: row } = await service
      .from("agenda_appointments")
      .select("instructor_id")
      .eq("id", appointmentId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    if (!row || (row as { instructor_id: string }).instructor_id !== user.id) {
      return { ok: false, created: 0, existing: 0, error: "Geen toegang tot deze afspraak." };
    }
  }

  // Bron van waarheid: de signalen vers afleiden, nooit client-input vertrouwen.
  const derived = await loadExamSignals(service, tenant.id, appointmentId);
  if (!derived) {
    return { ok: false, created: 0, existing: 0, error: "Geen gepland examen gevonden." };
  }

  const requested = new Set(codes);
  const targets = derived.signals.filter((s) => requested.has(s.code));
  if (targets.length === 0) {
    return { ok: false, created: 0, existing: 0, error: "Signaal niet (meer) van toepassing." };
  }

  let created = 0;
  let existing = 0;

  for (const signal of targets) {
    const dedupeKey = examSignalDedupeKey(appointmentId, signal.code);

    const { data: before } = await service
      .from("tasks")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("dedupe_key", dedupeKey)
      .is("archived_at", null)
      .maybeSingle();

    const { error } = await service.rpc("ensure_exam_signal_task", {
      p_tenant_id: tenant.id,
      p_actor: user.id,
      p_appointment_id: appointmentId,
      p_dedupe_key: dedupeKey,
      p_title: signal.task.title,
      p_description: signal.task.description,
      p_priority: signal.task.priority,
      p_due_date: null,
    });

    if (error) {
      // Unique-violation = gelijktijdige klik maakte 'm al aan: tel als bestaand.
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

  revalidatePath(`/backoffice/agenda/afspraak/${appointmentId}`);
  revalidatePath(`/instructor/afspraak/${appointmentId}`);
  revalidatePath("/backoffice/taken");
  return { ok: true, created, existing };
}
