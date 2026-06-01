import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSkillTree, type SkillTaxonomyNode } from "@workspace/leskaart";

/**
 * Loads the hierarchical skill taxonomy for one student in the context of one
 * lesson, ready for the instructor leskaart (L2). For every gradable leaf it
 * carries:
 *   - `currentScore`: the latest rollup grade (carry-over from earlier lessons);
 *   - `todayScore`:   the grade given during *this* lesson, if any.
 * Read-only. Pass the RLS-scoped server client; scoring happens through the
 * locked `set_skill_score` RPC (server action), never here.
 */

// A critical safety skill below this is flagged (canon: kritiek nooit < 8).
const CRITICAL_MIN = 8;

export type LeskaartLeaf = {
  id: string;
  label: string;
  code: string;
  isCritical: boolean;
  theoryLink: string | null;
  currentScore: number | null;
  todayScore: number | null;
};

export type LeskaartSubcategory = {
  id: string;
  label: string;
  leaves: LeskaartLeaf[];
};

export type LeskaartCategory = {
  id: string;
  label: string;
  subcategories: LeskaartSubcategory[];
  totalLeaves: number;
  scoredLeaves: number;
  /** Critical leaves still below niveau 8 (incl. never-scored). */
  criticalBelow: number;
  /** Average over scored leaves only, 1 decimal, or null when none scored. */
  averageScore: number | null;
};

export type InstructorLeskaart = {
  categories: LeskaartCategory[];
  totalLeaves: number;
  scoredLeaves: number;
  todaySkills: { id: string; label: string; score: number }[];
};

export async function loadInstructorLeskaart(
  client: SupabaseClient,
  tenantId: string,
  studentId: string,
  lessonId: string,
): Promise<InstructorLeskaart> {
  const [taxRes, rollupRes, todayRes] = await Promise.all([
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
      .select("skill_id, score")
      .eq("tenant_id", tenantId)
      .eq("student_id", studentId)
      .eq("lesson_id", lessonId),
  ]);

  // Fail loud instead of silently rendering an empty leskaart on RLS/query error.
  const ctx = `tenant=${tenantId} student=${studentId} lesson=${lessonId}`;
  if (taxRes.error) {
    throw new Error(`leskaart: load taxonomy failed (${ctx}): ${taxRes.error.message}`);
  }
  if (rollupRes.error) {
    throw new Error(`leskaart: load scores failed (${ctx}): ${rollupRes.error.message}`);
  }
  if (todayRes.error) {
    throw new Error(`leskaart: load lesson scores failed (${ctx}): ${todayRes.error.message}`);
  }

  const rollup = new Map<string, number>();
  for (const r of rollupRes.data ?? []) {
    rollup.set(r.skill_id as string, r.score as number);
  }
  const today = new Map<string, number>();
  for (const r of todayRes.data ?? []) {
    today.set(r.skill_id as string, r.score as number);
  }

  const tree = buildSkillTree((taxRes.data ?? []) as SkillTaxonomyNode[]);
  const todaySkills: { id: string; label: string; score: number }[] = [];

  const categories: LeskaartCategory[] = tree
    .filter((c) => c.level === 1)
    .map((cat) => {
      let totalLeaves = 0;
      let scoredLeaves = 0;
      let criticalBelow = 0;
      const scored: number[] = [];

      const subcategories: LeskaartSubcategory[] = cat.children.map((sub) => {
        const leaves: LeskaartLeaf[] = sub.children
          .filter((l) => l.level === 3)
          .map((l) => {
            const currentScore = rollup.get(l.id) ?? null;
            const todayScore = today.get(l.id) ?? null;
            totalLeaves += 1;
            if (currentScore != null) {
              scoredLeaves += 1;
              scored.push(currentScore);
            }
            if (l.is_critical && (currentScore == null || currentScore < CRITICAL_MIN)) {
              criticalBelow += 1;
            }
            if (todayScore != null) {
              todaySkills.push({ id: l.id, label: l.label, score: todayScore });
            }
            return {
              id: l.id,
              label: l.label,
              code: l.code,
              isCritical: l.is_critical,
              theoryLink: l.theory_link,
              currentScore,
              todayScore,
            };
          });
        return { id: sub.id, label: sub.label, leaves };
      });

      const averageScore =
        scored.length > 0
          ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 10) / 10
          : null;

      return {
        id: cat.id,
        label: cat.label,
        subcategories,
        totalLeaves,
        scoredLeaves,
        criticalBelow,
        averageScore,
      };
    });

  const totalLeaves = categories.reduce((a, c) => a + c.totalLeaves, 0);
  const scoredLeaves = categories.reduce((a, c) => a + c.scoredLeaves, 0);
  todaySkills.sort((a, b) => a.label.localeCompare(b.label));

  return { categories, totalLeaves, scoredLeaves, todaySkills };
}
