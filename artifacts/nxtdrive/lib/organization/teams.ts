import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type OrganizationTeam = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type OrganizationTeamMember = {
  id: string;
  tenant_id: string;
  team_id: string;
  membership_id: string;
  created_by: string | null;
  created_at: string;
};

type TeamClient = Pick<SupabaseClient, "from">;

const TEAM_COLUMNS = [
  "id",
  "tenant_id",
  "branch_id",
  "name",
  "slug",
  "description",
  "color",
  "is_active",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at",
].join(", ");

export async function listOrganizationTeams(
  client: TeamClient,
  tenantId: string,
  opts: { activeOnly?: boolean } = {},
): Promise<OrganizationTeam[]> {
  let query = client
    .from("organization_teams")
    .select(TEAM_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });

  if (opts.activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) throw new Error(`listOrganizationTeams: ${error.message}`);
  return (data ?? []) as OrganizationTeam[];
}

export async function loadOrganizationTeam(
  client: TeamClient,
  tenantId: string,
  teamId: string,
): Promise<OrganizationTeam | null> {
  const { data, error } = await client
    .from("organization_teams")
    .select(TEAM_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("id", teamId)
    .maybeSingle();

  if (error) throw new Error(`loadOrganizationTeam: ${error.message}`);
  return (data ?? null) as OrganizationTeam | null;
}

export async function listOrganizationTeamMembers(
  client: TeamClient,
  tenantId: string,
): Promise<OrganizationTeamMember[]> {
  const { data, error } = await client
    .from("organization_team_members")
    .select("id, tenant_id, team_id, membership_id, created_by, created_at")
    .eq("tenant_id", tenantId);

  if (error) throw new Error(`listOrganizationTeamMembers: ${error.message}`);
  return (data ?? []) as OrganizationTeamMember[];
}

export async function listMembershipOrganizationTeamIds(
  client: TeamClient,
  tenantId: string,
  membershipId: string,
): Promise<string[]> {
  const { data, error } = await client
    .from("organization_team_members")
    .select("team_id")
    .eq("tenant_id", tenantId)
    .eq("membership_id", membershipId);

  if (error) throw new Error(`listMembershipOrganizationTeamIds: ${error.message}`);
  return (data ?? []).map((row: { team_id: string }) => row.team_id);
}

export function teamMemberIdsForTeam(
  members: readonly OrganizationTeamMember[],
  teamId: string,
): string[] {
  return members
    .filter((member) => member.team_id === teamId)
    .map((member) => member.membership_id);
}

export function teamIdsForMembership(
  members: readonly OrganizationTeamMember[],
  membershipId: string,
): string[] {
  return members
    .filter((member) => member.membership_id === membershipId)
    .map((member) => member.team_id);
}
