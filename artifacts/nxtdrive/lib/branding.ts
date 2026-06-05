import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { TenantBranding, TenantPlan } from "@/lib/types";

/**
 * Loads a tenant's white-label branding row. Reads under the caller's session
 * (RLS: members can read their own tenant's branding), so it is safe to call
 * from authenticated layouts. Returns null when no branding row exists.
 */
export async function getTenantBranding(
  tenantId: string,
): Promise<TenantBranding | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("tenant_branding")
    .select("tenant_id, logo_url, primary_color, primary_foreground, custom_domain, welcome_message")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return (data as TenantBranding | null) ?? null;
}

/**
 * Loads a tenant's white-label branding using the service-role key (bypasses
 * RLS). Use ONLY in server-only, unauthenticated contexts such as the login
 * page where no user session exists yet. Never call from a Client Component.
 */
export async function getTenantBrandingPublic(
  tenantId: string,
): Promise<TenantBranding | null> {
  const service = createServiceRoleClient();
  const { data } = await service
    .from("tenant_branding")
    .select("tenant_id, logo_url, primary_color, primary_foreground, custom_domain, welcome_message")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return (data as TenantBranding | null) ?? null;
}

/**
 * The logo URL to display for a tenant: returns the uploaded logo URL only
 * when BOTH conditions are true:
 *   1. `white_label_enabled = true` (tenant setting)
 *   2. `plan = 'elite'` (subscription gate — white-label is an Elite feature)
 *
 * Any other combination returns null and the caller falls back to the
 * NXTDRIVE platform logo. This ensures tenants on Start/Pro cannot
 * accidentally display their branding even if `white_label_enabled` was
 * set before a plan downgrade.
 */
export function resolveLogoUrl(
  tenant: { white_label_enabled: boolean; plan: TenantPlan | string } | null,
  branding: TenantBranding | null,
): string | null {
  if (!tenant) return null;
  if (!tenant.white_label_enabled) return null;
  if (tenant.plan !== "elite") return null;
  return branding?.logo_url ?? null;
}
