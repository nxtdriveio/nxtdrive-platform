import { Suspense, cache } from "react";
import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { roleHomePath } from "@/lib/auth/role-home";
import { homePathForRoles } from "@/lib/auth/role-routing";
import { getTheme } from "@/lib/theme";
import {
  getTenantBrandingBundle,
  resolveBrandAppName,
  resolveBrandDescription,
  resolveLogoUrl,
  resolveThemeColorForMode,
} from "@/lib/branding";
import { BrandProvider } from "@/components/brand-provider";
import { InstructorSidebar } from "@/components/instructor/Sidebar";
import { InstructorTopbar } from "@/components/instructor/InstructorTopbar";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { InstallPromptBanner } from "@/components/pwa/InstallPromptBanner";
import { InstructorSplash } from "@/components/pwa/InstructorSplash";
import { loadInAppNotifications } from "@/lib/notifications/in-app";

export const dynamic = "force-dynamic";

const loadInstructorBrandingContext = cache(async () => {
  const { tenant } = await requireActiveTenant(["instructor", "tenant_admin"]);
  const bundle = await getTenantBrandingBundle(tenant.id);

  return {
    tenant,
    bundle,
    brandTitle: resolveBrandAppName(tenant, "instructor"),
    brandDescription: resolveBrandDescription(tenant, "instructor"),
  };
});

export async function generateMetadata(): Promise<Metadata> {
  const brandingContext = await loadInstructorBrandingContext();

  return {
    title: brandingContext.brandTitle,
    description: brandingContext.brandDescription,
    manifest: "/instructor/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: brandingContext.brandTitle,
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
    applicationName: brandingContext.brandTitle,
  };
}

export async function generateViewport(): Promise<Viewport> {
  const [brandingContext, theme] = await Promise.all([
    loadInstructorBrandingContext(),
    getTheme(),
  ]);

  return {
    themeColor: resolveThemeColorForMode(
      brandingContext.tenant,
      theme,
      brandingContext.bundle,
    "#f7f8fc",
    ),
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
  };
}

export default async function InstructorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, tenant, roles } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);
  const theme = await getTheme();

  if (homePathForRoles(roles) !== "/instructor") {
    redirect(roleHomePath(user, tenant.id));
  }

  const userLabel = user.profile?.full_name ?? user.email ?? "Instructeur";
  const bundle = await getTenantBrandingBundle(tenant.id);
  const logoUrl = resolveLogoUrl(tenant, bundle.branding);
  const { items, unreadCount } = await loadInAppNotifications(tenant.id);

  const notificationBell = (
    <NotificationBell
      items={items}
      unreadCount={unreadCount}
      viewAllHref="/instructor/meldingen"
    />
  );

  return (
    <BrandProvider
      tenant={tenant}
      branding={bundle.branding}
      themeTokens={bundle.tokens}
    >
      <div
        data-instructor-shell=""
        data-pwa-copy=""
        className="flex min-h-screen flex-col text-foreground xl:h-screen xl:overflow-hidden"
      >
        <InstructorSidebar
          tenantName={tenant.name}
          userLabel={userLabel}
          logoUrl={logoUrl}
        />

        <div className="flex min-w-0 flex-1 flex-col xl:min-h-0">
          <InstructorTopbar
            notifications={notificationBell}
            theme={theme}
            userLabel={userLabel}
          />
          <ServiceWorkerRegister />
          <InstallPromptBanner app="instructor" />

          <main className="min-w-0 flex-1 overflow-x-hidden bg-transparent px-4 pb-[5.75rem] pt-4 sm:px-5 sm:pb-24 md:px-6 xl:min-h-0 xl:overflow-y-auto xl:px-8 xl:pb-8 xl:pt-6">
            <div className="mx-auto w-full max-w-[96rem] xl:flex xl:min-h-full xl:flex-col">
              <Suspense fallback={<InstructorSplash />}>{children}</Suspense>
            </div>
          </main>
        </div>
      </div>
    </BrandProvider>
  );
}
