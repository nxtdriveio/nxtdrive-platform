import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReadinessResult } from "@workspace/leskaart";
import { loadStudentReadiness } from "@/lib/skills/readiness-data";
import { loadStudentTheoryHomework } from "@/lib/theory/data";
import {
  buildChecklist,
  type CbrChecklistItem,
  type CbrCompetency,
  type StudentCbrProgressRow,
  type StudentCbrStatus,
} from "@/lib/cbr/types";
import type { Lesson } from "@/lib/lessons/types";
import type { AgendaAppointment } from "@/lib/agenda/types";
import type { Invoice } from "@/lib/invoices/types";
import type { LeadIntakeDetail } from "@/lib/leads/types";
import type { TheoryHomeworkWithModule } from "@/lib/theory/types";
import type { Task } from "@/lib/tasks/types";
import type { StudentDocument } from "@/lib/students/document-types";
import { loadStudentDocuments } from "@/lib/students/documents";

/** A guardian linked to the student, with the contact's resolved name/email. */
export type StudentGuardianView = {
  id: string;
  user_id: string;
  relation: string | null;
  full_name: string | null;
  email: string | null;
  created_at: string;
};

/** A communication record (e-mail / notification) addressed to the student. */
export type StudentCommunication = {
  id: string;
  type: string;
  channel: string;
  subject: string;
  status: string;
  recipient_email: string;
  created_at: string;
  sent_at: string | null;
  error: string | null;
};

/** An open task linked to this student (or a student-linked exam). */
export type StudentLinkedTask = {
  id: string;
  title: string;
  priority: Task["priority"];
  due_date: string | null;
  created_at: string;
};

/** A planned agenda appointment (exam / TTT / theory guidance) for the student. */
export type StudentAppointment = AgendaAppointment;

export type StudentDossier = {
  guardians: StudentGuardianView[];
  intake: LeadIntakeDetail | null;
  readiness: ReadinessResult;
  cbrStatus: StudentCbrStatus | null;
  cbrChecklist: CbrChecklistItem[];
  theory: TheoryHomeworkWithModule[];
  /** All lessons for the student, newest first. */
  lessons: Lesson[];
  /** Planned student-linked appointments (exam/TTT/theory guidance), soonest first. */
  appointments: StudentAppointment[];
  invoices: Invoice[];
  /** Sum of total_cents across open (unpaid) invoices. */
  outstandingCents: number;
  communications: StudentCommunication[];
  tasks: StudentLinkedTask[];
  /** Uploaded documents for this student, newest first. */
  documents: StudentDocument[];
};

const STUDENT_LINKED_APPOINTMENT_TYPES = [
  "exam",
  "interim_test",
  "theory_guidance",
] as const;

/**
 * Aggregates every existing, tenant-scoped data source for one student into a
 * single 360° dossier. Reads only.
 *
 * - `rls` is the RLS-scoped server client used for all tenant-member reads.
 * - `service` is the service-role client used ONLY where RLS deliberately hides
 *   rows from staff (guardian contact names in `profiles`, and task links).
 *   The caller MUST already have validated tenant + role access.
 *
 * All loaders fail loud on query error rather than silently degrading.
 */
export async function loadStudentDossier(
  rls: SupabaseClient,
  service: SupabaseClient,
  opts: {
    tenantId: string;
    studentId: string;
    leadId: string | null;
    email: string | null;
  },
): Promise<StudentDossier> {
  const { tenantId, studentId, leadId, email } = opts;
  const ctx = `tenant=${tenantId} student=${studentId}`;
  const nowIso = new Date().toISOString();

  const [
    guardiansRes,
    intakeRes,
    readiness,
    cbrStatusRes,
    competenciesRes,
    progressRes,
    theory,
    lessonsRes,
    appointmentsRes,
    invoicesRes,
    communicationsRes,
    taskLinksRes,
    documents,
  ] = await Promise.all([
    rls
      .from("student_guardians")
      .select("id, user_id, relation, created_at")
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId)
      .order("created_at", { ascending: true }),
    leadId
      ? rls
          .from("lead_intake_details")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("lead_id", leadId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    loadStudentReadiness(rls, tenantId, studentId),
    rls
      .from("student_cbr_status")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId)
      .maybeSingle(),
    rls
      .from("cbr_competencies")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("sort_order", { ascending: true }),
    rls
      .from("student_cbr_progress")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId),
    loadStudentTheoryHomework(rls, tenantId, studentId),
    rls
      .from("lessons")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId)
      .order("starts_at", { ascending: false })
      .limit(100),
    rls
      .from("agenda_appointments")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId)
      .eq("status", "planned")
      .gte("starts_at", nowIso)
      .in("type", STUDENT_LINKED_APPOINTMENT_TYPES as unknown as string[])
      .order("starts_at", { ascending: true }),
    rls
      .from("invoices")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId)
      .order("created_at", { ascending: false }),
    email
      ? rls
          .from("notification_log")
          .select(
            "id, type, channel, subject, status, recipient_email, created_at, sent_at, error",
          )
          .eq("tenant_id", tenantId)
          .eq("recipient_email", email)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
    // Task links use the service role (RLS on task_links is membership-based but
    // we mirror the existing launch-data pattern). Caller already validated.
    service
      .from("task_links")
      .select("task_id, entity_type, entity_id")
      .eq("tenant_id", tenantId)
      .in("entity_type", ["student", "exam"])
      .eq("entity_id", studentId),
    loadStudentDocuments(rls, service, tenantId, studentId),
  ]);

  if (guardiansRes.error) {
    throw new Error(
      `dossier: guardians load failed (${ctx}): ${guardiansRes.error.message}`,
    );
  }
  if (intakeRes.error) {
    throw new Error(
      `dossier: intake load failed (${ctx}): ${intakeRes.error.message}`,
    );
  }
  if (cbrStatusRes.error) {
    throw new Error(
      `dossier: cbr status load failed (${ctx}): ${cbrStatusRes.error.message}`,
    );
  }
  if (competenciesRes.error) {
    throw new Error(
      `dossier: cbr competencies load failed (${ctx}): ${competenciesRes.error.message}`,
    );
  }
  if (progressRes.error) {
    throw new Error(
      `dossier: cbr progress load failed (${ctx}): ${progressRes.error.message}`,
    );
  }
  if (lessonsRes.error) {
    throw new Error(
      `dossier: lessons load failed (${ctx}): ${lessonsRes.error.message}`,
    );
  }
  if (appointmentsRes.error) {
    throw new Error(
      `dossier: appointments load failed (${ctx}): ${appointmentsRes.error.message}`,
    );
  }
  if (invoicesRes.error) {
    throw new Error(
      `dossier: invoices load failed (${ctx}): ${invoicesRes.error.message}`,
    );
  }
  if (communicationsRes.error) {
    throw new Error(
      `dossier: communications load failed (${ctx}): ${communicationsRes.error.message}`,
    );
  }
  if (taskLinksRes.error) {
    throw new Error(
      `dossier: task links load failed (${ctx}): ${taskLinksRes.error.message}`,
    );
  }

  // Resolve guardian contact names/emails. profiles RLS exposes only the
  // caller's own row, so staff must read them via the service role — bounded to
  // the user_ids that appear on this tenant's guardian rows.
  const guardianRows = (guardiansRes.data ?? []) as {
    id: string;
    user_id: string;
    relation: string | null;
    created_at: string;
  }[];
  const guardians = await resolveGuardians(service, guardianRows);

  const cbrChecklist = buildChecklist(
    (competenciesRes.data ?? []) as CbrCompetency[],
    (progressRes.data ?? []) as StudentCbrProgressRow[],
  );

  const invoices = (invoicesRes.data ?? []) as Invoice[];
  const outstandingCents = invoices
    .filter((i) => i.status === "open")
    .reduce((sum, i) => sum + i.total_cents, 0);

  // Resolve open (non-archived) tasks for the linked task ids.
  const taskIds = Array.from(
    new Set(
      ((taskLinksRes.data ?? []) as { task_id: string }[]).map(
        (r) => r.task_id,
      ),
    ),
  );
  const tasks = await loadOpenTasks(service, tenantId, taskIds);

  return {
    guardians,
    intake: (intakeRes.data as LeadIntakeDetail | null) ?? null,
    readiness,
    cbrStatus: (cbrStatusRes.data as StudentCbrStatus | null) ?? null,
    cbrChecklist,
    theory,
    lessons: (lessonsRes.data ?? []) as Lesson[],
    appointments: (appointmentsRes.data ?? []) as StudentAppointment[],
    invoices,
    outstandingCents,
    communications: (communicationsRes.data ?? []) as StudentCommunication[],
    tasks,
    documents,
  };
}

async function resolveGuardians(
  service: SupabaseClient,
  rows: {
    id: string;
    user_id: string;
    relation: string | null;
    created_at: string;
  }[],
): Promise<StudentGuardianView[]> {
  if (rows.length === 0) return [];
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: profiles, error } = await service
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds);
  if (error) {
    throw new Error(`dossier: guardian profiles load failed: ${error.message}`);
  }
  const byId = new Map(
    (
      (profiles ?? []) as {
        id: string;
        full_name: string | null;
        email: string | null;
      }[]
    ).map((p) => [p.id, p]),
  );
  return rows.map((r) => {
    const p = byId.get(r.user_id);
    return {
      id: r.id,
      user_id: r.user_id,
      relation: r.relation,
      full_name: p?.full_name ?? null,
      email: p?.email ?? null,
      created_at: r.created_at,
    };
  });
}

async function loadOpenTasks(
  service: SupabaseClient,
  tenantId: string,
  taskIds: string[],
): Promise<StudentLinkedTask[]> {
  if (taskIds.length === 0) return [];
  const { data, error } = await service
    .from("tasks")
    .select("id, title, priority, due_date, created_at")
    .eq("tenant_id", tenantId)
    .in("id", taskIds)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(
      `dossier: tasks load failed (tenant=${tenantId}): ${error.message}`,
    );
  }
  return (data ?? []) as StudentLinkedTask[];
}
