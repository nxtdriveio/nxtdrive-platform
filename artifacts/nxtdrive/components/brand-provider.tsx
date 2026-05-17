import type { Tenant, TenantBranding } from "@/lib/types";

/**
 * Applies tenant-specific CSS variables when white-labeling is enabled.
 * Falls back to NXTDRIVE defaults otherwise.
 */
export function BrandProvider({
  tenant,
  branding,
  children,
}: {
  tenant: Tenant | null;
  branding: TenantBranding | null;
  children: React.ReactNode;
}) {
  const whitelabel = tenant?.white_label_enabled === true && branding;
  const style: React.CSSProperties = {};

  if (whitelabel) {
    if (branding.primary_color) {
      (style as Record<string, string>)["--tenant-primary"] =
        branding.primary_color;
    }
    if (branding.primary_foreground) {
      (style as Record<string, string>)["--tenant-primary-foreground"] =
        branding.primary_foreground;
    }
  }

  return <div style={style}>{children}</div>;
}
