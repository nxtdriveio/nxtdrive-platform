// ---------------------------------------------------------------------------
// Availability DB loaders (RLS-scoped to the caller's tenant via the anon-key
// server client). Pure computation lives in ./compute.
// ---------------------------------------------------------------------------

import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { computeDayFreeSpace, dateKey } from "@/lib/availability/compute";
import type {
  AvailabilityException,
  Interval,
  WeeklyAvailability,
} from "@/lib/availability/types";

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export type TenantInstructor = { id: string; full_name: string };

type InstructorMembershipRow = {
  id: string;
  user_id: string;
  role: string;
  branch_scope_type: string | null;
};

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

// Instructors of a tenant (users with instructor/tenant_admin role), with names.
// When branchIds is provided, branch-scoped memberships must overlap with those
// branches. Organization-wide memberships remain available for all branches.
export async function loadTenantInstructors(
  tenantId: string,
  opts: { branchIds?: readonly string[] | null } = {},
): Promise<TenantInstructor[]> {
  const branchIds = opts.branchIds ? uniqueStrings(opts.branchIds) : null;
  if (branchIds && branchIds.length === 0) return [];

  const service = createServiceRoleClient();
  const { data: membershipsRaw } = await service
    .from("memberships")
    .select("id, user_id, role, branch_scope_type")
    .eq("tenant_id", tenantId)
    .in("role", ["instructor", "tenant_admin"]);

  let memberships = (membershipsRaw ?? []) as InstructorMembershipRow[];
  if (branchIds) {
    const scopedMembershipIds = memberships
      .filter((m) => m.branch_scope_type === "branches")
      .map((m) => m.id);
    const matchingMembershipIds = new Set<string>();

    if (scopedMembershipIds.length > 0) {
      const { data: branchRows } = await service
        .from("membership_branches")
        .select("membership_id")
        .in("membership_id", scopedMembershipIds)
        .in("branch_id", branchIds);

      for (const row of (branchRows ?? []) as { membership_id: string }[]) {
        matchingMembershipIds.add(row.membership_id);
      }
    }

    memberships = memberships.filter(
      (m) =>
        m.branch_scope_type !== "branches" || matchingMembershipIds.has(m.id),
    );
  }

  const ids = uniqueStrings(memberships.map((m) => m.user_id));
  if (ids.length === 0) return [];

  const { data: profilesRaw } = await service
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);
  const names = new Map(
    ((profilesRaw ?? []) as { id: string; full_name: string | null }[]).map(
      (p) => [p.id, p.full_name],
    ),
  );
  return ids
    .map((id) => ({ id, full_name: names.get(id) ?? "Instructeur" }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "nl"));
}

export async function loadWeeklyAvailability(
  supabase: ServerSupabase,
  tenantId: string,
  instructorId: string,
): Promise<WeeklyAvailability[]> {
  const { data } = await supabase
    .from("instructor_availability")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("instructor_id", instructorId)
    .order("weekday", { ascending: true })
    .order("start_min", { ascending: true });
  return (data ?? []) as WeeklyAvailability[];
}

export async function loadExceptions(
  supabase: ServerSupabase,
  tenantId: string,
  instructorId: string,
  opts?: { from?: Date; to?: Date },
): Promise<AvailabilityException[]> {
  let query = supabase
    .from("instructor_availability_exception")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("instructor_id", instructorId)
    .order("exception_date", { ascending: true })
    .order("start_min", { ascending: true });
  if (opts?.from) query = query.gte("exception_date", dateKey(opts.from));
  if (opts?.to) query = query.lte("exception_date", dateKey(opts.to));
  const { data } = await query;
  return (data ?? []) as AvailabilityException[];
}

// Free-space (background availability) for an agenda range, keyed by UTC date.
// When `instructorId` is given, scopes to that instructor; when `instructorIds`
// is given, unions across only those instructors. Otherwise unions across all
// instructors visible to the tenant query ("someone is available").
export async function loadFreeSpaceForRange(
  supabase: ServerSupabase,
  opts: {
    tenantId: string;
    from: Date;
    to: Date;
    instructorId?: string;
    instructorIds?: readonly string[];
  },
): Promise<Map<string, Interval[]>> {
  const fromKey = dateKey(opts.from);
  const toKey = dateKey(opts.to);
  const instructorIds = opts.instructorId
    ? [opts.instructorId]
    : opts.instructorIds
      ? uniqueStrings(opts.instructorIds)
      : null;
  if (instructorIds && instructorIds.length === 0) return new Map();

  let weeklyQuery = supabase
    .from("instructor_availability")
    .select("*")
    .eq("tenant_id", opts.tenantId);
  if (opts.instructorId) {
    weeklyQuery = weeklyQuery.eq("instructor_id", opts.instructorId);
  } else if (instructorIds) {
    weeklyQuery = weeklyQuery.in("instructor_id", instructorIds);
  }

  let excQuery = supabase
    .from("instructor_availability_exception")
    .select("*")
    .eq("tenant_id", opts.tenantId)
    .gte("exception_date", fromKey)
    .lte("exception_date", toKey);
  if (opts.instructorId) {
    excQuery = excQuery.eq("instructor_id", opts.instructorId);
  } else if (instructorIds) {
    excQuery = excQuery.in("instructor_id", instructorIds);
  }

  const [{ data: weeklyRaw }, { data: excRaw }] = await Promise.all([
    weeklyQuery,
    excQuery,
  ]);
  const weekly = (weeklyRaw ?? []) as WeeklyAvailability[];
  const exceptions = (excRaw ?? []) as AvailabilityException[];

  const weeklyByInstructor = new Map<string, WeeklyAvailability[]>();
  for (const row of weekly) {
    const list = weeklyByInstructor.get(row.instructor_id) ?? [];
    list.push(row);
    weeklyByInstructor.set(row.instructor_id, list);
  }
  const exceptionsByInstructorDate = new Map<string, AvailabilityException[]>();
  for (const row of exceptions) {
    const key = `${row.instructor_id}:${row.exception_date}`;
    const list = exceptionsByInstructorDate.get(key) ?? [];
    list.push(row);
    exceptionsByInstructorDate.set(key, list);
  }

  const result = new Map<string, Interval[]>();
  for (
    let d = new Date(opts.from);
    d < opts.to;
    d.setDate(d.getDate() + 1)
  ) {
    const key = dateKey(d);
    const free = computeDayFreeSpace(
      key,
      weeklyByInstructor,
      exceptionsByInstructorDate,
    );
    if (free.length > 0) result.set(key, free);
  }
  return result;
}
