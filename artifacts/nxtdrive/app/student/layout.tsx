import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { roleHomePath } from "@/lib/auth/role-home";
import { homePathForRoles } from "@/lib/auth/role-routing";
import { getTenantBranding, resolveLogoUrl } from "@/lib/branding";
import { BrandProvider } from "@/components/brand-provider";
import { StudentTopBar } from "@/components/student/TopBar";
import { StudentBottomNav } from "@/components/student/BottomNav";
import { StudentSidebarNav } from "@/components/student/SidebarNav";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { InstallPromptBanner } from "@/components/pwa/InstallPromptBanner";
import { StudentSplash } from "@/components/pwa/StudentSplash";
import { loadInAppNotifications } from "@/lib/notifications/in-app";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "NXTDRIVE Leerling",
  manifest: "/student/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Leerling",
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
  icons: { apple: "/icons/student-apple-180.png" },
};

export const viewport: Viewport = {
  themeColor: "#5A4BFF",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  maximumScale: 1,
};

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, tenant, roles } = await requireActiveTenant(["student", "parent"]);

  if (homePathForRoles(roles) !== "/student") {
    redirect(roleHomePath(user, tenant.id));
  }

  if (!roles.includes("student")) {
    redirect(roleHomePath(user, tenant.id));
  }

  const userLabel = user.profile?.full_name ?? user.email ?? "Leerling";
  const branding = await getTenantBranding(tenant.id);
  const logoUrl = resolveLogoUrl(tenant, branding);
  const { items, unreadCount } = await loadInAppNotifications(tenant.id);

  return (
    <BrandProvider
      tenant={tenant}
      branding={branding}
      className="flex min-h-screen flex-col overflow-x-hidden bg-background text-foreground"
    >
      <StudentTopBar
        tenantName={tenant.name}
        userLabel={userLabel}
        logoUrl={logoUrl}
        notifications={
          <NotificationBell
            items={items}
            unreadCount={unreadCount}
            variant="floating"
          />
        }
      />
      <ServiceWorkerRegister />
      <InstallPromptBanner app="student" />
      <div data-student-shell="" className="flex min-w-0 flex-1">
        <StudentSidebarNav />
        <main
          data-pwa-copy=""
          className="min-w-0 flex-1 overflow-x-hidden px-4 pb-28 pt-24 sm:px-6 sm:pb-28 sm:pt-28 xl:px-8 xl:pb-12"
        >
          <div className="mx-auto w-full max-w-[31rem] md:max-w-5xl xl:max-w-7xl">
            <Suspense fallback={<StudentSplash />}>{children}</Suspense>
          </div>
        </main>
      </div>
      <StudentBottomNav />
    </BrandProvider>
  );
}
