import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeReadiness,
  type ReadinessLessonInput,
  type ReadinessResult,
  type ReadinessSkillInput,
} from "@workspace/leskaart";

type StudentCbrStatus = {
  student_id: string;
  theorie_behaald?: boolean;
  machtiging_geregeld?: boolean;
  gezondheidsverklaring_vereist?: boolean;
  gezondheidsverklaring_geregeld?: boolean;
};

/**
 * Gathers the L0 score data + CBR preconditions for one or more students and
 * runs the same L1 engine for every consumer. Reads only — pass any server-side
 * Supabase client. The batch boundary prevents instructor lists from running
 * the complete query set once per student.
 */
export async function loadStudentsReadiness(
  client: SupabaseClient,
  tenantId: string,
  studentIds: readonly string[],
): Promise<Map<string, ReadinessResult>> {
  const uniqueStudentIds = Array.from(new Set(studentIds.filter(Boolean)));
  if (uniqueStudentIds.length === 0) return new Map();

  const [leavesRes, rollupRes, lessonScoresRes, statusRes] = await Promise.all([
    client
      .from("skill_taxonomy")
      .select("id, is_critical")
      .eq("tenant_id", tenantId)
      .eq("level", 3)
      .eq("active", true),
    client
      .from("student_skill_scores")
      .select("student_id, skill_id, score")
      .eq("tenant_id", tenantId)
      .in("student_id", uniqueStudentIds),
    client
      .from("lesson_skill_scores")
      .select("student_id, lesson_id, score")
      .eq("tenant_id", tenantId)
      .in("student_id", uniqueStudentIds),
    client
      .from("student_cbr_status")
      .select(
        "student_id, theorie_behaald, machtiging_geregeld, gezondheidsverklaring_vereist, gezondheidsverklaring_geregeld",
      )
      .eq("tenant_id", tenantId)
      .in("student_id", uniqueStudentIds),
  ]);

  // Fail explicitly rather than silently degrading to a "niet examenrijp"
  // verdict when a query (or RLS) error occurs.
  const ctx = `tenant=${tenantId} students=${uniqueStudentIds.length}`;
  if (leavesRes.error) {
    throw new Error(
      `readiness: load taxonomy failed (${ctx}): ${leavesRes.error.message}`,
    );
  }
  if (rollupRes.error) {
    throw new Error(
      `readiness: load skill scores failed (${ctx}): ${rollupRes.error.message}`,
    );
  }
  if (lessonScoresRes.error) {
    throw new Error(
      `readiness: load lesson scores failed (${ctx}): ${lessonScoresRes.error.message}`,
    );
  }
  if (statusRes.error) {
    throw new Error(
      `readiness: load cbr status failed (${ctx}): ${statusRes.error.message}`,
    );
  }

  const scoreByStudentAndSkill = new Map<string, number>();
  for (const r of rollupRes.data ?? []) {
    scoreByStudentAndSkill.set(
      `${r.student_id as string}:${r.skill_id as string}`,
      r.score as number,
    );
  }

  // Group lesson scores per lesson, then attach the lesson start time.
  const scoresByStudentAndLesson = new Map<string, number[]>();
  for (const r of lessonScoresRes.data ?? []) {
    const studentId = r.student_id as string;
    const lid = r.lesson_id as string;
    const key = `${studentId}:${lid}`;
    const arr = scoresByStudentAndLesson.get(key) ?? [];
    arr.push(r.score as number);
    scoresByStudentAndLesson.set(key, arr);
  }
  const lessonIds = Array.from(
    new Set((lessonScoresRes.data ?? []).map((row) => row.lesson_id as string)),
  );
  const startsById = new Map<string, string>();
  if (lessonIds.length > 0) {
    const { data: lessonRows, error: lessonErr } = await client
      .from("lessons")
      .select("id, starts_at")
      .in("id", lessonIds);
    if (lessonErr) {
      throw new Error(
        `readiness: load lesson times failed (${ctx}): ${lessonErr.message}`,
      );
    }
    for (const l of lessonRows ?? []) {
      startsById.set(l.id as string, l.starts_at as string);
    }
  }

  const statusByStudent = new Map(
    ((statusRes.data ?? []) as StudentCbrStatus[]).map((status) => [
      status.student_id,
      status,
    ]),
  );
  const result = new Map<string, ReadinessResult>();

  for (const studentId of uniqueStudentIds) {
    const skills: ReadinessSkillInput[] = (leavesRes.data ?? []).map(
      (leaf) => ({
        skillId: leaf.id as string,
        isCritical: Boolean(leaf.is_critical),
        score:
          scoreByStudentAndSkill.get(`${studentId}:${leaf.id as string}`) ??
          null,
      }),
    );
    const lessons: ReadinessLessonInput[] = [];
    for (const [key, scores] of scoresByStudentAndLesson) {
      const prefix = `${studentId}:`;
      if (!key.startsWith(prefix)) continue;
      const lessonId = key.slice(prefix.length);
      lessons.push({
        lessonId,
        startsAt: startsById.get(lessonId) ?? "",
        scores,
      });
    }
    const status = statusByStudent.get(studentId);
    const preconditions = {
      theorieBehaald: Boolean(status?.theorie_behaald),
      machtigingGeregeld: Boolean(status?.machtiging_geregeld),
      gezondheidsverklaringVereist:
        status?.gezondheidsverklaring_vereist ?? true,
      gezondheidsverklaringGeregeld: Boolean(
        status?.gezondheidsverklaring_geregeld,
      ),
    };

    result.set(studentId, computeReadiness({ skills, lessons, preconditions }));
  }

  return result;
}

/**
 * Single-student convenience boundary. It intentionally delegates to the
 * batch loader so learner, instructor, parent and reporting surfaces cannot
 * drift into separate readiness implementations.
 */
export async function loadStudentReadiness(
  client: SupabaseClient,
  tenantId: string,
  studentId: string,
): Promise<ReadinessResult> {
  const results = await loadStudentsReadiness(client, tenantId, [studentId]);
  const readiness = results.get(studentId);
  if (!readiness) {
    throw new Error(
      `readiness: missing computed result (tenant=${tenantId} student=${studentId})`,
    );
  }
  return readiness;
}
