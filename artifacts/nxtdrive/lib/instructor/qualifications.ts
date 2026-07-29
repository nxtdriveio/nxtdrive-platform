import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export async function isInstructorRis20Qualified(
  service: SupabaseClient,
  tenantId: string,
  instructorId: string,
): Promise<boolean> {
  const { data, error } = await service
    .from("instructor_training_qualifications")
    .select("is_qualified")
    .eq("tenant_id", tenantId)
    .eq("instructor_id", instructorId)
    .eq("training_method", "RIS_2_0")
    .maybeSingle();
  if (error) throw error;
  return Boolean((data as { is_qualified: boolean } | null)?.is_qualified);
}
