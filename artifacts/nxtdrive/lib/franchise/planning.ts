import { createServiceRoleClient } from "@/lib/supabase/service";

export type FranchisePlanningBranch = {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  branch_id: string;
  branch_name: string;
  city: string | null;
  upcoming_lessons_7d: number;
  next_lesson_at: string | null;
};

export type FranchisePlanningOverview = {
  generated_at: string;
  horizon_days: number;
  total_upcoming_lessons: number;
  branches_without_lessons: number;
  branches: FranchisePlanningBranch[];
};

export async function loadFranchisePlanningOverview(
  franchisegeverTenantId: string,
): Promise<FranchisePlanningOverview> {
  const service = createServiceRoleClient();
  const now = new Date();
  const horizonDays = 7;
  const until = new Date(now.getTime() + horizonDays * 24 * 60 * 60 * 1000);

  const { data: franchisees, error: franchiseesError } = await service
    .from("tenants")
    .select("id, name, slug")
    .eq("parent_tenant_id", franchisegeverTenantId)
    .order("name");

  if (franchiseesError) {
    throw new Error(
      `Franchisees voor planning laden mislukt: ${franchiseesError.message}`,
    );
  }

  if (!franchisees || franchisees.length === 0) {
    return {
      generated_at: now.toISOString(),
      horizon_days: horizonDays,
      total_upcoming_lessons: 0,
      branches_without_lessons: 0,
      branches: [],
    };
  }

  const franchiseeIds = franchisees.map((tenant) => tenant.id as string);

  const [{ data: branches, error: branchesError }, { data: lessons, error: lessonsError }] =
    await Promise.all([
      service
        .from("branches")
        .select("id, tenant_id, name, city, is_active")
        .in("tenant_id", franchiseeIds)
        .eq("is_active", true)
        .order("name"),
      service
        .from("lessons")
        .select("id, tenant_id, branch_id, starts_at, status")
        .in("tenant_id", franchiseeIds)
        .gte("starts_at", now.toISOString())
        .lt("starts_at", until.toISOString())
        .neq("status", "cancelled"),
    ]);

  if (branchesError) {
    throw new Error(
      `Franchise-vestigingen voor planning laden mislukt: ${branchesError.message}`,
    );
  }

  if (lessonsError) {
    throw new Error(
      `Franchise-lessen voor planning laden mislukt: ${lessonsError.message}`,
    );
  }

  const tenantMap = new Map(
    franchisees.map((tenant) => [
      tenant.id as string,
      {
        name: tenant.name as string,
        slug: tenant.slug as string,
      },
    ]),
  );

  const lessonsByBranch = new Map<
    string,
    Array<{ starts_at: string | null; tenant_id: string }>
  >();

  for (const lesson of lessons ?? []) {
    const branchId = lesson.branch_id as string | null;
    if (!branchId) continue;
    lessonsByBranch.set(branchId, [
      ...(lessonsByBranch.get(branchId) ?? []),
      {
        starts_at: lesson.starts_at as string | null,
        tenant_id: lesson.tenant_id as string,
      },
    ]);
  }

  const branchRows: FranchisePlanningBranch[] = (branches ?? []).map((branch) => {
    const branchId = branch.id as string;
    const tenantId = branch.tenant_id as string;
    const branchLessons = lessonsByBranch.get(branchId) ?? [];
    const nextLessonAt = branchLessons
      .map((lesson) => lesson.starts_at)
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? null;
    const tenant = tenantMap.get(tenantId);

    return {
      tenant_id: tenantId,
      tenant_name: tenant?.name ?? "Onbekende franchisee",
      tenant_slug: tenant?.slug ?? "",
      branch_id: branchId,
      branch_name: branch.name as string,
      city: (branch.city as string | null) ?? null,
      upcoming_lessons_7d: branchLessons.length,
      next_lesson_at: nextLessonAt,
    };
  });

  return {
    generated_at: now.toISOString(),
    horizon_days: horizonDays,
    total_upcoming_lessons: branchRows.reduce(
      (sum, branch) => sum + branch.upcoming_lessons_7d,
      0,
    ),
    branches_without_lessons: branchRows.filter(
      (branch) => branch.upcoming_lessons_7d === 0,
    ).length,
    branches: branchRows.sort((a, b) => {
      if (a.upcoming_lessons_7d !== b.upcoming_lessons_7d) {
        return a.upcoming_lessons_7d - b.upcoming_lessons_7d;
      }
      return a.tenant_name.localeCompare(b.tenant_name, "nl");
    }),
  };
}
