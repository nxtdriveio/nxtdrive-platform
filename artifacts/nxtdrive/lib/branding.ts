import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { TenantBranding } from "@/lib/types";

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
    .select("tenant_id, logo_url, primary_color, primary_foreground, custom_domain")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return (data as TenantBranding | null) ?? null;
}

/**
 * The logo URL to display for a tenant: only the uploaded logo when white-label
 * is enabled AND a logo is set, otherwise null (caller falls back to NXTDRIVE).
 */
export function resolveLogoUrl(
  whiteLabelEnabled: boolean,
  branding: TenantBranding | null,
): string | null {
  if (!whiteLabelEnabled) return null;
  return branding?.logo_url ?? null;
}
