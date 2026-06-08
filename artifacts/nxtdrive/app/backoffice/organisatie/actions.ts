"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganizationPermission } from "@/lib/organization";
import {
  loadOrganizationProfile,
  upsertOrganizationProfile,
} from "@/lib/organization";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { MemberRole } from "@/lib/types";

const STAFF_ROLES = [
  "tenant_admin",
  "franchise_admin",
  "branch_manager",
  "planner",
  "admin_staff",
  "marketing",
  "instructor",
] as const satisfies readonly MemberRole[];

function field(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function profileErrorUrl(code: string, reason?: string): string {
  const params = new URLSearchParams({ profile: "error", code });
  if (reason) params.set("reason", reason);
  return `/backoffice/organisatie?${params.toString()}`;
}

export async function saveOrganizationProfileAction(
  formData: FormData,
): Promise<void> {
  const { user, organization } = await requireOrganizationPermission(
    "organization:update",
  );
  const service = createServiceRoleClient();

  const ownerUserId = field(formData, "owner_user_id");

  if (ownerUserId) {
    const { data, error } = await service
      .from("memberships")
      .select("id")
      .eq("tenant_id", organization.id)
      .eq("user_id", ownerUserId)
      .in("role", Array.from(STAFF_ROLES))
      .limit(1)
      .maybeSingle();

    if (error) {
      redirect(profileErrorUrl("owner_lookup_failed", error.message));
    }
    if (!data) {
      redirect(profileErrorUrl("invalid_owner"));
    }
  }

  try {
    const current = await loadOrganizationProfile(service, organization.id);

    await upsertOrganizationProfile(service, {
      tenantId: organization.id,
      actorId: user.id,
      legalName: field(formData, "legal_name"),
      billingEmail: field(formData, "billing_email"),
      supportEmail: field(formData, "support_email"),
      kvkNumber: field(formData, "kvk_number"),
      vatNumber: field(formData, "vat_number"),
      ownerUserId,
      lifecycleStatus: current?.lifecycle_status ?? "onboarding",
      onboardingStatus: current?.onboarding_status ?? "in_progress",
    });
  } catch (error) {
    redirect(
      profileErrorUrl(
        "save_failed",
        error instanceof Error ? error.message : "Onbekende fout",
      ),
    );
  }

  revalidatePath("/backoffice/organisatie");
  revalidatePath("/backoffice");
  redirect("/backoffice/organisatie?profile=saved");
}
