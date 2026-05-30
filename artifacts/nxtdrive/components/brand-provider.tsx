import type { Tenant, TenantBranding } from "@/lib/types";

/**
 * Applies tenant-specific brand colors when white-labeling is enabled by
 * overriding the `--primary` design tokens for its subtree. Inline custom
 * properties cascade to all descendants and win over the `:root` / dark-mode
 * defaults, so branding works in both themes. When white-label is off (or no
 * colors are set) nothing is overridden and the default NXTDRIVE palette shows.
 */
export function BrandProvider({
  tenant,
  branding,
  className,
  children,
}: {
  tenant: Tenant | null;
  branding: TenantBranding | null;
  className?: string;
  children: React.ReactNode;
}) {
  const whitelabel = tenant?.white_label_enabled === true && branding;
  const style: Record<string, string> = {};

  if (whitelabel && branding.primary_color) {
    const primary = branding.primary_color;
    style["--primary"] = primary;
    style["--ring"] = primary;
    style["--primary-soft"] = `color-mix(in oklab, ${primary} 16%, transparent)`;
    if (branding.primary_foreground) {
      style["--primary-foreground"] = branding.primary_foreground;
    }
  }

  return (
    <div className={className} style={style as React.CSSProperties}>
      {children}
    </div>
  );
}
