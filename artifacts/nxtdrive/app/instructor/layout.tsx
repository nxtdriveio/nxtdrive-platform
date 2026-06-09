import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { roleHomePath } from "@/lib/auth/role-home";
import { homePathForRoles } from "@/lib/auth/role-routing";
import { getTheme } from "@/lib/theme";
import {
  getTenantBranding,
  resolveBrandAppName,
  resolveBrandDescription,
  resolveLogoUrl,
  resolveThemeColor,
} from "@/lib/branding";
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
import { loadAgendaAppointments } from "@/lib/agenda/appointments";
import type { Lesson } from "@/lib/lessons/types";
import { listMembershipOrganizationTeamIds } from "@/lib/organization/teams";

export const dynamic = "force-dynamic";

async function loadInstructorBrandingContext() {
  const { tenant } = await requireActiveTenant(["instructor", "tenant_admin"]);
  const branding = await getTenantBranding(tenant.id);

  return {
    tenant,
    branding,
    brandTitle: resolveBrandAppName(tenant, "instructor"),
    brandDescription: resolveBrandDescription(tenant, "instructor"),
    themeColor: resolveThemeColor(tenant, branding, "#0c0c15"),
  };
}

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
  const brandingContext = await loadInstructorBrandingContext();

  return {
    themeColor: brandingContext.themeColor,
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
  };
}

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
  const theme = await getTheme();

  if (homePathForRoles(roles) !== "/instructor") {
    redirect(roleHomePath(user, tenant.id));
  }

  const userLabel = user.profile?.full_name ?? user.email ?? "Instructeur";
  const visibleStartHour = user.profile?.calendar_start_hour ?? 6;
  const visibleEndHour = user.profile?.calendar_end_hour ?? 22;

  const branding = await getTenantBranding(tenant.id);
  const logoUrl = resolveLogoUrl(tenant, branding);
  const { items, unreadCount } = await loadInAppNotifications(tenant.id);

  const today = new Date();
  const dayStart = startOfDay(today);
  const dayEnd = endOfDay(today);

  const supabase = await createServerSupabaseClient();
  const activeMembership = user.memberships.find((membership) => membership.tenant_id === tenant.id) ?? null;
  const viewerTeamIds = activeMembership
    ? await listMembershipOrganizationTeamIds(supabase, tenant.id, activeMembership.id)
    : [];

  const { data: lessonsRaw } = await supabase
    .from("lessons")
    .select("*")
    .eq("tenant_id", tenant.id)
    .eq("instructor_id", user.id)
    .gte("starts_at", dayStart.toISOString())
    .lt("starts_at", dayEnd.toISOString())
    .order("starts_at", { ascending: true });
  const todayLessons = (lessonsRaw ?? []) as Lesson[];

  const todayTrials = await loadAgendaTrialLessons(supabase, {
    tenantId: tenant.id,
    from: dayStart,
    to: dayEnd,
    instructorId: user.id,
  });
  const todayAppointments = await loadAgendaAppointments(supabase, {
    tenantId: tenant.id,
    from: dayStart,
    to: dayEnd,
    viewerUserId: user.id,
    viewerTeamIds,
  });

  const studentIds = [...new Set(todayLessons.map((l) => l.student_id))];
  const { data: studentsRaw } = studentIds.length
    ? await supabase
        .from("students")
        .select("id, full_name")
        .in("id", studentIds)
    : { data: [] };
  const studentNames = new Map(
    ((studentsRaw ?? []) as { id: string; full_name: string }[]).map((s) => [
      s.id,
      s.full_name,
    ]),
  );

  const notificationBell = (
    <NotificationBell
      items={items}
      unreadCount={unreadCount}
      viewAllHref="/instructor/meldingen"
    />
  );

  return (
    <BrandProvider tenant={tenant} branding={branding}>
      <div
        data-instructor-shell=""
        data-pwa-copy=""
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
          appointments={todayAppointments}
          visibleStartHour={visibleStartHour}
          visibleEndHour={visibleEndHour}
          theme={theme}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <InstructorTopbar notifications={notificationBell} theme={theme} />
          <ServiceWorkerRegister />
          <InstallPromptBanner app="instructor" />

          <main className="min-w-0 flex-1 overflow-x-hidden bg-transparent px-4 pb-24 pt-6 sm:px-5 md:px-6 md:pb-10 lg:px-8">
            <div className="mx-auto w-full max-w-[100rem]">
              <Suspense fallback={<InstructorSplash />}>{children}</Suspense>
            </div>
          </main>
        </div>
      </div>
    </BrandProvider>
  );
}
