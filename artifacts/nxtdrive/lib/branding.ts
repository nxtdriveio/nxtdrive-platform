import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { isWhiteLabelEligible } from "@/lib/platform/features";
import { resolveTenantByHost } from "@/lib/tenant/resolve-host";
import type { Tenant, TenantBranding, TenantPlan } from "@/lib/types";

const DEFAULT_PLATFORM_NAME = "NXTDRIVE";
const DEFAULT_THEME_COLOR = "#6b4eff";

type BrandableTenant = Pick<Tenant, "name" | "white_label_enabled" | "plan"> | null;
export type BrandingSurface = "platform" | "backoffice" | "student" | "instructor";

export type BrandingContext = {
  tenant: Tenant | null;
  branding: TenantBranding | null;
  whiteLabelActive: boolean;
  brandName: string;
  logoUrl: string | null;
  themeColor: string;
};

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

export function isWhiteLabelActive(
  tenant: { white_label_enabled: boolean; plan: TenantPlan | string } | null,
): boolean {
  if (!tenant) return false;
  return isWhiteLabelEligible(tenant);
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
  if (!isWhiteLabelActive(tenant)) return null;
  return branding?.logo_url ?? null;
}

export function resolveThemeColor(
  tenant: BrandableTenant,
  branding: TenantBranding | null,
  fallback = DEFAULT_THEME_COLOR,
): string {
  if (!isWhiteLabelActive(tenant)) return fallback;
  return branding?.primary_color ?? fallback;
}

export function resolveBrandName(tenant: BrandableTenant): string {
  if (!isWhiteLabelActive(tenant)) return DEFAULT_PLATFORM_NAME;
  return tenant?.name?.trim() || DEFAULT_PLATFORM_NAME;
}

export function resolveBrandAppName(
  tenant: BrandableTenant,
  surface: BrandingSurface,
): string {
  const brand = resolveBrandName(tenant);
  switch (surface) {
    case "backoffice":
      return brand === DEFAULT_PLATFORM_NAME ? "NXTDRIVE Backoffice" : `${brand} Backoffice`;
    case "student":
      return brand === DEFAULT_PLATFORM_NAME ? "NXTDRIVE Leerling" : `${brand} Leerling`;
    case "instructor":
      return brand === DEFAULT_PLATFORM_NAME ? "NXTDRIVE Instructeur" : `${brand} Instructeur`;
    default:
      return brand;
  }
}

export function resolveBrandDescription(
  tenant: BrandableTenant,
  surface: BrandingSurface,
): string {
  const brand = resolveBrandName(tenant);
  switch (surface) {
    case "backoffice":
      return brand === DEFAULT_PLATFORM_NAME
        ? "Het complete platform voor rijscholen — van eerste lead tot geslaagd examen."
        : `Het backoffice van ${brand} voor planning, leerlingen, voortgang en operatie.`;
    case "student":
      return brand === DEFAULT_PLATFORM_NAME
        ? "Jouw rijopleiding in één overzicht — lessen, tegoed, voortgang en meer."
        : `De leerlingomgeving van ${brand} met lessen, tegoed, voortgang en berichten.`;
    case "instructor":
      return brand === DEFAULT_PLATFORM_NAME
        ? "Vandaag slim en overzichtelijk lesgeven — planning, leerlingen en lessen."
        : `De instructeursomgeving van ${brand} voor planning, leerlingen en lesuitvoering.`;
    default:
      return brand === DEFAULT_PLATFORM_NAME
        ? "Het complete platform voor rijscholen — van eerste lead tot geslaagd examen."
        : `De digitale rijschoolomgeving van ${brand}.`;
  }
}

/**
 * Resolves tenant + branding from the inbound host header for unauthenticated
 * surfaces such as root metadata, login and public manifests.
 */
export async function getBrandingContextByHost(
  hostHeader: string | null | undefined,
): Promise<BrandingContext> {
  const service = createServiceRoleClient();
  const tenant = await resolveTenantByHost(service, hostHeader);
  const branding = tenant ? await getTenantBrandingPublic(tenant.id) : null;

  return {
    tenant,
    branding,
    whiteLabelActive: isWhiteLabelActive(tenant),
    brandName: resolveBrandName(tenant),
    logoUrl: resolveLogoUrl(tenant, branding),
    themeColor: resolveThemeColor(tenant, branding),
  };
}
