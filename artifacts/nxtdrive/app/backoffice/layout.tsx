import { requireActiveTenant } from "@/lib/auth/require-role";
import { getTheme } from "@/lib/theme";
import { getTenantBranding, resolveLogoUrl } from "@/lib/branding";
import { BrandProvider } from "@/components/brand-provider";
import { BackofficeSidebar } from "@/components/backoffice/sidebar";
import { BackofficeTopbar } from "@/components/backoffice/topbar";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { loadInAppNotifications } from "@/lib/notifications/in-app";

export const dynamic = "force-dynamic";

export default async function BackofficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, tenant, roles } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const theme = await getTheme();
  const branding = await getTenantBranding(tenant.id);
  const logoUrl = resolveLogoUrl(tenant.white_label_enabled, branding);

  const userLabel = user.profile?.full_name ?? user.email ?? "Onbekend";
  const roleLabel = roles
    .map((r) => (r === "tenant_admin" ? "Beheerder" : "Instructeur"))
    .join(" + ");
  const { items, unreadCount } = await loadInAppNotifications(tenant.id);

  return (
    <BrandProvider
      tenant={tenant}
      branding={branding}
      className="flex h-screen bg-background text-foreground"
    >
      <BackofficeSidebar
        tenantName={tenant.name}
        logoUrl={logoUrl}
        isAdmin={roles.includes("tenant_admin")}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <BackofficeTopbar
          userLabel={userLabel}
          roleLabel={roleLabel}
          theme={theme}
          notifications={
            <NotificationBell items={items} unreadCount={unreadCount} />
          }
        />
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </BrandProvider>
  );
}
