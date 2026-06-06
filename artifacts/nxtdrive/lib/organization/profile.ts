import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const ORGANIZATION_LIFECYCLE_STATUSES = [
  "prospect",
  "onboarding",
  "active",
  "paused",
  "churned",
] as const;

export const ORGANIZATION_ONBOARDING_STATUSES = [
  "not_started",
  "in_progress",
  "ready",
  "blocked",
] as const;

export type OrganizationLifecycleStatus =
  (typeof ORGANIZATION_LIFECYCLE_STATUSES)[number];

export type OrganizationOnboardingStatus =
  (typeof ORGANIZATION_ONBOARDING_STATUSES)[number];

export type OrganizationProfile = {
  tenant_id: string;
  legal_name: string | null;
  billing_email: string | null;
  support_email: string | null;
  kvk_number: string | null;
  vat_number: string | null;
  owner_user_id: string | null;
  lifecycle_status: OrganizationLifecycleStatus;
  onboarding_status: OrganizationOnboardingStatus;
  created_at: string;
  updated_at: string;
};

export type UpsertOrganizationProfileInput = {
  tenantId: string;
  actorId: string;
  legalName?: string | null;
  billingEmail?: string | null;
  supportEmail?: string | null;
  kvkNumber?: string | null;
  vatNumber?: string | null;
  ownerUserId?: string | null;
  lifecycleStatus?: OrganizationLifecycleStatus;
  onboardingStatus?: OrganizationOnboardingStatus;
};

type FromClient = Pick<SupabaseClient, "from">;
type RpcClient = Pick<SupabaseClient, "rpc">;

export async function loadOrganizationProfile(
  supabase: FromClient,
  tenantId: string,
): Promise<OrganizationProfile | null> {
  const { data, error } = await supabase
    .from("organization_profiles")
    .select(
      [
        "tenant_id",
        "legal_name",
        "billing_email",
        "support_email",
        "kvk_number",
        "vat_number",
        "owner_user_id",
        "lifecycle_status",
        "onboarding_status",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    throw new Error(`Kon organisatieprofiel niet laden: ${error.message}`);
  }

  return (data ?? null) as OrganizationProfile | null;
}

export async function upsertOrganizationProfile(
  supabase: RpcClient,
  input: UpsertOrganizationProfileInput,
): Promise<OrganizationProfile> {
  const { data, error } = await supabase.rpc("upsert_organization_profile", {
    p_tenant_id: input.tenantId,
    p_actor: input.actorId,
    p_legal_name: input.legalName ?? null,
    p_billing_email: input.billingEmail ?? null,
    p_support_email: input.supportEmail ?? null,
    p_kvk_number: input.kvkNumber ?? null,
    p_vat_number: input.vatNumber ?? null,
    p_owner_user_id: input.ownerUserId ?? null,
    p_lifecycle_status: input.lifecycleStatus ?? "onboarding",
    p_onboarding_status: input.onboardingStatus ?? "not_started",
  });

  if (error) {
    throw new Error(`Kon organisatieprofiel niet opslaan: ${error.message}`);
  }

  if (!data) {
    throw new Error("Kon organisatieprofiel niet opslaan: geen resultaat ontvangen.");
  }

  return data as OrganizationProfile;
}
