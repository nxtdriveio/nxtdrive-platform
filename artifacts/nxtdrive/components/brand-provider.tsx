import { buildThemeStyleVars } from "@/lib/brand-theme";
import { isWhiteLabelEligible } from "@/lib/platform/features";
import type { Tenant, TenantBranding, ThemeTokenSet } from "@/lib/types";

/**
 * Applies tenant-specific brand colors when white-labeling is enabled by
 * overriding the `--primary` design tokens for its subtree. Inline custom
 * properties cascade to all descendants and win over the `:root` / dark-mode
 * defaults, so branding works in both themes.
 *
 * Gating: colors are only applied when BOTH conditions are met:
 *   1. `tenant.white_label_enabled = true`
 *   2. `tenant.plan = 'elite'`  ← white-label is an Elite-tier feature
 *
 * When either condition is false nothing is overridden and the default
 * NXTDRIVE palette shows. This ensures graceful degradation — lower-plan
 * tenants see the platform branding without any error.
 */
export function BrandProvider({
  tenant,
  branding,
  themeTokens,
  className,
  children,
}: {
  tenant: Tenant | null;
  branding: TenantBranding | null;
  themeTokens?: { light: ThemeTokenSet; dark: ThemeTokenSet } | null;
  className?: string;
  children: React.ReactNode;
}) {
  const whitelabel = isWhiteLabelEligible(tenant) && branding;
  const style: Record<string, string> = themeTokens
    ? buildThemeStyleVars(themeTokens)
    : {};

  if (whitelabel && !themeTokens && branding.primary_color) {
    const primary = branding.primary_color;
    style["--tenant-light-primary"] = primary;
    style["--tenant-dark-primary"] = primary;
    style["--brand-primary"] = primary;
    style["--brand-ring"] = primary;
    style["--brand-gradient-mid"] = primary;
    style["--brand-sidebar-active-foreground"] = primary;
    style["--primary"] = primary;
    style["--ring"] = primary;
    style["--primary-soft"] = `color-mix(in oklab, ${primary} 16%, transparent)`;
    style["--brand-sidebar-active"] = `color-mix(in oklab, ${primary} 13%, white)`;
    if (branding.primary_foreground) {
      style["--tenant-light-primary-foreground"] = branding.primary_foreground;
      style["--tenant-dark-primary-foreground"] = branding.primary_foreground;
      style["--brand-primary-foreground"] = branding.primary_foreground;
      style["--primary-foreground"] = branding.primary_foreground;
    }
  }

  return (
    <div
      className={className}
      style={style as React.CSSProperties}
      data-white-label-theme={whitelabel ? "true" : undefined}
    >
      {children}
    </div>
  );
}
