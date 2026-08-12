import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandProvider } from "@/components/brand-provider";
import { InstructorSidebar } from "@/components/instructor/Sidebar";
import { InstructorTopbar } from "@/components/instructor/InstructorTopbar";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "NXTDRIVE Instructeur - visuele test",
  robots: {
    index: false,
    follow: false,
  },
};

export default function InstructorVisualFixtureLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env["VISUAL_FIXTURES_ENABLED"] !== "true") {
    notFound();
  }

  const tenantName = "Rijschool Horizon";
  const userLabel = "Sanne de Vries";
  const liveCounts = {
    unreadMessages: 1,
    openTasks: 3,
  };
  const notifications = (
    <NotificationBell
      items={[
        {
          id: "fixture-notification-1",
          type: "lesson.reminder",
          title: "Les begint over 30 minuten",
          body: "Noah Jansen · 09:00",
          link: "/instructeur/agenda",
          relatedType: "lesson",
          relatedId: "lesson-1",
          readAt: null,
          createdAt: "2026-07-31T06:30:00.000Z",
        },
      ]}
      unreadCount={1}
      viewAllHref="/instructeur/meldingen"
    />
  );

  return (
    <BrandProvider tenant={null} branding={null} className="min-h-screen">
      <div
        data-instructor-shell=""
        className="flex h-dvh min-h-0 flex-col overflow-hidden text-foreground lg:flex-row"
      >
        <InstructorSidebar
          tenantName={tenantName}
          userLabel={userLabel}
          liveCounts={liveCounts}
          notifications={notifications}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <InstructorTopbar
            theme="light"
            userLabel={userLabel}
            unreadMessages={liveCounts.unreadMessages}
            notifications={notifications}
          />

          <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-transparent px-4 pb-[5.75rem] pt-4 sm:px-5 sm:pb-24 md:px-6 lg:px-8 lg:pb-8 lg:pt-6">
            <div className="mx-auto flex h-full min-h-0 w-full max-w-[96rem] flex-col">
              {children}
            </div>
          </main>
        </div>
      </div>
    </BrandProvider>
  );
}
