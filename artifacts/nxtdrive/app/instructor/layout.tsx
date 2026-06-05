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
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadAgendaTrialLessons } from "@/lib/trial-lessons/agenda";
import type { Lesson } from "@/lib/lessons/types";

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

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() + 1);
  return x;
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
  const userLabel = user.profile?.full_name ?? user.email ?? "Instructeur";
  const isAdmin = roles.includes("tenant_admin");

  const branding = await getTenantBranding(tenant.id);
  const logoUrl = resolveLogoUrl(tenant, branding);
  const { items, unreadCount } = await loadInAppNotifications(tenant.id);

  /* Load today's agenda for the sidebar agenda-rail */
  const today = new Date();
  const dayStart = startOfDay(today);
  const dayEnd = endOfDay(today);

  const supabase = await createServerSupabaseClient();

  let lessonQuery = supabase
    .from("lessons")
    .select("*")
    .eq("tenant_id", tenant.id)
    .gte("starts_at", dayStart.toISOString())
    .lt("starts_at", dayEnd.toISOString())
    .order("starts_at", { ascending: true });
  if (!isAdmin) lessonQuery = lessonQuery.eq("instructor_id", user.id);
  const { data: lessonsRaw } = await lessonQuery;
  const todayLessons = (lessonsRaw ?? []) as Lesson[];

  const todayTrials = await loadAgendaTrialLessons(supabase, {
    tenantId: tenant.id,
    from: dayStart,
    to: dayEnd,
    instructorId: isAdmin ? undefined : user.id,
  });

  const studentIds = [...new Set(todayLessons.map((l) => l.student_id))];
  const { data: studentsRaw } = studentIds.length
    ? await supabase
        .from("students")
        .select("id, full_name")
        .in("id", studentIds)
    : { data: [] };
  const studentNames = new Map(
    (
      (studentsRaw ?? []) as { id: string; full_name: string }[]
    ).map((s) => [s.id, s.full_name]),
  );

  const notificationBell = (
    <NotificationBell items={items} unreadCount={unreadCount} />
  );

  return (
    <BrandProvider tenant={tenant} branding={branding}>
      {/*
        data-instructor="" activates the dark+amber token block in globals.css
        for the entire instructor PWA shell — independent of tenant branding and
        the user's light/dark preference.
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
          todayLessons={todayLessons}
          studentNames={studentNames}
          todayDate={today}
          trialLessons={todayTrials}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Desktop-only utility topbar: secondary nav + notifications + Taken + Acties */}
          <InstructorTopbar notifications={notificationBell} />

          <ServiceWorkerRegister />
          <InstallPromptBanner app="instructor" />

          <main className="flex-1 overflow-auto bg-background pb-16 md:pb-0">
            <Suspense fallback={<InstructorSplash />}>{children}</Suspense>
          </main>
        </div>
      </div>
    </BrandProvider>
  );
}
