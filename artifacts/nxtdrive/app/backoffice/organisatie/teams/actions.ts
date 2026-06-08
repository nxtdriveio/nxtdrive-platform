"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrganizationPermission } from "@/lib/organization";
import { createServiceRoleClient } from "@/lib/supabase/service";

function field(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function teamUrl(params: Record<string, string | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return `/backoffice/organisatie/teams${query ? `?${query}` : ""}`;
}

function membershipIds(formData: FormData): string[] {
  return formData
    .getAll("membership_ids[]")
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
}

async function setMembersOrRedirect(
  teamId: string,
  tenantId: string,
  actorId: string,
  formData: FormData,
): Promise<void> {
  const service = createServiceRoleClient();
  const { error } = await service.rpc("set_organization_team_members", {
    p_team_id: teamId,
    p_tenant_id: tenantId,
    p_actor: actorId,
    p_membership_ids: membershipIds(formData),
  });

  if (error) {
    redirect(
      teamUrl({
        error: "members_failed",
        reason: error.message,
        edit: teamId,
      }),
    );
  }
}

export async function createOrganizationTeamAction(
  formData: FormData,
): Promise<void> {
  const { user, organization } = await requireOrganizationPermission("team:manage");

  const name = field(formData, "name");
  const slug = field(formData, "slug") ?? (name ? slugify(name) : null);
  const description = field(formData, "description");
  const branchId = field(formData, "branch_id");
  const color = field(formData, "color") ?? "#6d5dfc";

  if (!name || !slug) {
    redirect(teamUrl({ error: "missing_fields" }));
  }

  const service = createServiceRoleClient();
  const { data, error } = await service.rpc("create_organization_team", {
    p_tenant_id: organization.id,
    p_actor: user.id,
    p_name: name,
    p_slug: slug,
    p_description: description,
    p_branch_id: branchId,
    p_color: color,
  });

  if (error || !data) {
    redirect(
      teamUrl({
        error: error?.code === "23505" ? "slug_taken" : "create_failed",
        reason: error?.message,
        slug,
      }),
    );
  }

  await setMembersOrRedirect(data as string, organization.id, user.id, formData);

  revalidatePath("/backoffice/organisatie");
  revalidatePath("/backoffice/organisatie/teams");
  redirect(teamUrl({ success: "created", name }));
}

export async function updateOrganizationTeamAction(
  formData: FormData,
): Promise<void> {
  const { user, organization } = await requireOrganizationPermission("team:manage");

  const teamId = field(formData, "team_id");
  const name = field(formData, "name");
  const description = field(formData, "description");
  const branchId = field(formData, "branch_id");
  const color = field(formData, "color") ?? "#6d5dfc";
  const isActive = formData.get("is_active") !== "false";

  if (!teamId || !name) {
    redirect(teamUrl({ error: "missing_fields" }));
  }

  const service = createServiceRoleClient();
  const { error } = await service.rpc("update_organization_team", {
    p_team_id: teamId,
    p_tenant_id: organization.id,
    p_actor: user.id,
    p_name: name,
    p_description: description,
    p_branch_id: branchId,
    p_color: color,
    p_is_active: isActive,
  });

  if (error) {
    redirect(
      teamUrl({
        error: "update_failed",
        reason: error.message,
        edit: teamId,
      }),
    );
  }

  await setMembersOrRedirect(teamId, organization.id, user.id, formData);

  revalidatePath("/backoffice/organisatie");
  revalidatePath("/backoffice/organisatie/teams");
  redirect(teamUrl({ success: "updated", name }));
}
