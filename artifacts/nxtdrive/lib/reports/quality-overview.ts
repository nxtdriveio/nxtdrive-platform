import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeReadiness,
  type ReadinessAdvice,
  type ReadinessLessonInput,
  type ReadinessPhase,
  type ReadinessResult,
  type ReadinessSkillInput,
} from "@workspace/leskaart";
import { createServiceRoleClient } from "@/lib/supabase/service";

/**
 * Per-student readiness row for the tenant-wide overview. `readiness` is the
 * exact L1 verdict produced by the shared engine, so the numbers match what the
 * instructor and student see.
 */
export type StudentReadinessRow = {
  studentId: string;
  name: string;
  readiness: ReadinessResult;
  lastLessonAt: string | null;
};

/** Per-instructor progress/quality aggregation, tenant-scoped. */
export type InstructorProgressRow = {
  instructorId: string;
  name: string;
  completedLessons: number;
  studentsTaught: number;
  /** Mean of all lesson skill scores given by this instructor, or null. */
  avgLessonScore: number | null;
};

export type QualityOverview = {
  studentCount: number;
  studentsWithScores: number;
  /** Mean readinessPct across all active students, or null when none. */
  avgReadinessPct: number | null;
  phaseBands: Record<ReadinessPhase, number>;
  adviceBands: Record<ReadinessAdvice, number>;
  /** Students whose advice is "examenwaardig". */
  examenwaardigCount: number;
  /** Students whose advice is "bijna_examenrijp". */
  bijnaExamenrijpCount: number;
  /** Students with one or more critical skills still below threshold. */
  criticalConcernCount: number;
  /** Students with theorie behaald. */
  theoriePassedCount: number;
  completedLessons: number;
  cancelledLessons: number;
  noShowLessons: number;
  students: StudentReadinessRow[];
  instructors: InstructorProgressRow[];
};

function emptyPhaseBands(): Record<ReadinessPhase, number> {
  return {
    beginfase: 0,
    ontwikkelfase: 0,
    gevorderd: 0,
    bijna_examenrijp: 0,
    examenwaardig: 0,
  };
}

function emptyAdviceBands(): Record<ReadinessAdvice, number> {
  return { niet_examenrijp: 0, bijna_examenrijp: 0, examenwaardig: 0 };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Loads tenant-wide leskaart quality/reporting data in a single batched pass and
 * runs the L1 readiness engine per student. Reads only. Pass the RLS-scoped
 * server client: tenant_admin and instructor memberships can read every
 * tenant-scoped row via the `*_select_members` policies, and we additionally
 * filter by `tenant_id` for defense in depth. Fails loud on any query error so
 * the report never silently degrades.
 */
export async function loadTenantQualityOverview(
  client: SupabaseClient,
  tenantId: string,
): Promise<QualityOverview> {
  const ctx = `tenant=${tenantId}`;
  const [
    studentsRes,
    leavesRes,
    rollupRes,
    lessonScoresRes,
    lessonsRes,
    statusRes,
  ] = await Promise.all([
    client
      .from("students")
      .select("id, full_name")
      .eq("tenant_id", tenantId)
      .eq("active", true),
    client
      .from("skill_taxonomy")
      .select("id, is_critical")
      .eq("tenant_id", tenantId)
      .eq("level", 3)
      .eq("active", true),
    client
      .from("student_skill_scores")
      .select("student_id, skill_id, score")
      .eq("tenant_id", tenantId),
    client
      .from("lesson_skill_scores")
      .select("student_id, lesson_id, score")
      .eq("tenant_id", tenantId),
    client
      .from("lessons")
      .select("id, starts_at, student_id, instructor_id, status")
      .eq("tenant_id", tenantId),
    client
      .from("student_cbr_status")
      .select(
        "student_id, theorie_behaald, machtiging_geregeld, gezondheidsverklaring_vereist, gezondheidsverklaring_geregeld",
      )
      .eq("tenant_id", tenantId),
  ]);

  if (studentsRes.error)
    throw new Error(`quality: load students failed (${ctx}): ${studentsRes.error.message}`);
  if (leavesRes.error)
    throw new Error(`quality: load taxonomy failed (${ctx}): ${leavesRes.error.message}`);
  if (rollupRes.error)
    throw new Error(`quality: load skill scores failed (${ctx}): ${rollupRes.error.message}`);
  if (lessonScoresRes.error)
    throw new Error(`quality: load lesson scores failed (${ctx}): ${lessonScoresRes.error.message}`);
  if (lessonsRes.error)
    throw new Error(`quality: load lessons failed (${ctx}): ${lessonsRes.error.message}`);
  if (statusRes.error)
    throw new Error(`quality: load cbr status failed (${ctx}): ${statusRes.error.message}`);

  const leaves = (leavesRes.data ?? []).map((l) => ({
    skillId: l.id as string,
    isCritical: Boolean(l.is_critical),
  }));

  // Latest score per (student, skill).
  const scoreByStudentSkill = new Map<string, Map<string, number>>();
  for (const r of rollupRes.data ?? []) {
    const sid = r.student_id as string;
    let m = scoreByStudentSkill.get(sid);
    if (!m) {
      m = new Map<string, number>();
      scoreByStudentSkill.set(sid, m);
    }
    m.set(r.skill_id as string, r.score as number);
  }

  // Lesson scores grouped per (student, lesson).
  const scoresByStudentLesson = new Map<string, Map<string, number[]>>();
  for (const r of lessonScoresRes.data ?? []) {
    const sid = r.student_id as string;
    const lid = r.lesson_id as string;
    let byLesson = scoresByStudentLesson.get(sid);
    if (!byLesson) {
      byLesson = new Map<string, number[]>();
      scoresByStudentLesson.set(sid, byLesson);
    }
    const arr = byLesson.get(lid) ?? [];
    arr.push(r.score as number);
    byLesson.set(lid, arr);
  }

  // Lesson metadata: start time, instructor, status, last lesson per student.
  const lessonStartsById = new Map<string, string>();
  const lessonInstructorById = new Map<string, string>();
  const lastLessonByStudent = new Map<string, string>();
  let completedLessons = 0;
  let cancelledLessons = 0;
  let noShowLessons = 0;
  const completedByInstructor = new Map<string, number>();
  const studentsByInstructor = new Map<string, Set<string>>();
  // Tenant-wide instructor set, derived from lessons (lessons RLS is readable by
  // every tenant_admin/instructor, unlike memberships which an instructor can
  // only read for their own row).
  const instructorIdSet = new Set<string>();

  for (const l of lessonsRes.data ?? []) {
    const id = l.id as string;
    const startsAt = l.starts_at as string;
    const instructorId = l.instructor_id as string;
    const studentId = l.student_id as string;
    const status = l.status as string;
    lessonStartsById.set(id, startsAt);
    lessonInstructorById.set(id, instructorId);
    if (instructorId) instructorIdSet.add(instructorId);

    const prev = lastLessonByStudent.get(studentId);
    if (!prev || startsAt > prev) lastLessonByStudent.set(studentId, startsAt);

    if (status === "completed") {
      completedLessons += 1;
      completedByInstructor.set(
        instructorId,
        (completedByInstructor.get(instructorId) ?? 0) + 1,
      );
      let taught = studentsByInstructor.get(instructorId);
      if (!taught) {
        taught = new Set<string>();
        studentsByInstructor.set(instructorId, taught);
      }
      taught.add(studentId);
    } else if (status === "cancelled_with_refund" || status === "cancelled_no_refund") {
      cancelledLessons += 1;
    } else if (status === "no_show") {
      noShowLessons += 1;
    }
  }

  // Mean lesson skill score per instructor (via lesson -> instructor map).
  const instructorScoreSum = new Map<string, number>();
  const instructorScoreCount = new Map<string, number>();
  for (const r of lessonScoresRes.data ?? []) {
    const instructorId = lessonInstructorById.get(r.lesson_id as string);
    if (!instructorId) continue;
    instructorScoreSum.set(
      instructorId,
      (instructorScoreSum.get(instructorId) ?? 0) + (r.score as number),
    );
    instructorScoreCount.set(
      instructorId,
      (instructorScoreCount.get(instructorId) ?? 0) + 1,
    );
  }

  // CBR preconditions per student.
  type StatusRow = {
    student_id: string;
    theorie_behaald?: boolean;
    machtiging_geregeld?: boolean;
    gezondheidsverklaring_vereist?: boolean;
    gezondheidsverklaring_geregeld?: boolean;
  };
  const statusByStudent = new Map<string, StatusRow>();
  for (const s of (statusRes.data ?? []) as StatusRow[]) {
    statusByStudent.set(s.student_id, s);
  }

  // Compute readiness per student via the shared L1 engine.
  const phaseBands = emptyPhaseBands();
  const adviceBands = emptyAdviceBands();
  let examenwaardigCount = 0;
  let bijnaExamenrijpCount = 0;
  let criticalConcernCount = 0;
  let theoriePassedCount = 0;
  let studentsWithScores = 0;
  let readinessSum = 0;

  const studentRows: StudentReadinessRow[] = [];
  for (const s of studentsRes.data ?? []) {
    const studentId = s.id as string;
    const name = (s.full_name as string | null) ?? "Onbekend";
    const scoreMap = scoreByStudentSkill.get(studentId);
    const skills: ReadinessSkillInput[] = leaves.map((l) => ({
      skillId: l.skillId,
      isCritical: l.isCritical,
      score: scoreMap?.get(l.skillId) ?? null,
    }));

    const byLesson = scoresByStudentLesson.get(studentId);
    const lessons: ReadinessLessonInput[] = byLesson
      ? [...byLesson.entries()].map(([lessonId, scores]) => ({
          lessonId,
          startsAt: lessonStartsById.get(lessonId) ?? "",
          scores,
        }))
      : [];

    const status = statusByStudent.get(studentId);
    const preconditions = {
      theorieBehaald: Boolean(status?.theorie_behaald),
      machtigingGeregeld: Boolean(status?.machtiging_geregeld),
      gezondheidsverklaringVereist: status?.gezondheidsverklaring_vereist ?? true,
      gezondheidsverklaringGeregeld: Boolean(status?.gezondheidsverklaring_geregeld),
    };

    const readiness = computeReadiness({ skills, lessons, preconditions });

    phaseBands[readiness.phase] += 1;
    adviceBands[readiness.advice] += 1;
    if (readiness.advice === "examenwaardig") examenwaardigCount += 1;
    if (readiness.advice === "bijna_examenrijp") bijnaExamenrijpCount += 1;
    if (readiness.criticalBelowThreshold > 0) criticalConcernCount += 1;
    if (preconditions.theorieBehaald) theoriePassedCount += 1;
    if (readiness.scoredLeaves > 0) studentsWithScores += 1;
    readinessSum += readiness.readinessPct;

    studentRows.push({
      studentId,
      name,
      readiness,
      lastLessonAt: lastLessonByStudent.get(studentId) ?? null,
    });
  }

  studentRows.sort((a, b) => b.readiness.readinessPct - a.readiness.readinessPct);

  const studentCount = studentRows.length;

  // Instructor display names live in `profiles`, whose RLS only exposes the
  // caller's own row. The instructor ids here all come from THIS tenant's
  // lessons, so a service-role read by id is tenant-bounded and safe — the same
  // pattern the backoffice agenda uses, and this page is tenant_admin/instructor
  // only.
  const instructorIds = Array.from(instructorIdSet);
  const nameById = new Map<string, string>();
  if (instructorIds.length > 0) {
    const service = createServiceRoleClient();
    const { data: profilesRaw, error: profilesErr } = await service
      .from("profiles")
      .select("id, full_name")
      .in("id", instructorIds);
    if (profilesErr)
      throw new Error(`quality: load profiles failed (${ctx}): ${profilesErr.message}`);
    for (const p of (profilesRaw ?? []) as { id: string; full_name: string | null }[]) {
      nameById.set(p.id, p.full_name ?? "Instructeur");
    }
  }

  const instructors: InstructorProgressRow[] = instructorIds
    .map((instructorId) => {
      const count = instructorScoreCount.get(instructorId) ?? 0;
      const avgLessonScore =
        count > 0 ? round1((instructorScoreSum.get(instructorId) ?? 0) / count) : null;
      return {
        instructorId,
        name: nameById.get(instructorId) ?? "Instructeur",
        completedLessons: completedByInstructor.get(instructorId) ?? 0,
        studentsTaught: studentsByInstructor.get(instructorId)?.size ?? 0,
        avgLessonScore,
      };
    })
    .sort((a, b) => b.completedLessons - a.completedLessons);

  return {
    studentCount,
    studentsWithScores,
    avgReadinessPct: studentCount > 0 ? Math.round(readinessSum / studentCount) : null,
    phaseBands,
    adviceBands,
    examenwaardigCount,
    bijnaExamenrijpCount,
    criticalConcernCount,
    theoriePassedCount,
    completedLessons,
    cancelledLessons,
    noShowLessons,
    students: studentRows,
    instructors,
  };
}
