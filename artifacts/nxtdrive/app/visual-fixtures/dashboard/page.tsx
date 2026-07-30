import { notFound } from "next/navigation";
import {
  AlertTriangle,
  CalendarDays,
  ClipboardList,
  Clock,
  Inbox,
  Receipt,
  Users,
} from "lucide-react";

import {
  AdminGrid,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  AdminTableRow,
} from "@/components/backoffice/admin-primitives";
import {
  DashboardCard,
  DashboardEmptyState,
} from "@/components/backoffice/dashboard-card";
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
          <AdminPage>
            <AdminPageHeader
              title="Dashboard"
              description="Operationeel overzicht van vandaag. Donderdag 30 juli."
            />

            <section
              aria-label="KPI-overzicht"
              className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 xl:grid-cols-6"
            >
              {kpis.map(([label, value, Icon, hint]) => (
                <StatCard
                  key={label}
                  label={label}
                  value={value}
                  icon={Icon}
                  trendHint={hint}
                  href="/visual-fixtures/dashboard"
                />
              ))}
            </section>

            <div className="grid min-w-0 gap-3 xl:auto-rows-[22rem] xl:grid-cols-12">
              <DashboardCard
                className="order-2 xl:col-span-6"
                title={
                  <>
                    <CalendarDays className="h-4 w-4 text-primary" />
                    Planning vandaag
                  </>
                }
                actionLabel="Agenda"
                actionHref="/visual-fixtures/dashboard"
              >
                <ul className="divide-y divide-border">
                  {[
                    ["08:30–10:00", "Mila Bakker", "Rijles"],
                    ["10:15–11:45", "Finn Smit", "Rijles"],
                    ["12:30–13:30", "Noah de Jong", "Proefles"],
                    ["14:00–15:30", "Sara Visser", "Rijles"],
                  ].map(([time, name, type]) => (
                    <li
                      key={`${time}-${name}`}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="w-24 text-xs font-semibold tabular-nums text-primary">
                          {time}
                        </span>
                        <span className="truncate text-sm font-medium">
                          {name}
                        </span>
                      </div>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        {type}
                      </span>
                    </li>
                  ))}
                </ul>
              </DashboardCard>

              <DashboardCard
                className="order-1 xl:col-span-6"
                title={
                  <>
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    Aandacht nodig
                  </>
                }
                actionLabel="Alle taken"
                actionHref="/visual-fixtures/dashboard"
              >
                <ul className="divide-y divide-border">
                  {[
                    ["Theoriecertificaat verloopt", "Mila Bakker"],
                    ["Factuur 31 dagen open", "Finn Smit"],
                    ["Proefles opvolgen", "Noah de Jong"],
                    ["Leskaart afronden", "Sara Visser"],
                  ].map(([title, person]) => (
                    <li key={title} className="flex items-center gap-2.5 py-2">
                      <span className="h-2 w-2 rounded-full bg-warning" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {person}
                      </span>
                    </li>
                  ))}
                </ul>
              </DashboardCard>
            </div>

            <AdminGrid columns="2">
              <AdminPanel
                title="Recente leerlingen"
                actionLabel="Alle leerlingen"
              >
                <AdminTable
                  columns={["Leerling", "Instructeur", "Tegoed", "Status"]}
                >
                  {[
                    ["Mila Bakker", "Brandon", "9 uur", "Actief"],
                    ["Finn Smit", "Danny", "6,5 uur", "Actief"],
                    ["Noah de Jong", "Lizzy", "12 uur", "Intake"],
                  ].map((row) => (
                    <AdminTableRow key={row[0]}>
                      {row.map((cell) => (
                        <td key={cell}>{cell}</td>
                      ))}
                    </AdminTableRow>
                  ))}
                </AdminTable>
              </AdminPanel>

              <AdminPanel title="Openstaande signalen">
                <DashboardEmptyState message="Geen kritieke signalen." />
              </AdminPanel>
            </AdminGrid>
          </AdminPage>
        </DashboardShell>
      </div>
    </BrandProvider>
  );
}
