import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExamAppointmentDetails, ExamRequiredDocument } from "./types";
import { mergeRequiredDocuments, initRequiredDocuments } from "./types";
import { loadExamPrepPolicy, type ExamPreparationPolicy } from "./policy";
import {
  deriveExamSignals,
  loadExamSignalPolicy,
  type ExamSignal,
} from "./signals";
import { loadStudentReadiness } from "@/lib/skills/readiness-data";

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

// ---------------------------------------------------------------------------
// Examenflow B — read-only leerlingbundel voor het voorbereidingsscherm.
//
// Bundelt het eerstvolgende geplande examen/TTT van de leerling met het
// (RLS-leesbare) voorbereidingsdetail, het tenant-beleid (documenten + tips) en
// de laatst gereden lessen. Pass de RLS-scoped server client: de leerling/voogd
// mag de eigen afspraak, het detail en tenant_settings lezen. Read-only.
// ---------------------------------------------------------------------------

export type StudentExamRecentLesson = {
  id: string;
  startsAt: string;
};

export type StudentExamPrep = {
  appointmentId: string;
  examType: "exam" | "interim_test";
  startsAt: string;
  location: string | null;
  /** Aantal geplande (toekomstige) lessen tussen nu en het examen. */
  prepLessonsPlanned: number;
  details: ExamAppointmentDetails | null;
  policy: ExamPreparationPolicy;
  /** Documentenlijst, samengevoegd uit beleid + opgeslagen afvinkstatus. */
  documents: ExamRequiredDocument[];
  recentLessons: StudentExamRecentLesson[];
};

type NextExamRow = {
  id: string;
  type: string;
  starts_at: string;
  location: string | null;
};

/**
 * Bouwt de voorbereidingsbundel voor het eerstvolgende geplande examen/TTT van
 * één leerling. Geeft `null` als er geen toekomstig examenmoment gepland staat.
 */
export async function loadStudentExamPrep(
  client: SupabaseClient,
  tenantId: string,
  studentId: string,
  now: Date = new Date(),
): Promise<StudentExamPrep | null> {
  const nowIso = now.toISOString();
  const { data: apptData, error: apptErr } = await client
    .from("agenda_appointments")
    .select("id, type, starts_at, location")
    .eq("tenant_id", tenantId)
    .eq("student_id", studentId)
    .in("type", ["exam", "interim_test"])
    .eq("status", "planned")
    .gte("starts_at", nowIso)
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (apptErr) {
    throw new Error(
      `exam: load next exam failed (tenant=${tenantId} student=${studentId}): ${apptErr.message}`,
    );
  }
  if (!apptData) return null;
  const appt = apptData as NextExamRow;

  const [details, policy, prepCountRes, recentRes] = await Promise.all([
    loadExamAppointmentDetails(client, tenantId, appt.id),
    loadExamPrepPolicy(client, tenantId),
    client
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId)
      .eq("status", "planned")
      .gte("starts_at", nowIso)
      .lt("starts_at", appt.starts_at),
    client
      .from("lessons")
      .select("id, starts_at")
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId)
      .eq("status", "completed")
      .lt("starts_at", nowIso)
      .order("starts_at", { ascending: false })
      .limit(3),
  ]);

  if (recentRes.error) {
    throw new Error(
      `exam: load recent lessons failed (tenant=${tenantId} student=${studentId}): ${recentRes.error.message}`,
    );
  }

  const documents =
    details && details.requiredDocuments.length > 0
      ? mergeRequiredDocuments(policy, details.requiredDocuments)
      : initRequiredDocuments(policy);

  return {
    appointmentId: appt.id,
    examType: appt.type as "exam" | "interim_test",
    startsAt: appt.starts_at,
    location: appt.location,
    prepLessonsPlanned: prepCountRes.count ?? 0,
    details,
    policy,
    documents,
    recentLessons: ((recentRes.data ?? []) as { id: string; starts_at: string }[]).map(
      (l) => ({ id: l.id, startsAt: l.starts_at }),
    ),
  };
}

// ---------------------------------------------------------------------------
// Examenflow B — feiten verzamelen + schoolsignalen afleiden voor één examen.
//
// Bundelt de observeerbare feiten (theoriestatus, tegoed, geplande
// voorbereidingslessen, afgeleide examenrijpheid) rond een gepland examen/TTT en
// draait de pure engine (deriveExamSignals). Pass de service client: de
// aanroeper (backoffice/instructeur) is al staf-geautoriseerd en tenant-bounded.
// Read-only. Geeft `null` als de afspraak geen gepland examen-/toetsmoment met
// gekoppelde leerling is.
// ---------------------------------------------------------------------------

export type ExamSignalsForAppointment = {
  appointmentId: string;
  studentId: string;
  examType: "exam" | "interim_test";
  examAt: string;
  daysUntil: number;
  signals: ExamSignal[];
};

type SignalApptRow = {
  id: string;
  type: string;
  status: string;
  starts_at: string;
  student_id: string | null;
};

export async function loadExamSignals(
  client: SupabaseClient,
  tenantId: string,
  appointmentId: string,
  now: Date = new Date(),
): Promise<ExamSignalsForAppointment | null> {
  const { data: apptData, error: apptErr } = await client
    .from("agenda_appointments")
    .select("id, type, status, starts_at, student_id")
    .eq("tenant_id", tenantId)
    .eq("id", appointmentId)
    .maybeSingle();
  if (apptErr) {
    throw new Error(
      `exam: load signal appointment failed (tenant=${tenantId} appointment=${appointmentId}): ${apptErr.message}`,
    );
  }
  if (!apptData) return null;
  const appt = apptData as SignalApptRow;

  // Alleen geplande, toekomstige examen-/toetsmomenten met een leerling.
  if (appt.type !== "exam" && appt.type !== "interim_test") return null;
  if (appt.status !== "planned") return null;
  if (!appt.student_id) return null;
  if (Date.parse(appt.starts_at) < now.getTime()) return null;

  const studentId = appt.student_id;
  const nowIso = now.toISOString();

  const [statusRes, balanceRes, prepRes, policy, readiness] = await Promise.all([
    client
      .from("student_cbr_status")
      .select("theorie_behaald")
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId)
      .maybeSingle(),
    client
      .from("student_credit_balance")
      .select("balance")
      .eq("student_id", studentId)
      .maybeSingle(),
    client
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId)
      .eq("status", "planned")
      .gte("starts_at", nowIso)
      .lt("starts_at", appt.starts_at),
    loadExamSignalPolicy(client, tenantId),
    loadStudentReadiness(client, tenantId, studentId),
  ]);

  const theorieBehaald = Boolean(
    (statusRes.data as { theorie_behaald?: boolean | null } | null)
      ?.theorie_behaald,
  );
  const creditBalance =
    ((balanceRes.data as { balance?: number | null } | null)?.balance ?? 0) as number;

  const result = deriveExamSignals(
    {
      examType: appt.type,
      examAt: appt.starts_at,
      prepLessonsPlanned: prepRes.count ?? 0,
      theorieBehaald,
      creditBalance,
      readinessAdvice: readiness.advice,
    },
    policy,
    now,
  );

  return {
    appointmentId: appt.id,
    studentId,
    examType: result.examType,
    examAt: result.examAt,
    daysUntil: result.daysUntil,
    signals: result.signals,
  };
}
