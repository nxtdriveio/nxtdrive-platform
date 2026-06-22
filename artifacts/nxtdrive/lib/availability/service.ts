// ---------------------------------------------------------------------------
// Availability DB loaders (RLS-scoped to the caller's tenant via the anon-key
// server client). Pure computation lives in ./compute.
// ---------------------------------------------------------------------------

import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  computeDayFreeSpace,
  computeFreeIntervals,
  dateKeysInRange,
  dateKey,
  weekdayForDateKey,
} from "@/lib/availability/compute";
import type {
  AvailabilityException,
  Interval,
  WeeklyAvailability,
} from "@/lib/availability/types";
import { formatInterval, WEEKDAY_SHORT } from "@/lib/availability/types";

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export type TenantInstructor = { id: string; full_name: string };

export type AvailabilitySummary = {
  blockCount: number;
  activeWeekdays: number;
  weeklyMinutes: number;
  exceptionCount: number;
  extraOpenings: number;
  blockedExceptions: number;
};

export type ResolvedAvailabilityDay = {
  date: string;
  dayLabel: string;
  active: boolean;
  status: "open" | "closed" | "adjusted";
  sourceLabel: string;
  intervals: Interval[];
  intervalLabel: string;
  availableMinutes: number;
  weeklyBlockCount: number;
  exceptionCount: number;
};

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
  const { data: membershipsRaw, error: membershipsError } = await service
    .from("memberships")
    .select("id, user_id, role, branch_scope_type")
    .eq("tenant_id", tenantId)
    .in("role", ["instructor", "tenant_admin"]);
  if (membershipsError) throw membershipsError;

  let memberships = (membershipsRaw ?? []) as InstructorMembershipRow[];
  if (branchIds) {
    const scopedMembershipIds = memberships
      .filter((m) => m.branch_scope_type === "branches")
      .map((m) => m.id);
    const matchingMembershipIds = new Set<string>();

    if (scopedMembershipIds.length > 0) {
      const { data: branchRows, error: branchRowsError } = await service
        .from("membership_branches")
        .select("membership_id")
        .in("membership_id", scopedMembershipIds)
        .in("branch_id", branchIds);
      if (branchRowsError) throw branchRowsError;

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

  const { data: profilesRaw, error: profilesError } = await service
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);
  if (profilesError) throw profilesError;
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
  opts: { branchId?: string | null } = {},
): Promise<WeeklyAvailability[]> {
  let query = supabase
    .from("instructor_availability")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("instructor_id", instructorId)
    .order("weekday", { ascending: true })
    .order("start_min", { ascending: true });

  query =
    opts.branchId === undefined || opts.branchId === null
      ? query.is("branch_id", null)
      : query.eq("branch_id", opts.branchId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as WeeklyAvailability[];
}

export async function loadExceptions(
  supabase: ServerSupabase,
  tenantId: string,
  instructorId: string,
  opts?: {
    from?: Date;
    to?: Date;
    branchId?: string | null;
    timeZone?: string | null;
  },
): Promise<AvailabilityException[]> {
  let query = supabase
    .from("instructor_availability_exception")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("instructor_id", instructorId)
    .order("exception_date", { ascending: true })
    .order("start_min", { ascending: true });
  query =
    opts?.branchId === undefined || opts.branchId === null
      ? query.is("branch_id", null)
      : query.eq("branch_id", opts.branchId);
  if (opts?.from) {
    query = query.gte("exception_date", dateKey(opts.from, opts.timeZone));
  }
  if (opts?.to) {
    query = query.lte("exception_date", dateKey(opts.to, opts.timeZone));
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AvailabilityException[];
}

export function resolveAvailabilityDays(
  weekly: readonly WeeklyAvailability[],
  exceptions: readonly AvailabilityException[],
  opts: { from: Date; days: number; timeZone?: string | null },
): ResolvedAvailabilityDay[] {
  const exceptionsByDate = new Map<string, AvailabilityException[]>();
  for (const exception of exceptions) {
    const list = exceptionsByDate.get(exception.exception_date) ?? [];
    list.push(exception);
    exceptionsByDate.set(exception.exception_date, list);
  }

  const result: ResolvedAvailabilityDay[] = [];
  const keys = dateKeysInRange(
    opts.from,
    new Date(opts.from.getTime() + opts.days * 24 * 60 * 60 * 1000),
    opts.timeZone,
  ).slice(0, opts.days);
  for (const key of keys) {
    const weekday = weekdayForDateKey(key);
    const weeklyBlocks = weekly
      .filter((block) => block.weekday === weekday)
      .sort((a, b) => a.start_min - b.start_min);
    const dayExceptions = (exceptionsByDate.get(key) ?? []).sort((a, b) => {
      const aStart = a.start_min ?? 0;
      const bStart = b.start_min ?? 0;
      return aStart - bStart;
    });
    const intervals = computeFreeIntervals(weeklyBlocks, dayExceptions);
    const availableMinutes = intervals.reduce(
      (sum, interval) => sum + Math.max(0, interval.end_min - interval.start_min),
      0,
    );
    const hasExceptions = dayExceptions.length > 0;
    const sourceLabel = hasExceptions
      ? "Aangepast"
      : weeklyBlocks.length > 0
        ? "Basisweek"
        : "Geen schema";

    result.push({
      date: key,
      dayLabel: `${WEEKDAY_SHORT[weekday]} ${Number(key.slice(8, 10))}/${Number(key.slice(5, 7))}`,
      active: intervals.length > 0,
      status: intervals.length > 0 ? (hasExceptions ? "adjusted" : "open") : "closed",
      sourceLabel,
      intervals,
      intervalLabel: intervals.length > 0 ? intervals.map(formatInterval).join(", ") : "Geen beschikbaarheid",
      availableMinutes,
      weeklyBlockCount: weeklyBlocks.length,
      exceptionCount: dayExceptions.length,
    });
  }
  return result;
}

export function summarizeAvailability(
  weekly: readonly WeeklyAvailability[],
  exceptions: readonly AvailabilityException[],
): AvailabilitySummary {
  const weekdays = new Set(weekly.map((block) => block.weekday));
  return {
    blockCount: weekly.length,
    activeWeekdays: weekdays.size,
    weeklyMinutes: weekly.reduce(
      (sum, block) => sum + Math.max(0, block.end_min - block.start_min),
      0,
    ),
    exceptionCount: exceptions.length,
    extraOpenings: exceptions.filter((row) => row.kind === "available").length,
    blockedExceptions: exceptions.filter((row) => row.kind === "blocked").length,
  };
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
    branchIds?: readonly string[] | null;
    timeZone?: string | null;
  },
): Promise<Map<string, Interval[]>> {
  const fromKey = dateKey(opts.from, opts.timeZone);
  const toKey = dateKey(opts.to, opts.timeZone);
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
  if (opts.branchIds) {
    const branchIds = uniqueStrings(opts.branchIds);
    if (branchIds.length === 0) return new Map();
    weeklyQuery = weeklyQuery.or(`branch_id.is.null,branch_id.in.(${branchIds.join(",")})`);
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
  if (opts.branchIds) {
    const branchIds = uniqueStrings(opts.branchIds);
    if (branchIds.length === 0) return new Map();
    excQuery = excQuery.or(`branch_id.is.null,branch_id.in.(${branchIds.join(",")})`);
  }

  const [
    { data: weeklyRaw, error: weeklyError },
    { data: excRaw, error: excError },
  ] = await Promise.all([
    weeklyQuery,
    excQuery,
  ]);
  if (weeklyError) throw weeklyError;
  if (excError) throw excError;
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
  for (const key of dateKeysInRange(opts.from, opts.to, opts.timeZone)) {
    const free = computeDayFreeSpace(
      key,
      weeklyByInstructor,
      exceptionsByInstructorDate,
    );
    if (free.length > 0) result.set(key, free);
  }
  return result;
}
