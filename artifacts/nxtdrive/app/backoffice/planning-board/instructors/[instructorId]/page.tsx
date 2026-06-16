import Link from "next/link";
import { ArrowLeft, CalendarDays, Filter } from "lucide-react";

import {
  AGENDA_BACKOFFICE_READ_ROLES,
  requireAgendaAccessContext,
} from "@/lib/agenda/access";
import {
  AGENDA_APPOINTMENT_TYPES,
  APPOINTMENT_TYPE_SHORT,
} from "@/lib/agenda/types";
import { amsterdamYmd } from "@/lib/datetime";
import {
  loadPlanningBoardData,
  type PlanningBoardView,
} from "@/lib/planning-board";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PlanningBoardWorkspace } from "../../planning-board-workspace";

export const dynamic = "force-dynamic";

function param(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
): string | null {
  const value = searchParams[key];
  return typeof value === "string" && value && value !== "all" ? value : null;
}

function todayYmd(): string {
  return amsterdamYmd(new Date());
}

function viewParam(value: string | null): PlanningBoardView {
  return value === "week" ? "week" : "day";
}

export default async function InstructorPlanningBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ instructorId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ instructorId }, sp] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({}),
  ]);
  const service = createServiceRoleClient();
  const { context, branchScope } = await requireAgendaAccessContext(
    service,
    AGENDA_BACKOFFICE_READ_ROLES,
  );
  const filters = {
    date: param(sp, "date") ?? todayYmd(),
    view: viewParam(param(sp, "view")),
    branchId: param(sp, "branch"),
    appointmentType: param(sp, "appointment_type"),
    serviceAreaId: param(sp, "rayon"),
    instructorId,
    transmission: param(sp, "transmission"),
    capabilityId: param(sp, "capability"),
    vehicleId: param(sp, "vehicle"),
    availability:
      param(sp, "availability") === "available" ||
      param(sp, "availability") === "blocked"
        ? (param(sp, "availability") as "available" | "blocked")
        : null,
    conflictsOnly: param(sp, "conflicts") === "1",
    status:
      param(sp, "status") === "all" ? null : (param(sp, "status") ?? "open"),
  };
  const data = await loadPlanningBoardData(
    service,
    context,
    branchScope,
    filters,
  );
  const instructor = data.instructors[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={`/backoffice/planning-board?date=${filters.date}&view=${filters.view}`}
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Planning board
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
            <CalendarDays className="h-6 w-6" aria-hidden />
            {instructor?.name ?? "Instructeur"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Detailplanning met meer ruimte voor afspraakdetails, rayon,
            voertuig, duur, status en waarschuwingen.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
            <div className="space-y-1.5">
              <Label>Datum</Label>
              <Input name="date" type="date" defaultValue={filters.date} />
            </div>
            <div className="space-y-1.5">
              <Label>View</Label>
              <Select name="view" defaultValue={filters.view}>
                <option value="day">Dag</option>
                <option value="week">Week</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Vestiging</Label>
              <Select name="branch" defaultValue={filters.branchId ?? ""}>
                <option value="">Alle</option>
                {data.branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.label}
                  </option>
                ))}
              </Select>
            </div>
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
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select name="status" defaultValue={filters.status ?? "all"}>
                <option value="open">Open</option>
                <option value="suggested">Suggesties</option>
                <option value="">Alle</option>
              </Select>
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                name="conflicts"
                value="1"
                defaultChecked={filters.conflictsOnly}
              />
              Alleen conflicten
            </label>
            <div className="flex items-end">
              <Button type="submit" className="w-full">
                <Filter className="h-4 w-4" aria-hidden />
                Filter
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <PlanningBoardWorkspace data={data} detailMode />
    </div>
  );
}
