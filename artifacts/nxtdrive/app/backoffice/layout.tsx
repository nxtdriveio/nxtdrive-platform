import { requireActiveTenant } from "@/lib/auth/require-role";
import { getTheme } from "@/lib/theme";
import {
  getTenantBrandingBundle,
  resolveBrandAppName,
  resolveBrandDescription,
  resolveLogoUrl,
  resolveThemeColorForMode,
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
import { cache } from "react";
import { PLAN_LABELS } from "@/lib/platform/features";
import {
  canViewExistingFranchiseNetwork,
  loadTenantEntitlementSnapshot,
} from "@/lib/platform/entitlements";

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

const loadBackofficeBrandingContext = cache(async () => {
  const { tenant } = await requireActiveTenant(BACKOFFICE_ROLES);
  const bundle = await getTenantBrandingBundle(tenant.id);

  return {
    tenant,
    bundle,
    logoUrl: resolveLogoUrl(tenant, bundle.branding),
    brandTitle: resolveBrandAppName(tenant, "backoffice"),
    brandDescription: resolveBrandDescription(tenant, "backoffice"),
  };
});

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
  const [brandingContext, theme] = await Promise.all([
    loadBackofficeBrandingContext(),
    getTheme(),
  ]);

  return {
    themeColor: resolveThemeColorForMode(
      brandingContext.tenant,
      theme,
      brandingContext.bundle,
    ),
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
  const bundle = await getTenantBrandingBundle(tenant.id);
  const logoUrl = resolveLogoUrl(tenant, bundle.branding);

  const userLabel = user.profile?.full_name ?? user.email ?? "Onbekend";
  const roleLabel = roles
    .map((r) => ROLE_LABELS[r] ?? r)
    .join(" + ");
  const { items, unreadCount } = await loadInAppNotifications(tenant.id);

  const service = createServiceRoleClient();
  const entitlementSnapshot = await loadTenantEntitlementSnapshot(
    service,
    tenant.id,
  );
  let hasFranchise = false;
  if (tenant.parent_tenant_id === null || tenant.parent_tenant_id === undefined) {
    const { count } = await service
      .from("tenants")
      .select("id", { count: "exact", head: true })
      .eq("parent_tenant_id", tenant.id);
    hasFranchise = canViewExistingFranchiseNetwork(
      entitlementSnapshot,
      count ?? 0,
    );
  }
  const hasMultiBranch = entitlementSnapshot.featureAccess.multi_branch.allowed;
  const entitlementAlerts = Object.values(
    entitlementSnapshot.limitStatuses,
  ).filter((status) => status.isAtLimit || status.isOverLimit).length;

  return (
    <BrandProvider
      tenant={tenant}
      branding={bundle.branding}
      themeTokens={bundle.tokens}
      className="h-screen overflow-hidden"
    >
      <div data-management-shell="" className="h-screen overflow-hidden">
        <DashboardShell
          sidebar={
            <BackofficeSidebar
              tenantName={tenant.name}
              logoUrl={logoUrl}
              isAdmin={roles.includes("tenant_admin")}
              hasFranchise={hasFranchise}
              hasMultiBranch={hasMultiBranch}
              planLabel={PLAN_LABELS[tenant.plan] ?? tenant.plan}
              entitlementAlertCount={entitlementAlerts}
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
      </div>
    </BrandProvider>
  );
}
