import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandProvider } from "@/components/brand-provider";
import { InstructorSidebar } from "@/components/instructor/Sidebar";
import { InstructorTopbar } from "@/components/instructor/InstructorTopbar";

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

  return (
    <BrandProvider
      tenant={null}
      branding={null}
      className="min-h-screen"
    >
      <div
        data-instructor-shell=""
        className="flex min-h-screen flex-col text-foreground lg:h-screen lg:flex-row lg:overflow-hidden"
      >
        <InstructorSidebar
          tenantName={tenantName}
          userLabel={userLabel}
          liveCounts={liveCounts}
          notifications={undefined}
        />

        <div className="flex min-w-0 flex-1 flex-col lg:min-h-0">
          <InstructorTopbar
            theme="light"
            userLabel={userLabel}
            unreadMessages={liveCounts.unreadMessages}
          />

          <main className="min-w-0 flex-1 overflow-x-hidden bg-transparent px-4 pb-[5.75rem] pt-4 sm:px-5 sm:pb-24 md:px-6 lg:min-h-0 lg:overflow-y-auto lg:px-8 lg:pb-8 lg:pt-6">
            <div className="mx-auto w-full max-w-[96rem] lg:flex lg:min-h-full lg:flex-col">
              {children}
            </div>
          </main>
        </div>
      </div>
    </BrandProvider>
  );
}
