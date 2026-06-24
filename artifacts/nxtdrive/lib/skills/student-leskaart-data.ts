import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSkillTree, type SkillTaxonomyNode } from "@workspace/leskaart";

/**
 * Read-only student/parent view of the skill leskaart (L3). Derives, for one
 * student, the per-category progress, the lesson-by-lesson trend and the most
 * recently practiced skills from the same L0 score tables the instructor writes
 * to. The advisory exam-readiness verdict is produced separately by
 * `loadStudentReadiness` (the shared L1 engine) so the number shown to the
 * student is identical to the instructor's. Pass the RLS-scoped server client:
 * a parent is restricted to their own child by row-level security, a student to
 * themselves. Never mutates — scoring is instructor-only (L2).
 */

// Canon: a critical safety skill below this is flagged (kritiek nooit < 8).
const CRITICAL_MIN = 8;
// Canon Beoordelingsschaal: a never-scored leaf reads as niveau 1.
const UNSCORED_LEVEL = 1;
const SCORE_MAX = 8;

export type StudentCategoryProgress = {
  id: string;
  label: string;
  /** Average over scored leaves only, 1 decimal, or null when none scored. */
  averageScore: number | null;
  /** 0..100 curriculum progress (unscored = 1), consistent with readinessPct. */
  progressPct: number;
  scoredLeaves: number;
  totalLeaves: number;
  /** Critical leaves still below niveau 8 (incl. never-scored). */
  criticalBelow: number;
};

export type StudentLessonPoint = {
  lessonId: string;
  startsAt: string;
  status: string;
  /** Average of the skill grades recorded during this lesson, 1 decimal. */
  averageScore: number;
  skillCount: number;
  /** The instructor's overall lesson progress score (1..8), or null/N when not assessed. */
  progressScore: number | null;
  summary: string | null;
};

export type RecentlyPracticed = {
  lessonId: string;
  startsAt: string;
  isToday: boolean;
  skills: { id: string; label: string; score: number; isCritical: boolean }[];
};

export type StudentLeskaart = {
  categories: StudentCategoryProgress[];
  totalLeaves: number;
  scoredLeaves: number;
  /** Lessons that carry skill scores, oldest → newest. */
  history: StudentLessonPoint[];
  recent: RecentlyPracticed | null;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
function isSameDay(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

export async function loadStudentLeskaart(
  client: SupabaseClient,
  tenantId: string,
  studentId: string,
): Promise<StudentLeskaart> {
  const [taxRes, rollupRes, lessonScoresRes] = await Promise.all([
    client
      .from("skill_taxonomy")
      .select(
        "id, tenant_id, parent_id, level, code, label, sort_order, is_critical, theory_link, active, version, created_at, updated_at",
      )
      .eq("tenant_id", tenantId)
      .eq("active", true),
    client
      .from("student_skill_scores")
      .select("skill_id, score")
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId),
    client
      .from("lesson_skill_scores")
      .select("lesson_id, skill_id, score")
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId),
  ]);

  // Fail loud rather than silently rendering an empty/"net begonnen" leskaart.
  const ctx = `tenant=${tenantId} student=${studentId}`;
  if (taxRes.error) {
    throw new Error(`student leskaart: load taxonomy failed (${ctx}): ${taxRes.error.message}`);
  }
  if (rollupRes.error) {
    throw new Error(`student leskaart: load scores failed (${ctx}): ${rollupRes.error.message}`);
  }
  if (lessonScoresRes.error) {
    throw new Error(`student leskaart: load lesson scores failed (${ctx}): ${lessonScoresRes.error.message}`);
  }

  const rollup = new Map<string, number>();
  for (const r of rollupRes.data ?? []) {
    rollup.set(r.skill_id as string, r.score as number);
  }
  const meta = new Map<string, { label: string; isCritical: boolean }>();
  for (const n of taxRes.data ?? []) {
    meta.set(n.id as string, {
      label: n.label as string,
      isCritical: Boolean(n.is_critical),
    });
  }

  const tree = buildSkillTree((taxRes.data ?? []) as SkillTaxonomyNode[]);

  const categories: StudentCategoryProgress[] = tree
    .filter((c) => c.level === 1)
    .map((cat) => {
      let totalLeaves = 0;
      let scoredLeaves = 0;
      let criticalBelow = 0;
      const scored: number[] = [];
      const effective: number[] = [];

      for (const sub of cat.children) {
        for (const leaf of sub.children.filter((l) => l.level === 3)) {
          const s = rollup.get(leaf.id) ?? null;
          totalLeaves += 1;
          effective.push(s ?? UNSCORED_LEVEL);
          if (s != null) {
            scoredLeaves += 1;
            scored.push(s);
          }
          if (leaf.is_critical && (s == null || s < CRITICAL_MIN)) {
            criticalBelow += 1;
          }
        }
      }

      const progressPct =
        totalLeaves === 0
          ? 0
          : Math.max(
              0,
              Math.min(
                100,
                Math.round(((mean(effective) - 1) / (SCORE_MAX - 1)) * 100),
              ),
            );

      return {
        id: cat.id,
        label: cat.label,
        averageScore: scored.length > 0 ? round1(mean(scored)) : null,
        progressPct,
        scoredLeaves,
        totalLeaves,
        criticalBelow,
      };
    });

  // Group lesson scores per lesson for the trend + recently-practiced views.
  const byLesson = new Map<string, { skillId: string; score: number }[]>();
  for (const r of lessonScoresRes.data ?? []) {
    const lid = r.lesson_id as string;
    const arr = byLesson.get(lid) ?? [];
    arr.push({ skillId: r.skill_id as string, score: r.score as number });
    byLesson.set(lid, arr);
  }

  let history: StudentLessonPoint[] = [];
  let recent: RecentlyPracticed | null = null;
  const lessonIds = [...byLesson.keys()];
  if (lessonIds.length > 0) {
    const { data: lessonRows, error: lessonErr } = await client
      .from("lessons")
      .select("id, starts_at, status, progress_score, progress_summary")
      .in("id", lessonIds);
    if (lessonErr) {
      throw new Error(`student leskaart: load lessons failed (${ctx}): ${lessonErr.message}`);
    }
    const lessonMeta = new Map(
      (lessonRows ?? []).map((l) => [l.id as string, l]),
    );

    history = lessonIds
      .map((id) => {
        const entries = byLesson.get(id) ?? [];
        const m = lessonMeta.get(id);
        return {
          lessonId: id,
          startsAt: (m?.starts_at as string) ?? "",
          status: (m?.status as string) ?? "",
          averageScore: round1(mean(entries.map((e) => e.score))),
          skillCount: entries.length,
          progressScore: (m?.progress_score as number | null) ?? null,
          summary: (m?.progress_summary as string | null) ?? null,
        };
      })
      .filter((h) => h.startsAt)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

    if (history.length > 0) {
      const latest = history[history.length - 1];
      const skills = (byLesson.get(latest.lessonId) ?? [])
        .map((e) => ({
          id: e.skillId,
          label: meta.get(e.skillId)?.label ?? e.skillId,
          score: e.score,
          isCritical: meta.get(e.skillId)?.isCritical ?? false,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
      recent = {
        lessonId: latest.lessonId,
        startsAt: latest.startsAt,
        isToday: isSameDay(latest.startsAt, new Date()),
        skills,
      };
    }
  }

  const totalLeaves = categories.reduce((a, c) => a + c.totalLeaves, 0);
  const scoredLeaves = categories.reduce((a, c) => a + c.scoredLeaves, 0);

  return { categories, totalLeaves, scoredLeaves, history, recent };
}

export type LessonSkillFeedbackGroup = {
  id: string;
  label: string;
  skills: { id: string; label: string; score: number; isCritical: boolean }[];
};

/**
 * The skills graded during one specific lesson, grouped by hoofdcategorie, for
 * the student lesson-detail "feedback per les" view. Read-only, RLS-scoped.
 */
export async function loadStudentLessonSkills(
  client: SupabaseClient,
  tenantId: string,
  studentId: string,
  lessonId: string,
): Promise<LessonSkillFeedbackGroup[]> {
  const [taxRes, scoresRes] = await Promise.all([
    client
      .from("skill_taxonomy")
      .select(
        "id, tenant_id, parent_id, level, code, label, sort_order, is_critical, theory_link, active, version, created_at, updated_at",
      )
      .eq("tenant_id", tenantId)
      .eq("active", true),
    client
      .from("lesson_skill_scores")
      .select("skill_id, score")
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId)
      .eq("lesson_id", lessonId),
  ]);

  const ctx = `tenant=${tenantId} student=${studentId} lesson=${lessonId}`;
  if (taxRes.error) {
    throw new Error(`lesson feedback: load taxonomy failed (${ctx}): ${taxRes.error.message}`);
  }
  if (scoresRes.error) {
    throw new Error(`lesson feedback: load scores failed (${ctx}): ${scoresRes.error.message}`);
  }

  const scoreBySkill = new Map<string, number>();
  for (const r of scoresRes.data ?? []) {
    scoreBySkill.set(r.skill_id as string, r.score as number);
  }
  if (scoreBySkill.size === 0) return [];

  const tree = buildSkillTree((taxRes.data ?? []) as SkillTaxonomyNode[]);

  return tree
    .filter((c) => c.level === 1)
    .map((cat) => {
      const skills: LessonSkillFeedbackGroup["skills"] = [];
      for (const sub of cat.children) {
        for (const leaf of sub.children.filter((l) => l.level === 3)) {
          const score = scoreBySkill.get(leaf.id);
          if (score != null) {
            skills.push({
              id: leaf.id,
              label: leaf.label,
              score,
              isCritical: leaf.is_critical,
            });
          }
        }
      }
      return { id: cat.id, label: cat.label, skills };
    })
    .filter((g) => g.skills.length > 0);
}
