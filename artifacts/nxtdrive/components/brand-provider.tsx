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
  forceLightTheme = false,
  className,
  children,
}: {
  tenant: Tenant | null;
  branding: TenantBranding | null;
  themeTokens?: { light: ThemeTokenSet; dark: ThemeTokenSet } | null;
  forceLightTheme?: boolean;
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

  if (forceLightTheme) {
    const primary =
      style["--tenant-light-primary"] ??
      style["--primary"] ??
      "var(--platform-primary)";
    const primaryForeground =
      style["--tenant-light-primary-foreground"] ??
      style["--primary-foreground"] ??
      "var(--platform-primary-foreground)";

    Object.assign(style, {
      "--background": "#f7f8fc",
      "--foreground": "#101323",
      "--card": "#ffffff",
      "--card-foreground": "#101323",
      "--muted": "#f1f3f8",
      "--muted-foreground": "#667085",
      "--border": "#e3e7f0",
      "--input": "#ffffff",
      "--ring": primary,
      "--primary": primary,
      "--primary-foreground": primaryForeground,
      "--primary-soft": `color-mix(in oklab, ${primary} 12%, white)`,
      "--accent": "#f0edff",
      "--accent-foreground": "#33257f",
      "--popover": "#ffffff",
      "--popover-foreground": "#101323",
      "--success": "#17a46b",
      "--warning": "#dc8a16",
      "--danger": "#df3b47",
      "--info": "#2477f2",
      "--brand-background": "#f7f8fc",
      "--brand-foreground": "#101323",
      "--brand-primary": primary,
      "--brand-primary-foreground": primaryForeground,
      "--brand-secondary": "#2fb7ff",
      "--brand-accent": "#f0edff",
      "--brand-accent-foreground": "#33257f",
      "--brand-muted": "#f1f3f8",
      "--brand-muted-foreground": "#667085",
      "--brand-border": "#e3e7f0",
      "--brand-ring": primary,
      "--brand-sidebar-background": "rgba(255, 255, 255, 0.86)",
      "--brand-sidebar-foreground": "#344054",
      "--brand-sidebar-active": `color-mix(in oklab, ${primary} 12%, white)`,
      "--brand-sidebar-active-foreground": primary,
      "--shadow-card": "0 18px 50px rgba(15, 23, 42, 0.08)",
      "--shadow-soft": "0 12px 32px rgba(15, 23, 42, 0.07)",
      "--shadow-floating": "0 24px 70px rgba(15, 23, 42, 0.16)",
    });
  }

  return (
    <div
      className={className}
      style={style as React.CSSProperties}
      data-theme={forceLightTheme ? "light" : undefined}
      data-white-label-theme={whitelabel ? "true" : undefined}
      data-student-app-theme={forceLightTheme ? "light" : undefined}
    >
      {children}
    </div>
  );
}
