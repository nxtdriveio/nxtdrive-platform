import { createServiceRoleClient } from "@/lib/supabase/service";

/**
 * Best-effort lookup of instructor display names for a set of user ids.
 * Uses the service role since profiles is not tenant-scoped via RLS for
 * non-member readers; result is display-only. Returns an empty map on
 * empty input.
 */
export async function getInstructorNames(
  instructorIds: string[],
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(instructorIds.filter(Boolean)));
  if (unique.length === 0) return new Map();
  const service = createServiceRoleClient();
  const { data } = await service
    .from("profiles")
    .select("id, full_name")
    .in("id", unique);
  return new Map(
    ((data ?? []) as { id: string; full_name: string | null }[]).map((p) => [
      p.id,
      p.full_name ?? "Instructeur",
    ]),
  );
}
