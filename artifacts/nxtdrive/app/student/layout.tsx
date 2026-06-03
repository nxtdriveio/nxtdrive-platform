import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { roleHomePath } from "@/lib/auth/role-home";
import { getTenantBranding, resolveLogoUrl } from "@/lib/branding";
import { BrandProvider } from "@/components/brand-provider";
import { StudentTopBar } from "@/components/student/TopBar";
import { StudentBottomNav } from "@/components/student/BottomNav";
import { StudentSidebarNav } from "@/components/student/SidebarNav";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { StudentSplash } from "@/components/pwa/StudentSplash";
import { loadInAppNotifications } from "@/lib/notifications/in-app";

export const dynamic = "force-dynamic";

// Per-app PWA metadata (Task #177): the Leerling app links its OWN manifest
// (not the generic /manifest.webmanifest) and apple-touch-icon, so installs on
// iOS/Android use the student branding + portrait orientation. Overrides the
// root layout's manifest/themeColor for everything under /student.
export const metadata: Metadata = {
  title: "NXTDRIVE Leerling",
  manifest: "/student/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Leerling",
  },
  icons: { apple: "/icons/student-apple-180.png" },
};

export const viewport: Viewport = { themeColor: "#0F172A" };

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Parents are admitted alongside students so a student+parent dual-role user
  // keeps using the student PWA for their OWN student data. RLS on students /
  // lessons / credit_ledger restricts a parent to rows linked via
  // `student_guardians`, so they cannot see other tenant data here.
  const { user, tenant, roles } = await requireActiveTenant([
    "student",
    "parent",
  ]);

  // The student PWA is NOT governed by the tenant's per-section parent-portal
  // visibility toggles, so a non-student must never render it directly — that
  // would let a parent bypass a section the tenant disabled in /ouder. Anyone
  // admitted here without the student role (a pure parent, or a parent who also
  // holds a staff role) is redirected to their proper role home (a pure parent
  // → /ouder). A student or student+parent dual-role user stays.
  if (!roles.includes("student")) redirect(roleHomePath(user, tenant.id));

  // Only students (incl. student+parent) reach here.
  const userLabel = user.profile?.full_name ?? user.email ?? "Leerling";

  const branding = await getTenantBranding(tenant.id);
  const logoUrl = resolveLogoUrl(tenant.white_label_enabled, branding);
  const { items, unreadCount } = await loadInAppNotifications(tenant.id);

  return (
    <BrandProvider
      tenant={tenant}
      branding={branding}
      className="flex min-h-screen flex-col bg-background text-foreground"
    >
      <StudentTopBar
        tenantName={tenant.name}
        userLabel={userLabel}
        logoUrl={logoUrl}
        notifications={
          <NotificationBell items={items} unreadCount={unreadCount} />
        }
      />
      <ServiceWorkerRegister />
      <div className="flex flex-1">
        <StudentSidebarNav />
        <main className="flex-1 px-3 py-4 pb-20 sm:px-6 sm:py-6 lg:pb-8">
          <div className="mx-auto max-w-2xl lg:max-w-5xl">
            <Suspense fallback={<StudentSplash />}>{children}</Suspense>
          </div>
        </main>
      </div>
      <StudentBottomNav />
    </BrandProvider>
  );
}
