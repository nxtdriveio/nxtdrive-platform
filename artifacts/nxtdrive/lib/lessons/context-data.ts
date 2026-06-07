import type { SupabaseClient } from "@supabase/supabase-js";
import type { Vehicle, Location, LessonContext } from "@/lib/lessons/types";

/**
 * Read-only loaders for the Leskaart L4 lescontext. Pass an RLS-scoped client,
 * or pass an already-authorized service-role client together with branchIds.
 * All loaders FAIL LOUD on query error rather than silently rendering empty
 * state. Writes go through locked RPCs (server actions), never here.
 */

type BranchScopedAssetLoadOptions = {
  activeOnly?: boolean;
  branchIds?: readonly string[] | null;
  includeShared?: boolean;
};

function branchScopeFilter(
  branchIds: readonly string[],
  includeShared: boolean,
): string | null {
  if (branchIds.length === 0) return includeShared ? "branch_id.is.null" : null;
  if (!includeShared) return null;
  return `branch_id.is.null,branch_id.in.(${branchIds.join(",")})`;
}

export async function loadVehicles(
  client: SupabaseClient,
  tenantId: string,
  opts: BranchScopedAssetLoadOptions = {},
): Promise<Vehicle[]> {
  if (Array.isArray(opts.branchIds) && opts.branchIds.length === 0 && !opts.includeShared) {
    return [];
  }

  let q = client
    .from("vehicles")
    .select(
      "id, tenant_id, branch_id, label, license_plate, transmission, active, sort_order, created_at, updated_at",
    )
    .eq("tenant_id", tenantId);
  if (opts.activeOnly) q = q.eq("active", true);
  if (Array.isArray(opts.branchIds)) {
    const filter = branchScopeFilter(opts.branchIds, opts.includeShared === true);
    if (filter) {
      q = q.or(filter);
    } else {
      q = q.in("branch_id", [...opts.branchIds]);
    }
  }
  const { data, error } = await q
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (error) {
    throw new Error(`vehicles: load failed (tenant=${tenantId}): ${error.message}`);
  }
  return (data ?? []) as Vehicle[];
}

export async function loadLocations(
  client: SupabaseClient,
  tenantId: string,
  opts: BranchScopedAssetLoadOptions = {},
): Promise<Location[]> {
  if (Array.isArray(opts.branchIds) && opts.branchIds.length === 0 && !opts.includeShared) {
    return [];
  }

  let q = client
    .from("locations")
    .select(
      "id, tenant_id, branch_id, name, address, active, sort_order, created_at, updated_at",
    )
    .eq("tenant_id", tenantId);
  if (opts.activeOnly) q = q.eq("active", true);
  if (Array.isArray(opts.branchIds)) {
    const filter = branchScopeFilter(opts.branchIds, opts.includeShared === true);
    if (filter) {
      q = q.or(filter);
    } else {
      q = q.in("branch_id", [...opts.branchIds]);
    }
  }
  const { data, error } = await q
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    throw new Error(`locations: load failed (tenant=${tenantId}): ${error.message}`);
  }
  return (data ?? []) as Location[];
}

/**
 * Loads the full saved context for one lesson. The internal note is only
 * returned when the caller's RLS permits reading lesson_internal (staff). For
 * a student-scoped client it will be null, which is correct.
 */
export async function loadLessonContext(
  client: SupabaseClient,
  tenantId: string,
  lessonId: string,
): Promise<LessonContext> {
  const ctx = `tenant=${tenantId} lesson=${lessonId}`;
  const [lessonRes, internalRes, topicsRes] = await Promise.all([
    client
      .from("lessons")
      .select("vehicle_id, location_id, student_note, attention_points, advice")
      .eq("id", lessonId)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    client
      .from("lesson_internal")
      .select("internal_note")
      .eq("lesson_id", lessonId)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    client
      .from("lesson_topics")
      .select("skill_id")
      .eq("lesson_id", lessonId)
      .eq("tenant_id", tenantId),
  ]);

  if (lessonRes.error) {
    throw new Error(`lesson context: load lesson failed (${ctx}): ${lessonRes.error.message}`);
  }
  if (internalRes.error) {
    throw new Error(`lesson context: load internal failed (${ctx}): ${internalRes.error.message}`);
  }
  if (topicsRes.error) {
    throw new Error(`lesson context: load topics failed (${ctx}): ${topicsRes.error.message}`);
  }

  const lesson = lessonRes.data as
    | {
        vehicle_id: string | null;
        location_id: string | null;
        student_note: string | null;
        attention_points: string | null;
        advice: string | null;
      }
    | null;

  return {
    vehicleId: lesson?.vehicle_id ?? null,
    locationId: lesson?.location_id ?? null,
    studentNote: lesson?.student_note ?? null,
    attentionPoints: lesson?.attention_points ?? null,
    advice: lesson?.advice ?? null,
    internalNote:
      (internalRes.data as { internal_note: string | null } | null)?.internal_note ?? null,
    topicSkillIds: ((topicsRes.data ?? []) as { skill_id: string }[]).map((r) => r.skill_id),
  };
}
