import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { getTenantBranding, resolveLogoUrl } from "@/lib/branding";
import { BrandProvider } from "@/components/brand-provider";
import { InstructorSidebar } from "@/components/instructor/Sidebar";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { InstallPromptBanner } from "@/components/pwa/InstallPromptBanner";
import { InstructorSplash } from "@/components/pwa/InstructorSplash";
import { loadInAppNotifications } from "@/lib/notifications/in-app";

export const dynamic = "force-dynamic";

// Per-app PWA metadata (Task #177): the Instructeur app links its OWN manifest
// + apple-touch-icon, so installs (incl. Google Play TWA) use the instructor
// branding and landscape orientation. Overrides root manifest/themeColor for
// everything under /instructor.
export const metadata: Metadata = {
  title: "NXTDRIVE Instructeur",
  manifest: "/instructor/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Instructeur",
    // iOS launch-splash images (see student layout for the rationale). Solid
    // navy (#0F172A) SVGs keep the brand experience without per-device PNGs.
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
  themeColor: "#0F172A",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function InstructorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Role gate (Task #177): only instructors and tenant_admins reach the
  // Instructeur PWA. `requireActiveTenant` redirects anyone without one of
  // these roles to their own role home, and every lesson/student query below is
  // additionally tenant- and (for non-admins) instructor-scoped server-side, so
  // a TWA wrapper cannot widen access by spoofing the client.
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
      className="flex min-h-screen flex-col bg-background text-foreground md:flex-row"
    >
      <InstructorSidebar
        tenantName={tenant.name}
        userLabel={userLabel}
        logoUrl={logoUrl}
        notifications={
          <NotificationBell items={items} unreadCount={unreadCount} />
        }
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <ServiceWorkerRegister />
        <InstallPromptBanner app="instructor" />
        <main className="flex-1 px-3 py-4 sm:px-6 sm:py-6">
          <Suspense fallback={<InstructorSplash />}>{children}</Suspense>
        </main>
      </div>
    </BrandProvider>
  );
}
