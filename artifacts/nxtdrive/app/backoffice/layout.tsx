import { requireActiveTenant } from "@/lib/auth/require-role";
import { getTheme } from "@/lib/theme";
import {
  getTenantBranding,
  resolveBrandAppName,
  resolveBrandDescription,
  resolveLogoUrl,
  resolveThemeColor,
} from "@/lib/branding";
import { BrandProvider } from "@/components/brand-provider";
import { BackofficeSidebar } from "@/components/backoffice/sidebar";
import { BackofficeTopbar } from "@/components/backoffice/topbar";
import { DashboardShell } from "@/components/backoffice/dashboard-shell";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { loadInAppNotifications } from "@/lib/notifications/in-app";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { Metadata, Viewport } from "next";
import type { MemberRole } from "@/lib/types";
import { tenantHasFeature } from "@/lib/platform/features";

export const dynamic = "force-dynamic";

const BACKOFFICE_ROLES: MemberRole[] = [
  "tenant_admin",
  "instructor",
  "branch_manager",
  "planner",
  "admin_staff",
  "marketing",
  "franchise_admin",
];

const ROLE_LABELS: Record<string, string> = {
  tenant_admin: "Beheerder",
  instructor: "Instructeur",
  branch_manager: "Vestigingsmanager",
  planner: "Planner",
  admin_staff: "Administratie",
  marketing: "Marketing",
  franchise_admin: "Franchise Admin",
};

async function loadBackofficeBrandingContext() {
  const { tenant } = await requireActiveTenant(BACKOFFICE_ROLES);
  const branding = await getTenantBranding(tenant.id);

  return {
    tenant,
    branding,
    logoUrl: resolveLogoUrl(tenant, branding),
    brandTitle: resolveBrandAppName(tenant, "backoffice"),
    brandDescription: resolveBrandDescription(tenant, "backoffice"),
    themeColor: resolveThemeColor(tenant, branding),
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const brandingContext = await loadBackofficeBrandingContext();

  return {
    title: brandingContext.brandTitle,
    description: brandingContext.brandDescription,
    manifest: "/manifest.webmanifest",
    applicationName: brandingContext.brandTitle,
  };
}

export async function generateViewport(): Promise<Viewport> {
  const brandingContext = await loadBackofficeBrandingContext();

  return {
    themeColor: brandingContext.themeColor,
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
  };
}

export default async function BackofficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, tenant, roles } = await requireActiveTenant(BACKOFFICE_ROLES);
  const theme = await getTheme();
  const branding = await getTenantBranding(tenant.id);
  const logoUrl = resolveLogoUrl(tenant, branding);

  const userLabel = user.profile?.full_name ?? user.email ?? "Onbekend";
  const roleLabel = roles
    .map((r) => ROLE_LABELS[r] ?? r)
    .join(" + ");
  const { items, unreadCount } = await loadInAppNotifications(tenant.id);

  let hasFranchise = false;
  if (
    tenantHasFeature(tenant, "franchise_as_franchisegever") &&
    (tenant.parent_tenant_id === null || tenant.parent_tenant_id === undefined)
  ) {
    const service = createServiceRoleClient();
    const { count } = await service
      .from("tenants")
      .select("id", { count: "exact", head: true })
      .eq("parent_tenant_id", tenant.id);
    hasFranchise = (count ?? 0) > 0;
  }

  const hasMultiBranch = tenantHasFeature(tenant, "multi_branch");

  return (
    <BrandProvider
      tenant={tenant}
      branding={branding}
      className="h-screen overflow-hidden"
    >
      <DashboardShell
        sidebar={
          <BackofficeSidebar
            tenantName={tenant.name}
            logoUrl={logoUrl}
            isAdmin={roles.includes("tenant_admin")}
            hasFranchise={hasFranchise}
            hasMultiBranch={hasMultiBranch}
          />
        }
        topbar={
          <BackofficeTopbar
            userLabel={userLabel}
            roleLabel={roleLabel}
            tenantName={tenant.name}
            theme={theme}
            notifications={
              <NotificationBell items={items} unreadCount={unreadCount} />
            }
          />
        }
      >
        {children}
      </DashboardShell>
    </BrandProvider>
  );
}
