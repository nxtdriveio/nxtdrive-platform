import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmailBranding } from "./types";

/**
 * Loads a tenant's name + white-label branding using a SERVICE ROLE client
 * (callable from webhooks/cron where there is no user session). White-label
 * visuals are only applied when tenants.white_label_enabled = true; otherwise
 * emails read as plain NXTDRIVE-platform mail from the school.
 */
export async function loadEmailBranding(
  service: SupabaseClient,
  tenantId: string,
): Promise<EmailBranding> {
  const { data: tenant } = await service
    .from("tenants")
    .select("name, white_label_enabled")
    .eq("id", tenantId)
    .maybeSingle();

  const tenantName = (tenant?.name as string | undefined) ?? "NXTDRIVE";
  const whiteLabelEnabled = Boolean(tenant?.white_label_enabled);

  let logoUrl: string | null = null;
  let primaryColor: string | null = null;
  let primaryForeground: string | null = null;

  if (whiteLabelEnabled) {
    const { data: branding } = await service
      .from("tenant_branding")
      .select("logo_url, primary_color, primary_foreground")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    logoUrl = (branding?.logo_url as string | null) ?? null;
    primaryColor = (branding?.primary_color as string | null) ?? null;
    primaryForeground = (branding?.primary_foreground as string | null) ?? null;
  }

  return { tenantName, whiteLabelEnabled, logoUrl, primaryColor, primaryForeground };
}
