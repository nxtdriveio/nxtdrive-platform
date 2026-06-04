import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { getTenantBranding, resolveLogoUrl } from "@/lib/branding";
import { BrandProvider } from "@/components/brand-provider";
import { InstructorSidebar } from "@/components/instructor/Sidebar";
import { InstructorTopbar } from "@/components/instructor/InstructorTopbar";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { InstallPromptBanner } from "@/components/pwa/InstallPromptBanner";
import { InstructorSplash } from "@/components/pwa/InstructorSplash";
import { loadInAppNotifications } from "@/lib/notifications/in-app";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "NXTDRIVE Instructeur",
  manifest: "/instructor/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Instructeur",
    startupImage: [
      {
        url: "/splash/ios-splash-1170x2532.svg",
        media:
          "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        url: "/splash/ios-splash-828x1792.svg",
        media:
          "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)",
      },
    ],
  },
  icons: { apple: "/icons/instructor-apple-180.png" },
};

export const viewport: Viewport = {
  themeColor: "#0c0c15",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

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

  const notificationBell = (
    <NotificationBell items={items} unreadCount={unreadCount} />
  );

  return (
    <BrandProvider tenant={tenant} branding={branding}>
      {/*
        data-instructor forces the dark + amber design token overrides defined in
        globals.css for the instructor PWA shell. This overrides tenant branding
        and the user's light/dark preference for a consistent in-car UI.
      */}
      <div
        data-instructor=""
        className="flex min-h-screen flex-col text-foreground md:flex-row"
      >
        <InstructorSidebar
          tenantName={tenant.name}
          userLabel={userLabel}
          logoUrl={logoUrl}
          notifications={notificationBell}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Desktop-only utility topbar: nav links + notifications + Taken */}
          <InstructorTopbar notifications={notificationBell} />

          <ServiceWorkerRegister />
          <InstallPromptBanner app="instructor" />

          <main className="flex-1 overflow-auto">
            <Suspense fallback={<InstructorSplash />}>{children}</Suspense>
          </main>
        </div>
      </div>
    </BrandProvider>
  );
}
