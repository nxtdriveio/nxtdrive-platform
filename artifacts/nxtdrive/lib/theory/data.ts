import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  TheoryModule,
  TheoryModuleWithSkills,
  TheoryHomeworkWithModule,
} from "@/lib/theory/types";

/**
 * Read-only loaders for the Leskaart L4 theorielaag. Pass an RLS-scoped server
 * client. All loaders FAIL LOUD on query error. Writes go through the locked
 * theory RPCs (server actions), never here.
 */

export async function loadTheoryModules(
  client: SupabaseClient,
  tenantId: string,
  opts: { activeOnly?: boolean } = {},
): Promise<TheoryModule[]> {
  let q = client
    .from("theory_modules")
    .select(
      "id, tenant_id, code, title, description, active, sort_order, created_at, updated_at",
    )
    .eq("tenant_id", tenantId);
  if (opts.activeOnly) q = q.eq("active", true);
  const { data, error } = await q
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });
  if (error) {
    throw new Error(`theory modules: load failed (tenant=${tenantId}): ${error.message}`);
  }
  return (data ?? []) as TheoryModule[];
}

/** Theory modules with their coupled skill ids (for the management UI). */
export async function loadTheoryModulesWithSkills(
  client: SupabaseClient,
  tenantId: string,
): Promise<TheoryModuleWithSkills[]> {
  const [modulesRes, couplingsRes] = await Promise.all([
    loadTheoryModules(client, tenantId),
    client
      .from("theory_module_skills")
      .select("theory_module_id, skill_id")
      .eq("tenant_id", tenantId),
  ]);
  if (couplingsRes.error) {
    throw new Error(
      `theory couplings: load failed (tenant=${tenantId}): ${couplingsRes.error.message}`,
    );
  }
  const byModule = new Map<string, string[]>();
  for (const row of (couplingsRes.data ?? []) as {
    theory_module_id: string;
    skill_id: string;
  }[]) {
    const list = byModule.get(row.theory_module_id) ?? [];
    list.push(row.skill_id);
    byModule.set(row.theory_module_id, list);
  }
  return modulesRes.map((m) => ({ ...m, skillIds: byModule.get(m.id) ?? [] }));
}

/** Homework for one student, newest first, joined with module title. */
export async function loadStudentTheoryHomework(
  client: SupabaseClient,
  tenantId: string,
  studentId: string,
): Promise<TheoryHomeworkWithModule[]> {
  const { data, error } = await client
    .from("theory_homework")
    .select(
      "id, tenant_id, student_id, theory_module_id, lesson_id, status, deadline, note, completed_at, created_at, updated_at, theory_modules(title)",
    )
    .eq("tenant_id", tenantId)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(
      `theory homework: load failed (tenant=${tenantId} student=${studentId}): ${error.message}`,
    );
  }
  return mapHomework(data ?? []);
}

/** Homework attached to one specific lesson. */
export async function loadLessonTheoryHomework(
  client: SupabaseClient,
  tenantId: string,
  lessonId: string,
): Promise<TheoryHomeworkWithModule[]> {
  const { data, error } = await client
    .from("theory_homework")
    .select(
      "id, tenant_id, student_id, theory_module_id, lesson_id, status, deadline, note, completed_at, created_at, updated_at, theory_modules(title)",
    )
    .eq("tenant_id", tenantId)
    .eq("lesson_id", lessonId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(
      `theory homework: load lesson failed (tenant=${tenantId} lesson=${lessonId}): ${error.message}`,
    );
  }
  return mapHomework(data ?? []);
}

type HomeworkRow = {
  id: string;
  tenant_id: string;
  student_id: string;
  theory_module_id: string;
  lesson_id: string | null;
  status: TheoryHomeworkWithModule["status"];
  deadline: string | null;
  note: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  theory_modules: { title: string } | { title: string }[] | null;
};

function mapHomework(rows: unknown[]): TheoryHomeworkWithModule[] {
  return (rows as HomeworkRow[]).map((r) => {
    const mod = Array.isArray(r.theory_modules)
      ? r.theory_modules[0]
      : r.theory_modules;
    const { theory_modules: _omit, ...rest } = r;
    return { ...rest, moduleTitle: mod?.title ?? "Theoriemodule" };
  });
}
