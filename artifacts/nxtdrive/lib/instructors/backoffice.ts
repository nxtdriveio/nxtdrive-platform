import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysYmd, amsterdamYmd, startOfAmsterdamDayUtc } from "@/lib/datetime";
import type { BranchAccessScope } from "@/lib/permissions";

type DbClient = Pick<SupabaseClient, "from">;

export type BackofficeInstructorSummary = {
  id: string;
  membershipId: string;
  name: string;
  email: string;
  createdAt: string;
  branchScopeType: "all" | "branches";
  branchNames: string[];
  teamNames: string[];
  capabilityLabels: string[];
  vehicleLabels: string[];
  todayAppointments: number;
  upcomingAppointments: number;
  activeStudents: number;
  weeklyAvailabilityMinutes: number;
  exceptionCount: number;
  nextAppointment: InstructorAppointmentSummary | null;
};

export type InstructorAppointmentSummary = {
  id: string;
  kind: "lesson" | "appointment";
  label: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  status: string;
  branchId: string | null;
  studentName: string | null;
  vehicleLabel: string | null;
};

export type BackofficeInstructorDetail = BackofficeInstructorSummary & {
  capabilityOptions: Array<{
    id: string;
    label: string;
    category: string;
    matchBehavior: string;
    enabled: boolean;
  }>;
  vehicleOptions: Array<{
    id: string;
    label: string;
    licensePlate: string | null;
    branchName: string | null;
    status: string;
    active: boolean;
    transmission: string | null;
    assignedToInstructor: boolean;
  }>;
  workload: {
    todayMinutes: number;
    next7DaysMinutes: number;
    next7DaysAppointments: number;
    next7DaysLessons: number;
    next7DaysOther: number;
  };
  appointmentBreakdown: Array<{
    label: string;
    count: number;
  }>;
  planningAuditTrail: Array<{
    id: string;
    action: string;
    entityType: string;
    reason: string | null;
    createdAt: string;
  }>;
  recentAppointments: InstructorAppointmentSummary[];
  students: Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    lessonCount: number;
    lastLessonAt: string | null;
    nextLessonAt: string | null;
  }>;
  availabilityByWeekday: Array<{
    weekday: number;
    minutes: number;
    blockCount: number;
  }>;
};

type MembershipRow = {
  id: string;
  user_id: string;
  created_at: string;
  branch_scope_type: "all" | "branches" | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type LessonRow = {
  id: string;
  instructor_id: string;
  student_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  branch_id: string | null;
  vehicle_id: string | null;
};

type AppointmentRow = {
  id: string;
  instructor_id: string;
  student_id: string | null;
  type: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  branch_id: string | null;
  vehicle_id: string | null;
};

type StudentRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
};

type VehicleRow = {
  id: string;
  label: string;
  license_plate: string | null;
  default_instructor_id: string | null;
};

type InstructorVehicleOptionRow = VehicleRow & {
  branch_id: string | null;
  status: string;
  active: boolean;
  transmission: string | null;
};

type AvailabilityRow = {
  instructor_id: string;
  weekday: number;
  start_min: number;
  end_min: number;
};

type ExceptionRow = {
  instructor_id: string;
  id: string;
};

type CapabilityDefinitionRow = {
  id: string;
  label: string;
  category: string;
  match_behavior: string;
};

type PlanningAuditRow = {
  id: string;
  action: string;
  entity_type: string;
  reason: string | null;
  created_at: string;
  before_json: unknown;
  after_json: unknown;
};

const APPOINTMENT_TYPE_LABELS: Record<string, string> = {
  exam: "Examen",
  interim_test: "TTT",
  theory_guidance: "Theoriebegeleiding",
  free_block: "Vrij blok",
  break: "Pauze",
  private_block: "Prive",
  maintenance: "Onderhoud",
  admin: "Administratie",
  vacation: "Vakantie",
};

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function branchScopeAllows(
  rowBranchIds: readonly string[],
  rowScopeType: "all" | "branches" | null,
  branchScope: BranchAccessScope,
): boolean {
  if (branchScope.scope_type === "all") return true;
  if (rowScopeType !== "branches") return true;
  return rowBranchIds.some((id) => branchScope.branch_ids.includes(id));
}

function applyBranchScope<T>(
  query: T,
  branchScope: BranchAccessScope,
): T {
  if (branchScope.scope_type === "all") return query;
  if (branchScope.branch_ids.length === 0) return query;
  return (query as { or: (value: string) => T }).or(
    `branch_id.is.null,branch_id.in.(${branchScope.branch_ids.join(",")})`,
  );
}

function dateRange(daysForward: number) {
  const today = amsterdamYmd(new Date());
  const start = startOfAmsterdamDayUtc(today);
  const end = startOfAmsterdamDayUtc(addDaysYmd(today, daysForward));
  const tomorrow = startOfAmsterdamDayUtc(addDaysYmd(today, 1));
  return { today, start, end, tomorrow };
}

function displayName(profile: ProfileRow | undefined, fallback: string) {
  return profile?.full_name ?? profile?.email ?? fallback;
}

function appointmentLabel(row: AppointmentRow): string {
  return row.title || APPOINTMENT_TYPE_LABELS[row.type] || "Afspraak";
}

function vehicleLabel(row: VehicleRow | undefined): string | null {
  if (!row) return null;
  return row.license_plate ? `${row.label} (${row.license_plate})` : row.label;
}

function sortByStart<T extends { startsAt: string }>(rows: T[]): T[] {
  return rows.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

function eventDurationMinutes(startsAt: string, endsAt: string): number {
  return Math.max(
    0,
    Math.round(
      (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000,
    ),
  );
}

function jsonMentionsInstructor(value: unknown, instructorId: string): boolean {
  if (!value || typeof value !== "object") return false;
  try {
    return JSON.stringify(value).includes(instructorId);
  } catch {
    return false;
  }
}

export async function loadBackofficeInstructors(
  client: DbClient,
  tenantId: string,
  branchScope: BranchAccessScope,
): Promise<BackofficeInstructorSummary[]> {
  const { memberships, branchNamesByMembership, teamNamesByMembership } =
    await loadInstructorMemberships(client, tenantId, branchScope);
  return buildInstructorSummaries(client, tenantId, branchScope, memberships, {
    branchNamesByMembership,
    teamNamesByMembership,
  });
}

export async function loadBackofficeInstructorDetail(
  client: DbClient,
  tenantId: string,
  branchScope: BranchAccessScope,
  instructorId: string,
): Promise<BackofficeInstructorDetail | null> {
  const { memberships, branchNamesByMembership, teamNamesByMembership } =
    await loadInstructorMemberships(client, tenantId, branchScope);
  const membership = memberships.find((row) => row.user_id === instructorId);
  if (!membership) return null;

  const [summary] = await buildInstructorSummaries(
    client,
    tenantId,
    branchScope,
    [membership],
    { branchNamesByMembership, teamNamesByMembership },
  );
  if (!summary) return null;

  const { start, end } = dateRange(90);
  const lessonQuery = applyBranchScope(
    client
      .from("lessons")
      .select("id, instructor_id, student_id, starts_at, ends_at, status, branch_id, vehicle_id")
      .eq("tenant_id", tenantId)
      .eq("instructor_id", instructorId)
      .gte("starts_at", start.toISOString())
      .lt("starts_at", end.toISOString())
      .order("starts_at", { ascending: true })
      .limit(80),
    branchScope,
  );
  const appointmentQuery = applyBranchScope(
    client
      .from("agenda_appointments")
      .select("id, instructor_id, student_id, type, title, starts_at, ends_at, status, branch_id, vehicle_id")
      .eq("tenant_id", tenantId)
      .eq("instructor_id", instructorId)
      .gte("starts_at", start.toISOString())
      .lt("starts_at", end.toISOString())
      .order("starts_at", { ascending: true })
      .limit(80),
    branchScope,
  );

  const [{ data: lessonRows }, { data: appointmentRows }] = await Promise.all([
    lessonQuery,
    appointmentQuery,
  ]);
  const lessons = (lessonRows ?? []) as LessonRow[];
  const appointments = (appointmentRows ?? []) as AppointmentRow[];
  const studentIds = unique([
    ...lessons.map((row) => row.student_id),
    ...appointments.map((row) => row.student_id ?? ""),
  ]);
  const vehicleIds = unique([
    ...lessons.map((row) => row.vehicle_id ?? ""),
    ...appointments.map((row) => row.vehicle_id ?? ""),
  ]);
  const [
    studentsById,
    vehiclesById,
    availabilityRows,
    capabilityOptions,
    vehicleOptions,
    planningAuditTrail,
  ] =
    await Promise.all([
    loadStudentsById(client, tenantId, studentIds),
    loadVehiclesById(client, tenantId, vehicleIds),
    loadInstructorAvailabilityRows(client, tenantId, instructorId),
    loadInstructorCapabilityOptions(client, tenantId, instructorId),
    loadInstructorVehicleOptions(client, tenantId, branchScope, instructorId),
    loadInstructorPlanningAuditTrail(client, tenantId, instructorId),
  ]);

  const allAppointments = sortByStart([
    ...lessons.map((row) =>
      lessonToSummary(row, studentsById, vehiclesById),
    ),
    ...appointments.map((row) =>
      appointmentToSummary(row, studentsById, vehiclesById),
    ),
  ]);
  const recentAppointments = allAppointments.slice(0, 12);
  const now = new Date();
  const nowIso = now.toISOString();
  const { start: todayStart, tomorrow } = dateRange(1);
  const next7End = startOfAmsterdamDayUtc(addDaysYmd(amsterdamYmd(now), 7));
  const upcoming7Days = allAppointments.filter(
    (event) =>
      event.startsAt >= nowIso &&
      event.startsAt < next7End.toISOString(),
  );
  const todayEvents = allAppointments.filter(
    (event) =>
      event.startsAt >= todayStart.toISOString() &&
      event.startsAt < tomorrow.toISOString(),
  );
  const workload = {
    todayMinutes: todayEvents.reduce(
      (sum, event) => sum + event.durationMinutes,
      0,
    ),
    next7DaysMinutes: upcoming7Days.reduce(
      (sum, event) => sum + event.durationMinutes,
      0,
    ),
    next7DaysAppointments: upcoming7Days.length,
    next7DaysLessons: upcoming7Days.filter((event) => event.kind === "lesson")
      .length,
    next7DaysOther: upcoming7Days.filter((event) => event.kind !== "lesson")
      .length,
  };
  const breakdown = new Map<string, number>();
  for (const event of upcoming7Days) {
    breakdown.set(event.label, (breakdown.get(event.label) ?? 0) + 1);
  }
  const appointmentBreakdown = Array.from(breakdown.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "nl"));

  const studentStats = new Map<
    string,
    { lessonCount: number; lastLessonAt: string | null; nextLessonAt: string | null }
  >();
  for (const lesson of lessons) {
    const stats = studentStats.get(lesson.student_id) ?? {
      lessonCount: 0,
      lastLessonAt: null,
      nextLessonAt: null,
    };
    stats.lessonCount += 1;
    if (lesson.starts_at < nowIso) {
      stats.lastLessonAt =
        !stats.lastLessonAt || lesson.starts_at > stats.lastLessonAt
          ? lesson.starts_at
          : stats.lastLessonAt;
    } else {
      stats.nextLessonAt =
        !stats.nextLessonAt || lesson.starts_at < stats.nextLessonAt
          ? lesson.starts_at
          : stats.nextLessonAt;
    }
    studentStats.set(lesson.student_id, stats);
  }

  const students = Array.from(studentStats.entries())
    .map(([studentId, stats]) => {
      const student = studentsById.get(studentId);
      return {
        id: studentId,
        name: student?.full_name ?? "Leerling",
        email: student?.email ?? null,
        phone: student?.phone ?? null,
        lessonCount: stats.lessonCount,
        lastLessonAt: stats.lastLessonAt,
        nextLessonAt: stats.nextLessonAt,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));

  const availabilityByWeekday = [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
    const rows = availabilityRows.filter((row) => row.weekday === weekday);
    return {
      weekday,
      minutes: rows.reduce(
        (sum, row) => sum + Math.max(0, row.end_min - row.start_min),
        0,
      ),
      blockCount: rows.length,
    };
  });

  return {
    ...summary,
    capabilityOptions,
    vehicleOptions,
    workload,
    appointmentBreakdown,
    planningAuditTrail,
    recentAppointments,
    students,
    availabilityByWeekday,
  };
}

async function loadInstructorMemberships(
  client: DbClient,
  tenantId: string,
  branchScope: BranchAccessScope,
) {
  const { data: membershipsRaw, error } = await client
    .from("memberships")
    .select("id, user_id, created_at, branch_scope_type")
    .eq("tenant_id", tenantId)
    .eq("role", "instructor")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Instructeurs laden mislukt: ${error.message}`);

  const memberships = (membershipsRaw ?? []) as MembershipRow[];
  const membershipIds = memberships.map((row) => row.id);
  const [branchesByMembership, teamsByMembership] = await Promise.all([
    loadBranchNamesByMembership(client, tenantId, membershipIds),
    loadTeamNamesByMembership(client, tenantId, membershipIds),
  ]);

  return {
    memberships: memberships.filter((row) =>
      branchScopeAllows(
        branchesByMembership.get(row.id)?.map((branch) => branch.id) ?? [],
        row.branch_scope_type,
        branchScope,
      ),
    ),
    branchNamesByMembership: new Map(
      Array.from(branchesByMembership.entries()).map(([id, branches]) => [
        id,
        branches.map((branch) => branch.name),
      ]),
    ),
    teamNamesByMembership: teamsByMembership,
  };
}

async function buildInstructorSummaries(
  client: DbClient,
  tenantId: string,
  branchScope: BranchAccessScope,
  memberships: readonly MembershipRow[],
  labels: {
    branchNamesByMembership: Map<string, string[]>;
    teamNamesByMembership: Map<string, string[]>;
  },
): Promise<BackofficeInstructorSummary[]> {
  const instructorIds = unique(memberships.map((row) => row.user_id));
  if (instructorIds.length === 0) return [];

  const { start, end, tomorrow } = dateRange(60);
  const nowIso = new Date().toISOString();

  const [
    profilesById,
    capabilitiesByInstructor,
    vehiclesByInstructor,
    lessonsRaw,
    appointmentsRaw,
    availabilityRaw,
    exceptionsRaw,
  ] = await Promise.all([
    loadProfilesById(client, instructorIds),
    loadCapabilityLabelsByInstructor(client, tenantId, instructorIds),
    loadVehicleLabelsByInstructor(client, tenantId, instructorIds),
    applyBranchScope(
      client
        .from("lessons")
        .select("id, instructor_id, student_id, starts_at, ends_at, status, branch_id, vehicle_id")
        .eq("tenant_id", tenantId)
        .in("instructor_id", instructorIds)
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString())
        .order("starts_at", { ascending: true }),
      branchScope,
    ),
    applyBranchScope(
      client
        .from("agenda_appointments")
        .select("id, instructor_id, student_id, type, title, starts_at, ends_at, status, branch_id, vehicle_id")
        .eq("tenant_id", tenantId)
        .in("instructor_id", instructorIds)
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString())
        .order("starts_at", { ascending: true }),
      branchScope,
    ),
    client
      .from("instructor_availability")
      .select("instructor_id, weekday, start_min, end_min")
      .eq("tenant_id", tenantId)
      .in("instructor_id", instructorIds),
    client
      .from("instructor_availability_exception")
      .select("id, instructor_id")
      .eq("tenant_id", tenantId)
      .in("instructor_id", instructorIds),
  ]);

  if (lessonsRaw.error)
    throw new Error(`Instructeur lessen laden mislukt: ${lessonsRaw.error.message}`);
  if (appointmentsRaw.error)
    throw new Error(`Instructeur afspraken laden mislukt: ${appointmentsRaw.error.message}`);
  if (availabilityRaw.error)
    throw new Error(
      `Instructeur beschikbaarheid laden mislukt: ${availabilityRaw.error.message}`,
    );
  if (exceptionsRaw.error)
    throw new Error(
      `Instructeur uitzonderingen laden mislukt: ${exceptionsRaw.error.message}`,
    );

  const lessons = (lessonsRaw.data ?? []) as LessonRow[];
  const appointments = (appointmentsRaw.data ?? []) as AppointmentRow[];
  const studentIds = unique([
    ...lessons.map((row) => row.student_id),
    ...appointments.map((row) => row.student_id ?? ""),
  ]);
  const vehicleIds = unique([
    ...lessons.map((row) => row.vehicle_id ?? ""),
    ...appointments.map((row) => row.vehicle_id ?? ""),
  ]);
  const [studentsById, vehiclesById] = await Promise.all([
    loadStudentsById(client, tenantId, studentIds),
    loadVehiclesById(client, tenantId, vehicleIds),
  ]);
  const eventSummaries = sortByStart([
    ...lessons.map((row) => lessonToSummary(row, studentsById, vehiclesById)),
    ...appointments.map((row) =>
      appointmentToSummary(row, studentsById, vehiclesById),
    ),
  ]);

  const availabilityByInstructor = new Map<string, AvailabilityRow[]>();
  for (const row of (availabilityRaw.data ?? []) as AvailabilityRow[]) {
    const list = availabilityByInstructor.get(row.instructor_id) ?? [];
    list.push(row);
    availabilityByInstructor.set(row.instructor_id, list);
  }
  const exceptionsByInstructor = new Map<string, ExceptionRow[]>();
  for (const row of (exceptionsRaw.data ?? []) as ExceptionRow[]) {
    const list = exceptionsByInstructor.get(row.instructor_id) ?? [];
    list.push(row);
    exceptionsByInstructor.set(row.instructor_id, list);
  }

  return memberships
    .map((membership) => {
      const profile = profilesById.get(membership.user_id);
      const instructorEvents = eventSummaries.filter(
        (event) =>
          lessons.find((lesson) => lesson.id === event.id)?.instructor_id ===
            membership.user_id ||
          appointments.find((appt) => appt.id === event.id)?.instructor_id ===
            membership.user_id,
      );
      const availability = availabilityByInstructor.get(membership.user_id) ?? [];
      const todayAppointments = instructorEvents.filter(
        (event) => event.startsAt >= start.toISOString() && event.startsAt < tomorrow.toISOString(),
      ).length;
      const upcomingAppointments = instructorEvents.filter(
        (event) => event.startsAt >= nowIso,
      ).length;
      const studentIdsForInstructor = new Set(
        lessons
          .filter((row) => row.instructor_id === membership.user_id)
          .map((row) => row.student_id),
      );
      return {
        id: membership.user_id,
        membershipId: membership.id,
        name: displayName(profile, "Instructeur"),
        email: profile?.email ?? "-",
        createdAt: membership.created_at,
        branchScopeType: membership.branch_scope_type ?? "all",
        branchNames: labels.branchNamesByMembership.get(membership.id) ?? [],
        teamNames: labels.teamNamesByMembership.get(membership.id) ?? [],
        capabilityLabels: capabilitiesByInstructor.get(membership.user_id) ?? [],
        vehicleLabels: vehiclesByInstructor.get(membership.user_id) ?? [],
        todayAppointments,
        upcomingAppointments,
        activeStudents: studentIdsForInstructor.size,
        weeklyAvailabilityMinutes: availability.reduce(
          (sum, row) => sum + Math.max(0, row.end_min - row.start_min),
          0,
        ),
        exceptionCount:
          exceptionsByInstructor.get(membership.user_id)?.length ?? 0,
        nextAppointment:
          instructorEvents.find((event) => event.startsAt >= nowIso) ?? null,
      } satisfies BackofficeInstructorSummary;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));
}

async function loadBranchNamesByMembership(
  client: DbClient,
  tenantId: string,
  membershipIds: readonly string[],
): Promise<Map<string, Array<{ id: string; name: string }>>> {
  if (membershipIds.length === 0) return new Map();
  const { data, error } = await client
    .from("membership_branches")
    .select("membership_id, branch_id")
    .in("membership_id", [...membershipIds]);
  if (error) throw new Error(`Vestigingstoegang laden mislukt: ${error.message}`);

  const branchIds = unique((data ?? []).map((row) => String(row.branch_id)));
  const branchNames = new Map<string, string>();
  if (branchIds.length > 0) {
    const { data: branches, error: branchError } = await client
      .from("branches")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .in("id", branchIds);
    if (branchError)
      throw new Error(`Vestigingen laden mislukt: ${branchError.message}`);
    for (const branch of (branches ?? []) as Array<{ id: string; name: string }>) {
      branchNames.set(branch.id, branch.name);
    }
  }

  const result = new Map<string, Array<{ id: string; name: string }>>();
  for (const row of data ?? []) {
    const membershipId = String(row.membership_id);
    const branchId = String(row.branch_id);
    const name = branchNames.get(branchId);
    if (!name) continue;
    const list = result.get(membershipId) ?? [];
    list.push({ id: branchId, name });
    result.set(membershipId, list);
  }
  return result;
}

async function loadTeamNamesByMembership(
  client: DbClient,
  tenantId: string,
  membershipIds: readonly string[],
): Promise<Map<string, string[]>> {
  if (membershipIds.length === 0) return new Map();
  const { data, error } = await client
    .from("organization_team_members")
    .select("membership_id, team_id")
    .eq("tenant_id", tenantId)
    .in("membership_id", [...membershipIds]);
  if (error) throw new Error(`Teams laden mislukt: ${error.message}`);

  const teamIds = unique((data ?? []).map((row) => String(row.team_id)));
  const teamNames = new Map<string, string>();
  if (teamIds.length > 0) {
    const { data: teams, error: teamError } = await client
      .from("organization_teams")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .in("id", teamIds);
    if (teamError) throw new Error(`Teamnamen laden mislukt: ${teamError.message}`);
    for (const team of (teams ?? []) as Array<{ id: string; name: string }>) {
      teamNames.set(team.id, team.name);
    }
  }

  const result = new Map<string, string[]>();
  for (const row of data ?? []) {
    const membershipId = String(row.membership_id);
    const name = teamNames.get(String(row.team_id));
    if (!name) continue;
    const list = result.get(membershipId) ?? [];
    list.push(name);
    result.set(membershipId, list);
  }
  return result;
}

async function loadProfilesById(
  client: DbClient,
  ids: readonly string[],
): Promise<Map<string, ProfileRow>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await client
    .from("profiles")
    .select("id, full_name, email")
    .in("id", [...ids]);
  if (error) throw new Error(`Profielen laden mislukt: ${error.message}`);
  return new Map(((data ?? []) as ProfileRow[]).map((row) => [row.id, row]));
}

async function loadStudentsById(
  client: DbClient,
  tenantId: string,
  ids: readonly string[],
): Promise<Map<string, StudentRow>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await client
    .from("students")
    .select("id, full_name, email, phone")
    .eq("tenant_id", tenantId)
    .in("id", [...ids]);
  if (error) throw new Error(`Leerlingen laden mislukt: ${error.message}`);
  return new Map(((data ?? []) as StudentRow[]).map((row) => [row.id, row]));
}

async function loadVehiclesById(
  client: DbClient,
  tenantId: string,
  ids: readonly string[],
): Promise<Map<string, VehicleRow>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await client
    .from("vehicles")
    .select("id, label, license_plate, default_instructor_id")
    .eq("tenant_id", tenantId)
    .in("id", [...ids]);
  if (error) throw new Error(`Voertuigen laden mislukt: ${error.message}`);
  return new Map(((data ?? []) as VehicleRow[]).map((row) => [row.id, row]));
}

async function loadCapabilityLabelsByInstructor(
  client: DbClient,
  tenantId: string,
  instructorIds: readonly string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (instructorIds.length === 0) return result;
  const { data, error } = await client
    .from("instructor_capabilities")
    .select("instructor_id, capability_id")
    .eq("tenant_id", tenantId)
    .in("instructor_id", [...instructorIds]);
  if (error)
    throw new Error(`Instructeur-eigenschappen laden mislukt: ${error.message}`);

  const capabilityIds = unique((data ?? []).map((row) => String(row.capability_id)));
  const labels = new Map<string, string>();
  if (capabilityIds.length > 0) {
    const { data: capabilities, error: capError } = await client
      .from("capability_definitions")
      .select("id, label")
      .eq("tenant_id", tenantId)
      .in("id", capabilityIds);
    if (capError)
      throw new Error(`Eigenschaplabels laden mislukt: ${capError.message}`);
    for (const capability of (capabilities ?? []) as Array<{ id: string; label: string }>) {
      labels.set(capability.id, capability.label);
    }
  }

  for (const row of data ?? []) {
    const instructorId = String(row.instructor_id);
    const label = labels.get(String(row.capability_id));
    if (!label) continue;
    const list = result.get(instructorId) ?? [];
    list.push(label);
    result.set(instructorId, list);
  }
  return result;
}

async function loadInstructorCapabilityOptions(
  client: DbClient,
  tenantId: string,
  instructorId: string,
): Promise<BackofficeInstructorDetail["capabilityOptions"]> {
  const [{ data: definitions, error: definitionsError }, { data: links, error: linksError }] =
    await Promise.all([
      client
        .from("capability_definitions")
        .select("id, label, category, match_behavior")
        .eq("tenant_id", tenantId)
        .eq("applies_to", "instructor")
        .eq("active", true)
        .order("category", { ascending: true })
        .order("label", { ascending: true }),
      client
        .from("instructor_capabilities")
        .select("capability_id")
        .eq("tenant_id", tenantId)
        .eq("instructor_id", instructorId),
    ]);

  if (definitionsError)
    throw new Error(`Eigenschappen laden mislukt: ${definitionsError.message}`);
  if (linksError)
    throw new Error(
      `Instructeur-eigenschappen laden mislukt: ${linksError.message}`,
    );

  const enabled = new Set(
    (links ?? []).map((row: { capability_id: string }) => row.capability_id),
  );

  return ((definitions ?? []) as CapabilityDefinitionRow[]).map((row) => ({
    id: row.id,
    label: row.label,
    category: row.category,
    matchBehavior: row.match_behavior,
    enabled: enabled.has(row.id),
  }));
}

async function loadVehicleLabelsByInstructor(
  client: DbClient,
  tenantId: string,
  instructorIds: readonly string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (instructorIds.length === 0) return result;
  const { data, error } = await client
    .from("vehicles")
    .select("id, label, license_plate, default_instructor_id")
    .eq("tenant_id", tenantId)
    .in("default_instructor_id", [...instructorIds]);
  if (error) throw new Error(`Instructeurvoertuigen laden mislukt: ${error.message}`);
  for (const row of (data ?? []) as VehicleRow[]) {
    if (!row.default_instructor_id) continue;
    const list = result.get(row.default_instructor_id) ?? [];
    const label = vehicleLabel(row);
    if (label) list.push(label);
    result.set(row.default_instructor_id, list);
  }
  return result;
}

async function loadInstructorVehicleOptions(
  client: DbClient,
  tenantId: string,
  branchScope: BranchAccessScope,
  instructorId: string,
): Promise<BackofficeInstructorDetail["vehicleOptions"]> {
  const query = applyBranchScope(
    client
      .from("vehicles")
      .select(
        "id, label, license_plate, default_instructor_id, branch_id, status, active, transmission",
      )
      .eq("tenant_id", tenantId)
      .order("label", { ascending: true }),
    branchScope,
  );
  const { data, error } = await query;
  if (error) throw new Error(`Voertuigopties laden mislukt: ${error.message}`);

  const rows = (data ?? []) as InstructorVehicleOptionRow[];
  const branchIds = unique(rows.map((row) => row.branch_id ?? ""));
  const branchNames = new Map<string, string>();
  if (branchIds.length > 0) {
    const { data: branches, error: branchError } = await client
      .from("branches")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .in("id", branchIds);
    if (branchError)
      throw new Error(`Voertuigvestigingen laden mislukt: ${branchError.message}`);
    for (const branch of (branches ?? []) as Array<{ id: string; name: string }>) {
      branchNames.set(branch.id, branch.name);
    }
  }

  return rows.map((row) => ({
    id: row.id,
    label: vehicleLabel(row) ?? row.label,
    licensePlate: row.license_plate,
    branchName: row.branch_id ? (branchNames.get(row.branch_id) ?? null) : null,
    status: row.status,
    active: row.active,
    transmission: row.transmission,
    assignedToInstructor: row.default_instructor_id === instructorId,
  }));
}

async function loadInstructorPlanningAuditTrail(
  client: DbClient,
  tenantId: string,
  instructorId: string,
): Promise<BackofficeInstructorDetail["planningAuditTrail"]> {
  const { data, error } = await client
    .from("planning_audit_log")
    .select("id, action, entity_type, reason, created_at, before_json, after_json")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) return [];

  return ((data ?? []) as PlanningAuditRow[])
    .filter(
      (row) =>
        jsonMentionsInstructor(row.before_json, instructorId) ||
        jsonMentionsInstructor(row.after_json, instructorId),
    )
    .slice(0, 8)
    .map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      reason: row.reason,
      createdAt: row.created_at,
    }));
}

async function loadInstructorAvailabilityRows(
  client: DbClient,
  tenantId: string,
  instructorId: string,
): Promise<AvailabilityRow[]> {
  const { data, error } = await client
    .from("instructor_availability")
    .select("instructor_id, weekday, start_min, end_min")
    .eq("tenant_id", tenantId)
    .eq("instructor_id", instructorId)
    .order("weekday", { ascending: true })
    .order("start_min", { ascending: true });
  if (error)
    throw new Error(`Beschikbaarheid laden mislukt: ${error.message}`);
  return (data ?? []) as AvailabilityRow[];
}

function lessonToSummary(
  row: LessonRow,
  studentsById: Map<string, StudentRow>,
  vehiclesById: Map<string, VehicleRow>,
): InstructorAppointmentSummary {
  const student = studentsById.get(row.student_id);
  return {
    id: row.id,
    kind: "lesson",
    label: "Rijles",
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    durationMinutes: eventDurationMinutes(row.starts_at, row.ends_at),
    status: row.status,
    branchId: row.branch_id,
    studentName: student?.full_name ?? "Leerling",
    vehicleLabel: row.vehicle_id
      ? vehicleLabel(vehiclesById.get(row.vehicle_id))
      : null,
  };
}

function appointmentToSummary(
  row: AppointmentRow,
  studentsById: Map<string, StudentRow>,
  vehiclesById: Map<string, VehicleRow>,
): InstructorAppointmentSummary {
  const student = row.student_id ? studentsById.get(row.student_id) : null;
  return {
    id: row.id,
    kind: "appointment",
    label: appointmentLabel(row),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    durationMinutes: eventDurationMinutes(row.starts_at, row.ends_at),
    status: row.status,
    branchId: row.branch_id,
    studentName: student?.full_name ?? null,
    vehicleLabel: row.vehicle_id
      ? vehicleLabel(vehiclesById.get(row.vehicle_id))
      : null,
  };
}
