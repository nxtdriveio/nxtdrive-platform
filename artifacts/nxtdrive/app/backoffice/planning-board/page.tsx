import { CalendarDays, Filter } from "lucide-react";

import {
  AGENDA_BACKOFFICE_READ_ROLES,
  requireAgendaAccessContext,
} from "@/lib/agenda/access";
import {
  AGENDA_APPOINTMENT_TYPES,
  APPOINTMENT_TYPE_SHORT,
} from "@/lib/agenda/types";
import { amsterdamYmd } from "@/lib/datetime";
import { loadPlanningBoardData } from "@/lib/planning-board";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from "@/components/backoffice/admin-primitives";
import { PlanningBoardWorkspace } from "./planning-board-workspace";

export const dynamic = "force-dynamic";

function param(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
): string | null {
  const value = searchParams[key];
  return typeof value === "string" && value && value !== "all" ? value : null;
}

function rawParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
): string | null {
  const value = searchParams[key];
  return typeof value === "string" && value ? value : null;
}

function todayYmd(): string {
  return amsterdamYmd(new Date());
}

export default async function PlanningBoardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = searchParams ? await searchParams : {};
  const service = createServiceRoleClient();
  const { context, branchScope } = await requireAgendaAccessContext(
    service,
    AGENDA_BACKOFFICE_READ_ROLES,
  );
  const status = rawParam(sp, "status");
  const filters = {
    date: param(sp, "date") ?? todayYmd(),
    view: "day" as const,
    branchId: param(sp, "branch"),
    appointmentType: param(sp, "appointment_type"),
    serviceAreaId: param(sp, "rayon"),
    instructorId: param(sp, "instructor"),
    transmission: param(sp, "transmission"),
    capabilityId: param(sp, "capability"),
    vehicleId: param(sp, "vehicle"),
    availability:
      param(sp, "availability") === "available" ||
      param(sp, "availability") === "blocked"
        ? (param(sp, "availability") as "available" | "blocked")
        : null,
    conflictsOnly: param(sp, "conflicts") === "1",
    status: status === "all" ? null : (status ?? "open"),
  };
  const data = await loadPlanningBoardData(
    service,
    context,
    branchScope,
    filters,
  );

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Planning"
        title={
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="h-6 w-6" aria-hidden />
            Planboard
          </span>
        }
        description="Sleep queue-items naar een instructeur/tijdslot. De planning-core valideert beschikbaarheid, voertuig, rayon, overlap en rechten."
      />

      <AdminPanel
        title="Planner filters"
        info="Gebruik de basisfilters direct. Open geavanceerde filters alleen wanneer je gericht wilt zoeken op voertuig, rayon, capability of conflict."
        contentClassName="space-y-4"
      >
        <form className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-[12rem_minmax(10rem,1fr)_minmax(10rem,1fr)_12rem_auto]">
            <div className="space-y-1.5">
              <Label>Datum</Label>
              <Input name="date" type="date" defaultValue={filters.date} />
            </div>
            <div className="space-y-1.5">
              <Label>Vestiging</Label>
              <Select name="branch" defaultValue={filters.branchId ?? ""}>
                <option value="all">Alle vestigingen</option>
                {data.branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Instructeur</Label>
              <Select
                name="instructor"
                defaultValue={filters.instructorId ?? ""}
              >
                <option value="">Alle instructeurs</option>
                {data.instructors.map((instructor) => (
                  <option key={instructor.id} value={instructor.id}>
                    {instructor.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select name="status" defaultValue={filters.status ?? "all"}>
                <option value="open">Open</option>
                <option value="suggested">Suggesties</option>
                <option value="all">Alle</option>
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full">
                <Filter className="h-4 w-4" aria-hidden />
                Filter
              </Button>
            </div>
          </div>

          <details className="rounded-2xl border border-border bg-[var(--surface-2)]">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-foreground">
              Geavanceerde filters
            </summary>
            <div className="grid gap-3 border-t border-border p-4 md:grid-cols-3 xl:grid-cols-6">
              <div className="space-y-1.5">
                <Label>Afspraaktype</Label>
                <Select
                  name="appointment_type"
                  defaultValue={filters.appointmentType ?? ""}
                >
                  <option value="">Alle</option>
                  <option value="lesson">Rijles</option>
                  <option value="trial_lesson">Proefles</option>
                  {AGENDA_APPOINTMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {APPOINTMENT_TYPE_SHORT[type]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Rayon</Label>
                <Select name="rayon" defaultValue={filters.serviceAreaId ?? ""}>
                  <option value="">Alle</option>
                  {data.serviceAreas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Transmissie</Label>
                <Select
                  name="transmission"
                  defaultValue={filters.transmission ?? ""}
                >
                  <option value="">Alle</option>
                  <option value="schakel">Schakel</option>
                  <option value="automaat">Automaat</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Eigenschap</Label>
                <Select
                  name="capability"
                  defaultValue={filters.capabilityId ?? ""}
                >
                  <option value="">Alle</option>
                  {data.capabilities.map((capability) => (
                    <option key={capability.id} value={capability.id}>
                      {capability.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Voertuig</Label>
                <Select name="vehicle" defaultValue={filters.vehicleId ?? ""}>
                  <option value="">Alle</option>
                  {data.vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Beschikbaarheid</Label>
                <Select
                  name="availability"
                  defaultValue={filters.availability ?? ""}
                >
                  <option value="">Alle</option>
                  <option value="available">Beschikbaar</option>
                  <option value="blocked">Geblokkeerd</option>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  name="conflicts"
                  value="1"
                  defaultChecked={filters.conflictsOnly}
                />
                Alleen conflicten tonen
              </label>
            </div>
          </details>
        </form>
      </AdminPanel>

      <PlanningBoardWorkspace data={data} />
    </AdminPage>
  );
}
