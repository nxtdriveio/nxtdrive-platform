import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgendaAppointmentResult } from "@/lib/agenda/types";
import type { BranchAccessScope } from "@/lib/permissions";
import {
  deriveCbrExamStatus,
  type CbrAppointmentInput,
  type CbrDerivedStatus,
} from "./derive";
import type { MachtigingStatus } from "./types";

// ---------------------------------------------------------------------------
// CBR Fase 1 — read-only laders die de opgeslagen voorwaarden (cbr_status) en
// de afgeleide examen-/toetsstatus (uit agenda_appointments) bundelen voor de
// instructeur, backoffice en leerling. Pass any server-side client: de
// RLS-scoped server client voor in-context views, of de service client voor
// het backoffice-overzicht.
// ---------------------------------------------------------------------------

export type CbrPreconditions = {
  theorieBehaald: boolean;
  machtigingStatus: MachtigingStatus;
  machtigingGeregeld: boolean;
  gezondheidsverklaringVereist: boolean;
  gezondheidsverklaringGeregeld: boolean;
};

const EMPTY_PRECONDITIONS: CbrPreconditions = {
  theorieBehaald: false,
  machtigingStatus: "nog_nodig",
  machtigingGeregeld: false,
  gezondheidsverklaringVereist: true,
  gezondheidsverklaringGeregeld: false,
};

export type CbrStudentSummary = {
  studentId: string;
  preconditions: CbrPreconditions;
  derived: CbrDerivedStatus;
  lastExamNote: string | null;
};

const RESULTABLE_TYPES = ["exam", "interim_test"] as const;

function mapPreconditions(row: {
  theorie_behaald?: boolean | null;
  machtiging_status?: string | null;
  machtiging_geregeld?: boolean | null;
  gezondheidsverklaring_vereist?: boolean | null;
  gezondheidsverklaring_geregeld?: boolean | null;
} | null): CbrPreconditions {
  if (!row) return { ...EMPTY_PRECONDITIONS };
  const status = (row.machtiging_status ??
    (row.machtiging_geregeld ? "ontvangen" : "nog_nodig")) as MachtigingStatus;
  return {
    theorieBehaald: Boolean(row.theorie_behaald),
    machtigingStatus: status,
    machtigingGeregeld: Boolean(row.machtiging_geregeld),
    gezondheidsverklaringVereist: row.gezondheidsverklaring_vereist ?? true,
    gezondheidsverklaringGeregeld: Boolean(row.gezondheidsverklaring_geregeld),
  };
}

type ApptRow = {
  type: string;
  status: string;
  starts_at: string;
  result: AgendaAppointmentResult | null;
  result_note: string | null;
};

function toInputs(rows: ApptRow[]): CbrAppointmentInput[] {
  return rows
    .filter((r) => r.type === "exam" || r.type === "interim_test")
    .map((r) => ({
      type: r.type as CbrAppointmentInput["type"],
      status: r.status as CbrAppointmentInput["status"],
      starts_at: r.starts_at,
      result: r.result,
    }));
}

// Noot van het laatst afgeronde examen met uitslag (vervolgadvies bij gezakt).
function lastExamNote(rows: ApptRow[]): string | null {
  const completed = rows
    .filter(
      (r) =>
        r.type === "exam" && r.status === "completed" && r.result != null,
    )
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  return completed[0]?.result_note ?? null;
}

/** Volledige CBR-samenvatting voor één leerling (voorwaarden + afgeleide status). */
export async function loadStudentCbrSummary(
  client: SupabaseClient,
  tenantId: string,
  studentId: string,
  now: Date = new Date(),
): Promise<CbrStudentSummary> {
  const ctx = `tenant=${tenantId} student=${studentId}`;
  const [statusRes, apptRes] = await Promise.all([
    client
      .from("student_cbr_status")
      .select(
        "theorie_behaald, machtiging_status, machtiging_geregeld, gezondheidsverklaring_vereist, gezondheidsverklaring_geregeld",
      )
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId)
      .maybeSingle(),
    client
      .from("agenda_appointments")
      .select("type, status, starts_at, result, result_note")
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId)
      .in("type", RESULTABLE_TYPES as unknown as string[])
      .order("starts_at", { ascending: true }),
  ]);

  // Fail explicitly rather than silently degrading the CBR status.
  if (statusRes.error) {
    throw new Error(`cbr: load status failed (${ctx}): ${statusRes.error.message}`);
  }
  if (apptRes.error) {
    throw new Error(`cbr: load appointments failed (${ctx}): ${apptRes.error.message}`);
  }

  const rows = (apptRes.data ?? []) as ApptRow[];
  return {
    studentId,
    preconditions: mapPreconditions(statusRes.data),
    derived: deriveCbrExamStatus(toInputs(rows), now),
    lastExamNote: lastExamNote(rows),
  };
}

export type CbrOverviewRow = {
  studentId: string;
  fullName: string;
  preconditions: CbrPreconditions;
  derived: CbrDerivedStatus;
  lastExamNote: string | null;
};

type CbrOverviewStudentRow = {
  id: string;
  full_name: string;
  branch_id: string | null;
};

/**
 * Backoffice-overzicht: actieve leerlingen met hun voorwaarden + afgeleide
 * CBR-status. De optionele branch-scope houdt multi-vestiging views dezelfde
 * grens als het leerlingenoverzicht en voorkomt tenant-brede batchreads.
 */
export async function loadTenantCbrOverview(
  client: SupabaseClient,
  tenantId: string,
  now: Date = new Date(),
  options: { branchScope?: BranchAccessScope } = {},
): Promise<CbrOverviewRow[]> {
  const ctx = `tenant=${tenantId}`;
  let studentsQuery = client
    .from("students")
    .select("id, full_name, branch_id")
    .eq("tenant_id", tenantId)
    .eq("active", true);

  if (options.branchScope?.scope_type === "branches") {
    if (options.branchScope.branch_ids.length === 0) return [];
    studentsQuery = studentsQuery.in("branch_id", options.branchScope.branch_ids);
  }

  const studentsRes = await studentsQuery.order("full_name", { ascending: true });
  if (studentsRes.error) {
    throw new Error(`cbr: load students failed (${ctx}): ${studentsRes.error.message}`);
  }

  const students = (studentsRes.data ?? []) as CbrOverviewStudentRow[];
  const studentIds = students.map((s) => s.id);
  if (studentIds.length === 0) return [];

  const [statusRes, apptRes] = await Promise.all([
    client
      .from("student_cbr_status")
      .select(
        "student_id, theorie_behaald, machtiging_status, machtiging_geregeld, gezondheidsverklaring_vereist, gezondheidsverklaring_geregeld",
      )
      .eq("tenant_id", tenantId)
      .in("student_id", studentIds),
    client
      .from("agenda_appointments")
      .select("student_id, type, status, starts_at, result, result_note")
      .eq("tenant_id", tenantId)
      .in("student_id", studentIds)
      .in("type", RESULTABLE_TYPES as unknown as string[]),
  ]);

  if (statusRes.error) {
    throw new Error(`cbr: load statuses failed (${ctx}): ${statusRes.error.message}`);
  }
  if (apptRes.error) {
    throw new Error(`cbr: load appointments failed (${ctx}): ${apptRes.error.message}`);
  }

  const statusByStudent = new Map<string, Parameters<typeof mapPreconditions>[0]>();
  for (const row of statusRes.data ?? []) {
    statusByStudent.set((row as { student_id: string }).student_id, row);
  }

  const apptsByStudent = new Map<string, ApptRow[]>();
  for (const row of apptRes.data ?? []) {
    const sid = (row as { student_id: string | null }).student_id;
    if (!sid) continue;
    const arr = apptsByStudent.get(sid) ?? [];
    arr.push(row as ApptRow);
    apptsByStudent.set(sid, arr);
  }

  return students.map((s) => {
    const sid = s.id;
    const rows = apptsByStudent.get(sid) ?? [];
    return {
      studentId: sid,
      fullName: s.full_name,
      preconditions: mapPreconditions(statusByStudent.get(sid) ?? null),
      derived: deriveCbrExamStatus(toInputs(rows), now),
      lastExamNote: lastExamNote(rows),
    };
  });
}
