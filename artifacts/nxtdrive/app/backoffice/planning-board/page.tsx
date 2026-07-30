import Link from "next/link";
import { Filter } from "lucide-react";

import {
  AGENDA_BACKOFFICE_READ_ROLES,
  requireAgendaAccessContext,
} from "@/lib/agenda/access";
import {
  AGENDA_APPOINTMENT_TYPES,
  APPOINTMENT_TYPE_SHORT,
} from "@/lib/agenda/types";
import { resolveTenantTimeZone, zonedYmd } from "@/lib/datetime";
import {
  loadPlanningBoardData,
  type PlanningBoardPerspective,
  type PlanningBoardView,
} from "@/lib/planning-board";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  AdminPage,
  AdminSectionHeader,
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

function viewParam(value: string | null): PlanningBoardView {
  return value === "week" ? "week" : "day";
}

function perspectiveParam(value: string | null): PlanningBoardPerspective {
  if (
    value === "branch" ||
    value === "vehicle" ||
    value === "exam" ||
    value === "trial_lesson"
  ) {
    return value;
  }
  return "instructor";
}

function PlanboardFilterForm({
  filters,
  data,
}: {
  filters: Awaited<ReturnType<typeof loadPlanningBoardData>>["filters"] & {
    status: string | null;
  };
  data: Awaited<ReturnType<typeof loadPlanningBoardData>>;
}) {
  return (
    <form className="space-y-2.5">
      <div className="space-y-1">
        <Label>Datum</Label>
        <Input
          name="date"
          type="date"
          defaultValue={filters.date}
          className="h-8"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label>Weergave</Label>
          <Select name="view" defaultValue={filters.view} className="h-8">
            <option value="day">Dag</option>
            <option value="week">Week</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Perspectief</Label>
          <Select
            name="perspective"
            defaultValue={filters.perspective ?? "instructor"}
            className="h-8"
          >
            <option value="instructor">Instructeur</option>
            <option value="branch">Vestiging</option>
            <option value="vehicle">Voertuig</option>
            <option value="exam">Examen</option>
            <option value="trial_lesson">Proefles</option>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label>Vestiging</Label>
        <Select
          name="branch"
          defaultValue={filters.branchId ?? ""}
          className="h-8"
        >
          <option value="all">Alle vestigingen</option>
          {data.branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Instructeur</Label>
        <Select
          name="instructor"
          defaultValue={filters.instructorId ?? ""}
          className="h-8"
        >
          <option value="">Alle instructeurs</option>
          {data.instructors.map((instructor) => (
            <option key={instructor.id} value={instructor.id}>
              {instructor.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label>Status</Label>
          <Select
            name="status"
            defaultValue={filters.status ?? "all"}
            className="h-8"
          >
            <option value="open">Open</option>
            <option value="suggested">Suggesties</option>
            <option value="all">Alle</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Type</Label>
          <Select
            name="appointment_type"
            defaultValue={filters.appointmentType ?? ""}
            className="h-8"
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
      </div>
      <details className="rounded-xl border border-border bg-[var(--surface-2)]">
        <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-foreground">
          Geavanceerd
        </summary>
        <div className="space-y-3 border-t border-border p-3">
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
            <Select name="capability" defaultValue={filters.capabilityId ?? ""}>
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
            Alleen conflicten
          </label>
        </div>
      </details>
      <div className="grid grid-cols-[auto_1fr] gap-2 pt-1">
        <Link
          href="/backoffice/planning-board"
          className="inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Wissen
        </Link>
        <Button type="submit" className="h-8">
          <Filter className="h-3.5 w-3.5" aria-hidden />
          Toepassen
        </Button>
      </div>
    </form>
  );
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
  const timeZone = resolveTenantTimeZone(context.organization);
  const status = rawParam(sp, "status");
  const filters = {
    date: param(sp, "date") ?? zonedYmd(new Date(), timeZone),
    view: viewParam(param(sp, "view")),
    perspective: perspectiveParam(param(sp, "perspective")),
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
    <AdminPage className="gap-3">
      <AdminSectionHeader
        title="Planboard"
        description="Sleep afspraken naar een instructeur en tijdslot; controles blijven automatisch actief."
      />

      <PlanningBoardWorkspace
        data={data}
        filterForm={<PlanboardFilterForm filters={filters} data={data} />}
      />
    </AdminPage>
  );
}
