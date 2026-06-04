import { requireActiveTenant } from "@/lib/auth/require-role";
import { getTheme } from "@/lib/theme";
import { getTenantBranding, resolveLogoUrl } from "@/lib/branding";
import { BrandProvider } from "@/components/brand-provider";
import { BackofficeSidebar } from "@/components/backoffice/sidebar";
import { BackofficeTopbar } from "@/components/backoffice/topbar";
import { DashboardShell } from "@/components/backoffice/dashboard-shell";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { loadInAppNotifications } from "@/lib/notifications/in-app";
import type { MemberRole } from "@/lib/types";

export const dynamic = "force-dynamic";

// All roles that may enter the backoffice. tenant_admin has full access;
// other roles have scoped access enforced at the individual page level.
const BACKOFFICE_ROLES: MemberRole[] = [
  "tenant_admin",
  "instructor",
  "branch_manager",
  "planner",
  "admin_staff",
  "marketing",
];

const ROLE_LABELS: Record<string, string> = {
  tenant_admin: "Beheerder",
  instructor: "Instructeur",
  branch_manager: "Vestigingsmanager",
  planner: "Planner",
  admin_staff: "Administratie",
  marketing: "Marketing",
};

export default async function BackofficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, tenant, roles } = await requireActiveTenant(BACKOFFICE_ROLES);
  const theme = await getTheme();
  const branding = await getTenantBranding(tenant.id);
  const logoUrl = resolveLogoUrl(tenant.white_label_enabled, branding);

  const userLabel = user.profile?.full_name ?? user.email ?? "Onbekend";
  const roleLabel = roles
    .map((r) => ROLE_LABELS[r] ?? r)
    .join(" + ");
  const { items, unreadCount } = await loadInAppNotifications(tenant.id);

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
