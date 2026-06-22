import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  addDaysYmd,
  amsterdamYmd,
  startOfAmsterdamDayUtc,
} from "@/lib/datetime";
import {
  loadFranchiseDelegations,
  type FranchiseDelegationScopeType,
  type FranchiseDelegationStatus,
} from "@/lib/franchise/steering";

export type FranchisePlanningPressure = "calm" | "normal" | "busy" | "critical";

export type FranchisePlanningHeatmapCell = {
  date: string;
  label: string;
  lessons: number;
  pressure: FranchisePlanningPressure;
};

export type FranchisePlanningBranch = {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  branch_id: string;
  branch_name: string;
  city: string | null;
  can_manage_planning: boolean;
  delegation_status: FranchiseDelegationStatus;
  delegation_scope_type: FranchiseDelegationScopeType;
  upcoming_lessons_7d: number;
  next_lesson_at: string | null;
  daily_lessons: FranchisePlanningHeatmapCell[];
};

export type FranchisePlanningInstructorOption = {
  tenant_id: string;
  user_id: string;
  full_name: string;
  role: string;
};

export type FranchisePlanningOverview = {
  generated_at: string;
  horizon_days: number;
  total_upcoming_lessons: number;
  branches_without_lessons: number;
  branches: FranchisePlanningBranch[];
  instructors: FranchisePlanningInstructorOption[];
};

export async function loadFranchisePlanningOverview(
  franchisegeverTenantId: string,
): Promise<FranchisePlanningOverview> {
  const service = createServiceRoleClient();
  const now = new Date();
  const horizonDays = 7;
  const todayYmd = amsterdamYmd(now);
  const from = startOfAmsterdamDayUtc(todayYmd);
  const untilYmd = addDaysYmd(todayYmd, horizonDays);
  const until = startOfAmsterdamDayUtc(untilYmd);
  const days = Array.from({ length: horizonDays }, (_, index) =>
    addDaysYmd(todayYmd, index),
  );
  const dayLabelFormatter = new Intl.DateTimeFormat("nl-NL", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });

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
      instructors: [],
    };
  }

  const franchiseeIds = franchisees.map((tenant) => tenant.id as string);

  const [
    delegations,
    { data: branches, error: branchesError },
    { data: lessons, error: lessonsError },
    { data: memberships, error: membershipsError },
  ] = await Promise.all([
    loadFranchiseDelegations(franchisegeverTenantId),
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
      .gte("starts_at", from.toISOString())
      .lt("starts_at", until.toISOString())
      .neq("status", "cancelled"),
    service
      .from("memberships")
      .select("tenant_id, user_id, role")
      .in("tenant_id", franchiseeIds)
      .in("role", [
        "tenant_admin",
        "franchise_admin",
        "branch_manager",
        "planner",
        "instructor",
      ]),
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

  if (membershipsError) {
    throw new Error(
      `Franchise-instructeurs voor planning laden mislukt: ${membershipsError.message}`,
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

  const userIds = Array.from(
    new Set(
      ((memberships ?? []) as Array<{ user_id: string | null }>)
        .map((row) => row.user_id)
        .filter(Boolean) as string[],
    ),
  );
  const { data: profiles, error: profilesError } = userIds.length
    ? await service
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds)
    : { data: [], error: null };
  if (profilesError) {
    throw new Error(
      `Franchise-instructeurprofielen laden mislukt: ${profilesError.message}`,
    );
  }
  const profileById = new Map(
    (
      (profiles ?? []) as Array<{
        id: string;
        full_name: string | null;
        email: string | null;
      }>
    ).map((profile) => [
      profile.id,
      profile.full_name ?? profile.email ?? "Instructeur",
    ]),
  );
  const instructors: FranchisePlanningInstructorOption[] = (
    (memberships ?? []) as Array<{
      tenant_id: string;
      user_id: string | null;
      role: string;
    }>
  )
    .filter((row) => Boolean(row.user_id))
    .map((row) => ({
      tenant_id: row.tenant_id,
      user_id: row.user_id as string,
      full_name: profileById.get(row.user_id as string) ?? "Instructeur",
      role: row.role,
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "nl"));

  const delegationByTenant = new Map(
    delegations.map((delegation) => [
      delegation.franchisee_tenant_id,
      delegation,
    ]),
  );

  const lessonsByBranch = new Map<
    string,
    Array<{ starts_at: string | null; tenant_id: string }>
  >();
  const lessonsByBranchDay = new Map<string, number>();

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
    const startsAt = lesson.starts_at as string | null;
    if (startsAt) {
      const day = amsterdamYmd(new Date(startsAt));
      const key = `${branchId}:${day}`;
      lessonsByBranchDay.set(key, (lessonsByBranchDay.get(key) ?? 0) + 1);
    }
  }

  const branchRows: FranchisePlanningBranch[] = (branches ?? []).map(
    (branch) => {
      const branchId = branch.id as string;
      const tenantId = branch.tenant_id as string;
      const branchLessons = lessonsByBranch.get(branchId) ?? [];
      const nextLessonAt =
        branchLessons
          .map((lesson) => lesson.starts_at)
          .filter((value): value is string => Boolean(value))
          .sort()[0] ?? null;
      const tenant = tenantMap.get(tenantId);
      const delegation = delegationByTenant.get(tenantId);

      return {
        tenant_id: tenantId,
        tenant_name: tenant?.name ?? "Onbekende franchisee",
        tenant_slug: tenant?.slug ?? "",
        branch_id: branchId,
        branch_name: branch.name as string,
        city: (branch.city as string | null) ?? null,
        can_manage_planning: canManagePlanningForBranch(delegation, branchId),
        delegation_status: delegation?.status ?? "readonly",
        delegation_scope_type: delegation?.scope_type ?? "tenant",
        upcoming_lessons_7d: branchLessons.length,
        next_lesson_at: nextLessonAt,
        daily_lessons: days.map((day) => {
          const lessonsForDay =
            lessonsByBranchDay.get(`${branchId}:${day}`) ?? 0;
          return {
            date: day,
            label: dayLabelFormatter.format(startOfAmsterdamDayUtc(day)),
            lessons: lessonsForDay,
            pressure: pressureForLessonCount(lessonsForDay),
          };
        }),
      };
    },
  );

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
    instructors,
  };
}

function canManagePlanningForBranch(
  delegation:
    | Awaited<ReturnType<typeof loadFranchiseDelegations>>[number]
    | undefined,
  branchId: string,
) {
  if (!delegation?.can_manage_planning) return false;
  if (delegation.scope_type !== "branches") return true;
  return (
    delegation.scope_refs.length === 0 ||
    delegation.scope_refs.includes(branchId)
  );
}

function pressureForLessonCount(lessons: number): FranchisePlanningPressure {
  if (lessons >= 8) return "critical";
  if (lessons >= 5) return "busy";
  if (lessons >= 2) return "normal";
  return "calm";
}
