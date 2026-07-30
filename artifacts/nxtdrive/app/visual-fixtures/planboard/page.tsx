import { notFound } from "next/navigation";

import { PlanningBoardWorkspace } from "@/app/backoffice/planning-board/planning-board-workspace";
import { BrandProvider } from "@/components/brand-provider";
import { DashboardShell } from "@/components/backoffice/dashboard-shell";
import { BackofficeSidebar } from "@/components/backoffice/sidebar";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { PlanningBoardData } from "@/lib/planning-board/types";

const date = "2026-07-30";
const instructors = [
  ["brandon", "Brandon de Wit"],
  ["danny", "Danny Bakker"],
  ["danny-instr", "Danny Instructeur"],
  ["eric", "Eric van Dijk"],
  ["lizzy", "Lizzy de Boer"],
  ["nick", "Nick Pronk"],
  ["niet", "Niet toegewezen"],
  ["test", "Test Baas"],
].map(([id, name]) => ({ id, name }));

const data: PlanningBoardData = {
  tenantId: "visual-fixture",
  timeZone: "Europe/Amsterdam",
  filters: {
    date,
    view: "day",
    perspective: "instructor",
    status: "open",
  },
  rangeStart: "2026-07-29T22:00:00.000Z",
  rangeEnd: "2026-07-30T22:00:00.000Z",
  defaultVehicleId: null,
  days: [date],
  instructors,
  events: [
    {
      id: "lesson-one",
      entityType: "lesson",
      instructorId: "brandon",
      branchId: "utrecht",
      title: "Mila Bakker",
      subtitle: "Rijles",
      startsAt: "2026-07-30T06:30:00.000Z",
      endsAt: "2026-07-30T08:00:00.000Z",
      durationMinutes: 90,
      vehicleId: "golf",
      vehicleLabel: "Volkswagen Golf",
    },
    {
      id: "trial-one",
      entityType: "trial_lesson",
      instructorId: "danny",
      branchId: "utrecht",
      title: "Finn Smit",
      subtitle: "Proefles",
      startsAt: "2026-07-30T10:00:00.000Z",
      endsAt: "2026-07-30T11:00:00.000Z",
      durationMinutes: 60,
    },
  ],
  queueItems: [],
  availability: instructors.flatMap((instructor) => [
    {
      id: `${instructor.id}-available`,
      instructorId: instructor.id,
      date,
      weekday: null,
      startMinute: 8 * 60,
      endMinute: 17 * 60,
      kind: "available" as const,
    },
  ]),
  branches: [{ id: "utrecht", label: "Utrecht" }],
  serviceAreas: [{ id: "utrecht-centrum", label: "Utrecht centrum" }],
  vehicles: [{ id: "golf", label: "Volkswagen Golf" }],
  capabilities: [{ id: "ris", label: "RIS 2.0" }],
};

function FixtureFilters() {
  return (
    <form className="space-y-3">
      <div className="space-y-1">
        <Label>Datum</Label>
        <Input type="date" defaultValue={date} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label>Weergave</Label>
          <Select defaultValue="day">
            <option value="day">Dag</option>
            <option value="week">Week</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Perspectief</Label>
          <Select defaultValue="instructor">
            <option value="instructor">Instructeur</option>
          </Select>
        </div>
      </div>
    </form>
  );
}

export default function PlanboardVisualFixturePage() {
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
            <div className="flex h-full items-center justify-between gap-4 px-5">
              <div className="h-9 w-full max-w-xl rounded-full border border-border bg-[var(--surface-1)] px-4 text-sm leading-9 text-muted-foreground">
                Zoek leerling, afspraak, voertuig, bericht...
              </div>
              <span className="shrink-0 text-sm font-semibold">
                Test Rijschool
              </span>
            </div>
          }
        >
          <div className="flex flex-col gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Planboard
              </h1>
              <p className="text-sm text-muted-foreground">
                Compacte visuele fixture met uitsluitend synthetische data.
              </p>
            </div>
            <PlanningBoardWorkspace
              data={data}
              filterForm={<FixtureFilters />}
            />
          </div>
        </DashboardShell>
      </div>
    </BrandProvider>
  );
}
