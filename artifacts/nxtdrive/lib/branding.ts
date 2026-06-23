import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { cache } from "react";
import {
  getDefaultThemeTokenSet,
  getResolvedThemeTokens,
  normalizeThemeOverrides,
  normalizeThemeTokenSet,
} from "@/lib/brand-theme";
import { isWhiteLabelEligible } from "@/lib/platform/features";
import { resolveTenantByHost } from "@/lib/tenant/resolve-host";
import type {
  Tenant,
  TenantBranding,
  TenantPlan,
  ThemeMode,
  ThemePreset,
  ThemeTokenSet,
} from "@/lib/types";

const DEFAULT_PLATFORM_NAME = "NXTDRIVE";
const DEFAULT_THEME_COLOR = "#6b4eff";
const TENANT_BRANDING_SELECT =
  "tenant_id, logo_url, primary_color, primary_foreground, custom_domain, welcome_message, theme_preset_id, theme_overrides";

type BrandableTenant = Pick<Tenant, "name" | "white_label_enabled" | "plan"> | null;
export type BrandingSurface =
  | "platform"
  | "backoffice"
  | "student"
  | "instructor"
  | "parent";
export type BrandingThemeBundle = {
  branding: TenantBranding | null;
  preset: ThemePreset | null;
  baseTokens: {
    light: ThemeTokenSet;
    dark: ThemeTokenSet;
  };
  tokens: {
    light: ThemeTokenSet;
    dark: ThemeTokenSet;
  };
};

export type BrandingContext = {
  tenant: Tenant | null;
  branding: TenantBranding | null;
  whiteLabelActive: boolean;
  brandName: string;
  logoUrl: string | null;
  themeColor: string;
};

function mapTenantBrandingRow(data: Record<string, unknown> | null): TenantBranding | null {
  if (!data || typeof data["tenant_id"] !== "string") return null;

  return {
    tenant_id: data["tenant_id"],
    logo_url: typeof data["logo_url"] === "string" ? data["logo_url"] : null,
    primary_color:
      typeof data["primary_color"] === "string" ? data["primary_color"] : null,
    primary_foreground:
      typeof data["primary_foreground"] === "string"
        ? data["primary_foreground"]
        : null,
    custom_domain:
      typeof data["custom_domain"] === "string" ? data["custom_domain"] : null,
    welcome_message:
      typeof data["welcome_message"] === "string"
        ? data["welcome_message"]
        : null,
    theme_preset_id:
      typeof data["theme_preset_id"] === "string"
        ? data["theme_preset_id"]
        : null,
    theme_overrides: normalizeThemeOverrides(data["theme_overrides"]),
  };
}

function mapThemePresetRow(data: Record<string, unknown> | null): ThemePreset | null {
  if (!data || typeof data["id"] !== "string") return null;

  return {
    id: data["id"],
    slug: typeof data["slug"] === "string" ? data["slug"] : "",
    name: typeof data["name"] === "string" ? data["name"] : "",
    description:
      typeof data["description"] === "string" ? data["description"] : null,
    tokens_light: normalizeThemeTokenSet(data["tokens_light"], "light"),
    tokens_dark: normalizeThemeTokenSet(data["tokens_dark"], "dark"),
    is_system: data["is_system"] === true,
    is_active: data["is_active"] !== false,
    created_at:
      typeof data["created_at"] === "string" ? data["created_at"] : "",
    updated_at:
      typeof data["updated_at"] === "string" ? data["updated_at"] : "",
  };
}

/**
 * Loads a tenant's white-label branding row from the service role. This file
 * is server-only, so using the service client here keeps runtime resolution
 * simple while still centralizing all gating in application code.
 */
export const getTenantBranding = cache(async (
  tenantId: string,
): Promise<TenantBranding | null> => {
  const service = createServiceRoleClient();
  const { data } = await service
    .from("tenant_branding")
    .select(TENANT_BRANDING_SELECT)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return mapTenantBrandingRow((data as Record<string, unknown> | null) ?? null);
});

/**
 * Public helper kept for clarity in unauthenticated surfaces such as login and
 * auth error screens. Internally it uses the same service-role backed loader.
 */
export const getTenantBrandingPublic = cache(async (
  tenantId: string,
): Promise<TenantBranding | null> => {
  return getTenantBranding(tenantId);
});

export const getThemePresetById = cache(async (
  presetId: string,
): Promise<ThemePreset | null> => {
  const service = createServiceRoleClient();
  const { data } = await service
    .from("theme_presets")
    .select(
      "id, slug, name, description, tokens_light, tokens_dark, is_system, is_active, created_at, updated_at",
    )
    .eq("id", presetId)
    .maybeSingle();

  return mapThemePresetRow((data as Record<string, unknown> | null) ?? null);
});

export const listThemePresets = cache(async (): Promise<ThemePreset[]> => {
  const service = createServiceRoleClient();
  const { data } = await service
    .from("theme_presets")
    .select(
      "id, slug, name, description, tokens_light, tokens_dark, is_system, is_active, created_at, updated_at",
    )
    .order("is_system", { ascending: false })
    .order("name", { ascending: true });

  return ((data ?? []) as Record<string, unknown>[])
    .map((row) => mapThemePresetRow(row))
    .filter((row): row is ThemePreset => row !== null);
});

export const getTenantBrandingBundle = cache(async (
  tenantId: string,
): Promise<BrandingThemeBundle> => {
  const branding = await getTenantBranding(tenantId);
  const preset =
    branding?.theme_preset_id != null
      ? await getThemePresetById(branding.theme_preset_id)
      : null;
  const baseTokens = getResolvedThemeTokens(
    preset,
    null,
    branding,
  );

  return {
    branding,
    preset,
    baseTokens,
    tokens: getResolvedThemeTokens(
      preset,
      branding?.theme_overrides,
      branding,
    ),
  };
});

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

export function resolveThemeColorForMode(
  tenant: BrandableTenant,
  mode: ThemeMode,
  bundle: BrandingThemeBundle | null | undefined,
  fallback = DEFAULT_THEME_COLOR,
): string {
  if (!isWhiteLabelActive(tenant)) return fallback;
  if (!bundle) return fallback;
  return mode === "dark" ? bundle.tokens.dark.primary : bundle.tokens.light.primary;
}

export function getPlatformThemeTokens(mode: ThemeMode): ThemeTokenSet {
  return getDefaultThemeTokenSet(mode);
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
    case "parent":
      return brand === DEFAULT_PLATFORM_NAME ? "NXTDRIVE Ouder" : `${brand} Ouder`;
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
    case "parent":
      return brand === DEFAULT_PLATFORM_NAME
        ? "Blijf betrokken bij de rijopleiding met voortgang, afspraken en betalingen."
        : `Het ouderportaal van ${brand} met voortgang, afspraken, documenten en betalingen.`;
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
export const getBrandingContextByHost = cache(async (
  hostHeader: string | null | undefined,
): Promise<BrandingContext> => {
  const service = createServiceRoleClient();
  const tenant = await resolveTenantByHost(service, hostHeader);
  const bundle = tenant ? await getTenantBrandingBundle(tenant.id) : null;
  const branding = bundle?.branding ?? null;

  return {
    tenant,
    branding,
    whiteLabelActive: isWhiteLabelActive(tenant),
    brandName: resolveBrandName(tenant),
    logoUrl: resolveLogoUrl(tenant, branding),
    themeColor: bundle?.tokens.dark.primary ?? resolveThemeColor(tenant, branding),
  };
});
