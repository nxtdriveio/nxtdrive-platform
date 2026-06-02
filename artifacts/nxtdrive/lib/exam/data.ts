import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExamAppointmentDetails, ExamRequiredDocument } from "./types";

// ---------------------------------------------------------------------------
// Examenflow A — read-only loader voor het examenvoorbereidingsdetail.
//
// Leest één rij uit exam_appointment_details (migratie 0069) tenant-scoped. Pass
// een server-side client: de RLS-scoped server client voor in-context views
// (staf / gekoppelde leerling / voogd), of de service client voor het
// backoffice-overzicht. Faalt expliciet bij een echte leesfout i.p.v. stilletjes
// te degraderen; een ontbrekend detail levert simpelweg null.
// ---------------------------------------------------------------------------

type DetailRow = {
  appointment_id: string;
  tenant_id: string;
  pickup_at: string | null;
  pickup_location: string | null;
  required_documents: unknown;
  exam_day_notes: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

function sanitizeDocuments(raw: unknown): ExamRequiredDocument[] {
  if (!Array.isArray(raw)) return [];
  const out: ExamRequiredDocument[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const code = typeof r.code === "string" ? r.code : null;
    const label = typeof r.label === "string" ? r.label : null;
    if (!code || !label) continue;
    out.push({ code, label, checked: r.checked === true });
  }
  return out;
}

function mapRow(row: DetailRow): ExamAppointmentDetails {
  return {
    appointmentId: row.appointment_id,
    tenantId: row.tenant_id,
    pickupAt: row.pickup_at,
    pickupLocation: row.pickup_location,
    requiredDocuments: sanitizeDocuments(row.required_documents),
    examDayNotes: row.exam_day_notes,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/** Het voorbereidingsdetail van één examenmoment, of null als er nog geen is. */
export async function loadExamAppointmentDetails(
  client: SupabaseClient,
  tenantId: string,
  appointmentId: string,
): Promise<ExamAppointmentDetails | null> {
  const { data, error } = await client
    .from("exam_appointment_details")
    .select(
      "appointment_id, tenant_id, pickup_at, pickup_location, required_documents, exam_day_notes, updated_at, updated_by",
    )
    .eq("tenant_id", tenantId)
    .eq("appointment_id", appointmentId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `exam: load details failed (tenant=${tenantId} appointment=${appointmentId}): ${error.message}`,
    );
  }
  if (!data) return null;
  return mapRow(data as DetailRow);
}

/**
 * Voorbereidingsdetails voor meerdere afspraken tegelijk (geen N+1), als map
 * appointment_id → detail. Gebruikt door overzichten die meerdere examens tonen.
 */
export async function loadExamAppointmentDetailsMap(
  client: SupabaseClient,
  tenantId: string,
  appointmentIds: string[],
): Promise<Map<string, ExamAppointmentDetails>> {
  const result = new Map<string, ExamAppointmentDetails>();
  if (appointmentIds.length === 0) return result;

  const { data, error } = await client
    .from("exam_appointment_details")
    .select(
      "appointment_id, tenant_id, pickup_at, pickup_location, required_documents, exam_day_notes, updated_at, updated_by",
    )
    .eq("tenant_id", tenantId)
    .in("appointment_id", appointmentIds);

  if (error) {
    throw new Error(
      `exam: load details map failed (tenant=${tenantId}): ${error.message}`,
    );
  }
  for (const row of (data ?? []) as DetailRow[]) {
    result.set(row.appointment_id, mapRow(row));
  }
  return result;
}
