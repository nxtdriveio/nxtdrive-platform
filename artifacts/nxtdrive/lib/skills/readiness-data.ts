import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeReadiness,
  type ReadinessLessonInput,
  type ReadinessResult,
  type ReadinessSkillInput,
} from "@workspace/leskaart";

/**
 * Gathers the L0 score data + CBR preconditions for one student and runs the
 * L1 readiness engine. Reads only — pass any server-side Supabase client:
 * the RLS-scoped server client for in-context views (instructor / student /
 * parent), or the service client for reporting. The verdict is advisory; see
 * READINESS_DISCLAIMER. The single shared engine keeps the result identical
 * wherever it is shown.
 */
export async function loadStudentReadiness(
  client: SupabaseClient,
  tenantId: string,
  studentId: string,
): Promise<ReadinessResult> {
  const [leavesRes, rollupRes, lessonScoresRes, statusRes] = await Promise.all([
    client
      .from("skill_taxonomy")
      .select("id, is_critical")
      .eq("tenant_id", tenantId)
      .eq("level", 3)
      .eq("active", true),
    client
      .from("student_skill_scores")
      .select("skill_id, score")
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId),
    client
      .from("lesson_skill_scores")
      .select("lesson_id, score")
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId),
    client
      .from("student_cbr_status")
      .select(
        "theorie_behaald, machtiging_geregeld, gezondheidsverklaring_vereist, gezondheidsverklaring_geregeld",
      )
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId)
      .maybeSingle(),
  ]);

  // Fail explicitly rather than silently degrading to a "niet examenrijp"
  // verdict when a query (or RLS) error occurs.
  const ctx = `tenant=${tenantId} student=${studentId}`;
  if (leavesRes.error) {
    throw new Error(`readiness: load taxonomy failed (${ctx}): ${leavesRes.error.message}`);
  }
  if (rollupRes.error) {
    throw new Error(`readiness: load skill scores failed (${ctx}): ${rollupRes.error.message}`);
  }
  if (lessonScoresRes.error) {
    throw new Error(`readiness: load lesson scores failed (${ctx}): ${lessonScoresRes.error.message}`);
  }
  if (statusRes.error) {
    throw new Error(`readiness: load cbr status failed (${ctx}): ${statusRes.error.message}`);
  }

  const scoreBySkill = new Map<string, number>();
  for (const r of rollupRes.data ?? []) {
    scoreBySkill.set(r.skill_id as string, r.score as number);
  }
  const skills: ReadinessSkillInput[] = (leavesRes.data ?? []).map((l) => ({
    skillId: l.id as string,
    isCritical: Boolean(l.is_critical),
    score: scoreBySkill.get(l.id as string) ?? null,
  }));

  // Group lesson scores per lesson, then attach the lesson start time.
  const scoresByLesson = new Map<string, number[]>();
  for (const r of lessonScoresRes.data ?? []) {
    const lid = r.lesson_id as string;
    const arr = scoresByLesson.get(lid) ?? [];
    arr.push(r.score as number);
    scoresByLesson.set(lid, arr);
  }
  let lessons: ReadinessLessonInput[] = [];
  const lessonIds = [...scoresByLesson.keys()];
  if (lessonIds.length > 0) {
    const { data: lessonRows, error: lessonErr } = await client
      .from("lessons")
      .select("id, starts_at")
      .in("id", lessonIds);
    if (lessonErr) {
      throw new Error(`readiness: load lesson times failed (${ctx}): ${lessonErr.message}`);
    }
    const startsById = new Map<string, string>();
    for (const l of lessonRows ?? []) {
      startsById.set(l.id as string, l.starts_at as string);
    }
    lessons = lessonIds.map((id) => ({
      lessonId: id,
      startsAt: startsById.get(id) ?? "",
      scores: scoresByLesson.get(id) ?? [],
    }));
  }

  const status = statusRes.data as {
    theorie_behaald?: boolean;
    machtiging_geregeld?: boolean;
    gezondheidsverklaring_vereist?: boolean;
    gezondheidsverklaring_geregeld?: boolean;
  } | null;

  const preconditions = {
    theorieBehaald: Boolean(status?.theorie_behaald),
    machtigingGeregeld: Boolean(status?.machtiging_geregeld),
    gezondheidsverklaringVereist: status?.gezondheidsverklaring_vereist ?? true,
    gezondheidsverklaringGeregeld: Boolean(status?.gezondheidsverklaring_geregeld),
  };

  return computeReadiness({ skills, lessons, preconditions });
}
