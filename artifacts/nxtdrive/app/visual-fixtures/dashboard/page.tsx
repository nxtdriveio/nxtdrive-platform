import { notFound } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  Clock,
  Inbox,
  Receipt,
  Users,
} from "lucide-react";

import {
  AdminPage,
  AdminPageHeader,
} from "@/components/backoffice/admin-primitives";
import { DashboardSection } from "@/components/backoffice/dashboard-section";
import { DashboardShell } from "@/components/backoffice/dashboard-shell";
import { BackofficeSidebar } from "@/components/backoffice/sidebar";
import { StatCard } from "@/components/backoffice/stat-card";
import { BackofficeTopbar } from "@/components/backoffice/topbar";
import { BrandProvider } from "@/components/brand-provider";

const kpis = [
  ["Rijlessen vandaag", "12", Clock, "gepland vandaag"],
  ["Actieve leerlingen", "148", Users, "actieve dossiers"],
  ["Open taken", "7", ClipboardList, "openstaand"],
  ["Open facturen", "€ 4.280", Receipt, "11 openstaand"],
  ["Nieuwe leads", "9", Inbox, "in opvolging"],
  ["Examens deze week", "6", CalendarDays, "3 proeflessen"],
] as const;

const fixtureNow = "2026-07-30T08:00:00.000Z";

export default function DashboardVisualFixturePage() {
  if (process.env["VISUAL_FIXTURES_ENABLED"] !== "true") {
    notFound();
  }

  return (
    <BrandProvider tenant={null} branding={null} className="h-screen">
      <div data-management-shell="" className="h-screen overflow-hidden">
        <DashboardShell
          sidebar={
            <BackofficeSidebar
              tenantName="Test Rijschool"
              isAdmin
              hasFranchise
              hasMultiBranch
              planLabel="Elite"
            />
          }
          topbar={
            <BackofficeTopbar
              userLabel="Test Beheerder"
              roleLabel="Beheerder"
              tenantName="Test Rijschool"
              theme="light"
            />
          }
        >
          <AdminPage className="gap-3">
            <AdminPageHeader
              title="Dashboard"
              description="Operationeel overzicht van vandaag. Donderdag 30 juli."
            />

            <section
              aria-label="KPI-overzicht"
              className="grid auto-rows-[6.25rem] grid-cols-2 gap-2.5 lg:grid-cols-3 xl:grid-cols-6"
            >
              {kpis.map(([label, value, Icon, hint]) => (
                <StatCard
                  key={label}
                  label={label}
                  value={value}
                  icon={Icon}
                  trendHint={hint}
                  href="/visual-fixtures/dashboard"
                  className="h-full"
                />
              ))}
            </section>

            <DashboardSection
              tenantId="00000000-0000-4000-8000-000000000001"
              timeZone="Europe/Amsterdam"
              initial={{
                todayLessons: [
                  {
                    id: "lesson-1",
                    studentId: "student-1",
                    startsAt: "2026-07-30T06:30:00.000Z",
                    endsAt: "2026-07-30T08:00:00.000Z",
                    status: "scheduled",
                    studentName: "Mila Bakker",
                  },
                  {
                    id: "lesson-2",
                    studentId: "student-2",
                    startsAt: "2026-07-30T08:15:00.000Z",
                    endsAt: "2026-07-30T09:45:00.000Z",
                    status: "scheduled",
                    studentName: "Finn Smit",
                  },
                  {
                    id: "lesson-3",
                    studentId: "student-3",
                    startsAt: "2026-07-30T12:00:00.000Z",
                    endsAt: "2026-07-30T13:30:00.000Z",
                    status: "scheduled",
                    studentName: "Sara Visser",
                  },
                ],
                upcomingTrials: [
                  {
                    id: "trial-1",
                    startsAt: "2026-07-31T08:00:00.000Z",
                    status: "confirmed",
                    leadName: "Noah de Jong",
                  },
                  {
                    id: "trial-2",
                    startsAt: "2026-08-01T11:30:00.000Z",
                    status: "scheduled",
                    leadName: "Yara Vos",
                  },
                ],
                openTasks: [
                  {
                    id: "task-1",
                    title: "Leskaart afronden",
                    priority: "medium",
                    taskType: "Les",
                  },
                  {
                    id: "task-2",
                    title: "Proefles opvolgen",
                    priority: "high",
                    taskType: "Lead",
                  },
                ],
                smartAlerts: [
                  {
                    id: "alert-1",
                    type: "overdue_invoice",
                    title: "Factuur 31 dagen open",
                    description: "Finn Smit · € 420",
                    severity: "high",
                    timeAgo: "vandaag",
                    href: "/visual-fixtures/dashboard",
                  },
                ],
                weekPlanning: [
                  { day: "ma", label: "ma", planned: 12 },
                  { day: "di", label: "di", planned: 16 },
                  { day: "wo", label: "wo", planned: 14 },
                  { day: "do", label: "do", planned: 18 },
                  { day: "vr", label: "vr", planned: 15 },
                  { day: "za", label: "za", planned: 8 },
                  { day: "zo", label: "zo", planned: 3 },
                ],
                todayCapacity: {
                  scheduledMinutes: 810,
                  availableMinutes: 1080,
                  utilizationPercent: 75,
                },
                fetchedAt: fixtureNow,
              }}
              monthlyRevenue={[
                { month: "2026-02", label: "feb", cents: 2420000 },
                { month: "2026-03", label: "mrt", cents: 2680000 },
                { month: "2026-04", label: "apr", cents: 2510000 },
                { month: "2026-05", label: "mei", cents: 2940000 },
                { month: "2026-06", label: "jun", cents: 3210000 },
                { month: "2026-07", label: "jul", cents: 3380000 },
              ]}
              studentProgress={[
                {
                  studentId: "student-1",
                  name: "Mila Bakker",
                  initials: "MB",
                  completedLessons: 18,
                  plannedLessons: 6,
                },
                {
                  studentId: "student-2",
                  name: "Finn Smit",
                  initials: "FS",
                  completedLessons: 12,
                  plannedLessons: 8,
                },
                {
                  studentId: "student-3",
                  name: "Sara Visser",
                  initials: "SV",
                  completedLessons: 9,
                  plannedLessons: 10,
                },
              ]}
              leadPipeline={{
                new: 9,
                contacted: 6,
                package_advised: 4,
                converted: 3,
                dropped: 1,
              }}
            />
          </AdminPage>
        </DashboardShell>
      </div>
    </BrandProvider>
  );
}
