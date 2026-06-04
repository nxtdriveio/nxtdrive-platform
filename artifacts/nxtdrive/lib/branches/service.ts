import type { SupabaseClient } from "@supabase/supabase-js";

export type Branch = {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  address: string | null;
  city: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type MembershipBranch = {
  membership_id: string;
  branch_id: string;
};

export async function listBranches(
  client: SupabaseClient,
  tenantId: string,
  opts?: { activeOnly?: boolean },
): Promise<Branch[]> {
  let query = client
    .from("branches")
    .select("id, tenant_id, name, slug, address, city, is_active, created_at, updated_at")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });

  if (opts?.activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) throw new Error(`listBranches: ${error.message}`);
  return (data ?? []) as Branch[];
}

export async function loadBranch(
  client: SupabaseClient,
  branchId: string,
  tenantId: string,
): Promise<Branch | null> {
  const { data, error } = await client
    .from("branches")
    .select("id, tenant_id, name, slug, address, city, is_active, created_at, updated_at")
    .eq("id", branchId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) throw new Error(`loadBranch: ${error.message}`);
  return data as Branch | null;
}

export async function listMembershipBranches(
  client: SupabaseClient,
  membershipId: string,
): Promise<string[]> {
  const { data, error } = await client
    .from("membership_branches")
    .select("branch_id")
    .eq("membership_id", membershipId);

  if (error) throw new Error(`listMembershipBranches: ${error.message}`);
  return (data ?? []).map((r: { branch_id: string }) => r.branch_id);
}
