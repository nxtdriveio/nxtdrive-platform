import { requireActiveTenant } from "@/lib/auth/require-role";
import { getTenantBranding, resolveLogoUrl } from "@/lib/branding";
import { BrandProvider } from "@/components/brand-provider";
import { InstructorTopBar } from "@/components/instructor/TopBar";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { loadInAppNotifications } from "@/lib/notifications/in-app";

export const dynamic = "force-dynamic";

export default async function InstructorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, tenant } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);
  const userLabel = user.profile?.full_name ?? user.email ?? "Instructeur";
  const branding = await getTenantBranding(tenant.id);
  const logoUrl = resolveLogoUrl(tenant.white_label_enabled, branding);
  const { items, unreadCount } = await loadInAppNotifications(tenant.id);

  return (
    <BrandProvider
      tenant={tenant}
      branding={branding}
      className="flex min-h-screen flex-col bg-background text-foreground"
    >
      <InstructorTopBar
        tenantName={tenant.name}
        userLabel={userLabel}
        logoUrl={logoUrl}
        notifications={
          <NotificationBell items={items} unreadCount={unreadCount} />
        }
      />
      <ServiceWorkerRegister />
      <main className="flex-1 px-3 py-4 sm:px-6 sm:py-6">{children}</main>
    </BrandProvider>
  );
}
