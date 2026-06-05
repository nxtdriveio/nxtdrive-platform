import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmailBranding } from "./types";
import { isWhiteLabelEligible } from "@/lib/platform/features";
import type { TenantPlan } from "@/lib/types";

/**
 * Loads a tenant's name + white-label branding using a SERVICE ROLE client
 * (callable from webhooks/cron where there is no user session). White-label
 * visuals are only applied when:
 *   - tenants.plan = 'elite'  AND
 *   - tenants.white_label_enabled = true
 *
 * If either condition is not met the email/PDF renders as standard NXTDRIVE
 * platform mail — never as a customised tenant brand.
 */
export async function loadEmailBranding(
  service: SupabaseClient,
  tenantId: string,
): Promise<EmailBranding> {
  const { data: tenant } = await service
    .from("tenants")
    .select("name, plan, white_label_enabled")
    .eq("id", tenantId)
    .maybeSingle();

  const tenantName = (tenant?.name as string | undefined) ?? "NXTDRIVE";
  const eligible = isWhiteLabelEligible({
    plan: (tenant?.plan as TenantPlan | undefined) ?? "start",
    white_label_enabled: tenant?.white_label_enabled as boolean | null | undefined,
  });

  let logoUrl: string | null = null;
  let primaryColor: string | null = null;
  let primaryForeground: string | null = null;

  if (eligible) {
    const { data: branding } = await service
      .from("tenant_branding")
      .select("logo_url, primary_color, primary_foreground")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    logoUrl = (branding?.logo_url as string | null) ?? null;
    primaryColor = (branding?.primary_color as string | null) ?? null;
    primaryForeground = (branding?.primary_foreground as string | null) ?? null;
  }

  return { tenantName, whiteLabelEnabled: eligible, logoUrl, primaryColor, primaryForeground };
}
