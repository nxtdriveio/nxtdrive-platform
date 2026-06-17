import Link from "next/link";
import { CalendarClock, Filter, Plus } from "lucide-react";

import {
  AGENDA_BACKOFFICE_READ_ROLES,
  requireAgendaAccessContext,
} from "@/lib/agenda/access";
import {
  AGENDA_APPOINTMENT_TYPES,
  APPOINTMENT_TYPE_LABEL,
} from "@/lib/agenda/types";
import { loadTenantInstructors } from "@/lib/availability/service";
import { listBranches } from "@/lib/branches/service";
import { loadVehicles } from "@/lib/lessons/context-data";
import { rolesGrantPermission } from "@/lib/permissions";
import {
  canManagePlanningQueueItem,
  getPlanningQueueSuggestions,
  loadPlanningQueueItems,
  PLANNING_QUEUE_PRIORITIES,
  PLANNING_QUEUE_STATUSES,
  type PlanningQueueListItem,
} from "@/lib/planning-queue";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  cancelQueueItemAction,
  savePlanningQueueItem,
  scheduleQueueItemAction,
  suggestQueueItemAction,
} from "./actions";

export const dynamic = "force-dynamic";

const QUEUE_APPOINTMENT_TYPES = [
  "lesson",
  "trial_lesson",
  ...AGENDA_APPOINTMENT_TYPES,
] as const;

const QUEUE_TYPE_LABEL: Record<string, string> = {
  lesson: "Rijles",
  trial_lesson: "Proefles",
  ...APPOINTMENT_TYPE_LABEL,
};

const PRIORITY_LABEL: Record<string, string> = {
  low: "Laag",
  normal: "Normaal",
  high: "Hoog",
  urgent: "Urgent",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  suggested: "Suggesties",
  scheduled: "Gepland",
  cancelled: "Geannuleerd",
};

const PRIORITY_VARIANT: Record<
  string,
  "default" | "warning" | "danger" | "outline"
> = {
  low: "outline",
  normal: "default",
  high: "warning",
  urgent: "danger",
};

type Option = { id: string; label: string };

function param(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
): string | null {
  const value = searchParams[key];
  return typeof value === "string" && value ? value : null;
}

function dateLabel(from: string | null, until: string | null): string {
  if (!from && !until) return "-";
  if (from && until) return `${from} t/m ${until}`;
  return from ? `Vanaf ${from}` : `Tot ${until}`;
}

function dateTimeLocal(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function CapabilityChecks({
  title,
  name,
  capabilities,
}: {
  title: string;
  name: string;
  capabilities: Option[];
}) {
  if (capabilities.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <Label>{title}</Label>
      <div className="grid max-h-36 gap-1 overflow-auto rounded-md border border-border p-2 text-sm">
        {capabilities.map((capability) => (
          <label key={capability.id} className="flex items-center gap-2">
            <input type="checkbox" name={name} value={capability.id} />
            <span>{capability.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function QueueItemCard({
  item,
  instructors,
  vehicles,
  suggestions,
  canManage,
}: {
  item: PlanningQueueListItem;
  instructors: Option[];
  vehicles: Option[];
  suggestions: Awaited<ReturnType<typeof getPlanningQueueSuggestions>> | null;
  canManage: boolean;
}) {
  const target = item.student_name ?? item.lead_name ?? "Geen koppeling";
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">
                {target}
              </h2>
              <Badge variant={PRIORITY_VARIANT[item.priority]}>
                {PRIORITY_LABEL[item.priority]}
              </Badge>
              <Badge
                variant={item.status === "scheduled" ? "success" : "outline"}
              >
                {STATUS_LABEL[item.status]}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {QUEUE_TYPE_LABEL[item.appointment_type]} ·{" "}
              {item.duration_minutes} min
              {item.required_transmission
                ? ` · ${item.required_transmission}`
                : ""}
            </p>
          </div>
          {item.scheduled_entity_id ? (
            <Badge variant="success">
              #{item.scheduled_entity_id.slice(0, 8)}
            </Badge>
          ) : null}
        </div>

        <div className="grid gap-3 text-sm sm:grid-cols-4">
          <Metric label="Vestiging" value={item.branch_name ?? "Organisatie"} />
          <Metric label="Rayon" value={item.service_area_name ?? "-"} />
          <Metric
            label="Periode"
            value={dateLabel(item.desired_date_from, item.desired_date_until)}
          />
          <Metric
            label="Voorkeur"
            value={item.preferred_instructor_name ?? "-"}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {item.required_capabilities.map((capabilityId) => (
            <Badge key={capabilityId} variant="warning">
              Instr. {capabilityId.slice(0, 8)}
            </Badge>
          ))}
          {item.required_vehicle_capability_ids.map((capabilityId) => (
            <Badge key={capabilityId} variant="warning">
              Voert. {capabilityId.slice(0, 8)}
            </Badge>
          ))}
        </div>

        {item.notes ? (
          <p className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            {item.notes}
          </p>
        ) : null}

        {suggestions && canManage ? (
          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="text-sm font-medium text-foreground">
              Top suggesties
            </p>
            {suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Geen passende suggesties gevonden binnen de zoekperiode.
              </p>
            ) : (
              suggestions.map((suggestion) => (
                <form
                  key={`${suggestion.candidate.instructorId}-${String(suggestion.candidate.startAt)}-${suggestion.candidate.vehicleId ?? "none"}`}
                  action={scheduleQueueItemAction}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <input type="hidden" name="queue_item_id" value={item.id} />
                  <input
                    type="hidden"
                    name="instructor_id"
                    value={suggestion.candidate.instructorId}
                  />
                  <input
                    type="hidden"
                    name="vehicle_id"
                    value={suggestion.candidate.vehicleId ?? ""}
                  />
                  <input
                    type="hidden"
                    name="starts_at"
                    value={dateTimeLocal(suggestion.candidate.startAt)}
                  />
                  <span>
                    {dateTimeLocal(suggestion.candidate.startAt).replace(
                      "T",
                      " ",
                    )}
                    {" · "}
                    score {suggestion.score}
                  </span>
                  <Button type="submit" size="sm">
                    Plannen
                  </Button>
                </form>
              ))
            )}
          </div>
        ) : null}

        {canManage &&
        (item.status === "open" || item.status === "suggested") ? (
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <form
              action={scheduleQueueItemAction}
              className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_minmax(0,1fr)_auto]"
            >
              <input type="hidden" name="queue_item_id" value={item.id} />
              <Select
                name="instructor_id"
                required
                defaultValue={item.preferred_instructor_id ?? ""}
              >
                <option value="" disabled>
                  Instructeur
                </option>
                {instructors.map((instructor) => (
                  <option key={instructor.id} value={instructor.id}>
                    {instructor.label}
                  </option>
                ))}
              </Select>
              <Input name="starts_at" type="datetime-local" required />
              <Select name="vehicle_id" defaultValue="">
                <option value="">Geen voertuig</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.label}
                  </option>
                ))}
              </Select>
              <Button type="submit" size="sm">
                Handmatig plannen
              </Button>
            </form>
            <div className="flex gap-2">
              <form action={suggestQueueItemAction}>
                <input type="hidden" name="queue_item_id" value={item.id} />
                <Button type="submit" size="sm" variant="secondary">
                  Suggesties
                </Button>
              </form>
              <form action={cancelQueueItemAction}>
                <input type="hidden" name="queue_item_id" value={item.id} />
                <Button type="submit" size="sm" variant="ghost">
                  Annuleren
                </Button>
              </form>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

export default async function PlanningQueuePage({
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
  const { organization: tenant } = context;
  const branchFilterIds =
    branchScope.scope_type === "branches" ? branchScope.branch_ids : null;
  const filters = {
    branchId: param(sp, "branch"),
    appointmentType: param(sp, "type"),
    priority: param(sp, "priority"),
    status: param(sp, "status") ?? "open",
    serviceAreaId: param(sp, "rayon"),
    transmission: param(sp, "transmission"),
  };

  const [
    allBranches,
    serviceAreasRes,
    studentsRes,
    leadsRes,
    capabilitiesRes,
    instructorsRaw,
    vehiclesRaw,
    items,
  ] = await Promise.all([
    listBranches(service, tenant.id, { activeOnly: true }),
    service
      .from("service_areas")
      .select("id, name, branch_id")
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .order("name", { ascending: true }),
    service
      .from("students")
      .select("id, full_name, branch_id")
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .order("full_name", { ascending: true })
      .limit(100),
    service
      .from("leads")
      .select("id, full_name, branch_id")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false })
      .limit(100),
    service
      .from("capability_definitions")
      .select("id, label, applies_to, active")
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .order("label", { ascending: true }),
    loadTenantInstructors(tenant.id, { branchIds: branchFilterIds }),
    loadVehicles(service, tenant.id, {
      branchIds: branchFilterIds,
      includeShared: true,
      activeOnly: true,
    }),
    loadPlanningQueueItems(service, context, branchScope, filters),
  ]);

  if (serviceAreasRes.error)
    throw new Error(`Rayons laden mislukt: ${serviceAreasRes.error.message}`);
  if (studentsRes.error)
    throw new Error(`Leerlingen laden mislukt: ${studentsRes.error.message}`);
  if (leadsRes.error)
    throw new Error(`Leads laden mislukt: ${leadsRes.error.message}`);
  if (capabilitiesRes.error)
    throw new Error(
      `Eigenschappen laden mislukt: ${capabilitiesRes.error.message}`,
    );

  const branches =
    branchScope.scope_type === "branches"
      ? allBranches.filter((branch) =>
          branchScope.branch_ids.includes(branch.id),
        )
      : allBranches;
  const canManageQueueItems =
    Boolean(context.user.profile?.is_platform_admin) ||
    rolesGrantPermission(context.roles, "planning:manage");
  const canCreateOrganizationWide = branchScope.scope_type === "all";
  const defaultCreateBranchId = canCreateOrganizationWide
    ? ""
    : (branches[0]?.id ?? "");
  const serviceAreas = (
    (serviceAreasRes.data ?? []) as {
      id: string;
      name: string;
      branch_id: string | null;
    }[]
  ).filter(
    (area) =>
      branchScope.scope_type === "all" ||
      !area.branch_id ||
      branchScope.branch_ids.includes(area.branch_id),
  );
  const students = (
    (studentsRes.data ?? []) as {
      id: string;
      full_name: string;
      branch_id: string | null;
    }[]
  ).filter(
    (student) =>
      branchScope.scope_type === "all" ||
      (student.branch_id && branchScope.branch_ids.includes(student.branch_id)),
  );
  const leads = (
    (leadsRes.data ?? []) as {
      id: string;
      full_name: string;
      branch_id: string | null;
    }[]
  ).filter(
    (lead) =>
      branchScope.scope_type === "all" ||
      (lead.branch_id && branchScope.branch_ids.includes(lead.branch_id)),
  );
  const capabilities = (capabilitiesRes.data ?? []) as {
    id: string;
    label: string;
    applies_to: string;
    active: boolean;
  }[];
  const instructorCapabilities = capabilities
    .filter((capability) => capability.applies_to === "instructor")
    .map((capability) => ({ id: capability.id, label: capability.label }));
  const vehicleCapabilities = capabilities
    .filter((capability) => capability.applies_to === "vehicle")
    .map((capability) => ({ id: capability.id, label: capability.label }));
  const instructors = instructorsRaw.map((instructor) => ({
    id: instructor.id,
    label: instructor.full_name,
  }));
  const vehicles = vehiclesRaw.map((vehicle) => ({
    id: vehicle.id,
    label: vehicle.license_plate ?? vehicle.label,
  }));

  const suggestedId = param(sp, "suggest");
  const suggestions =
    suggestedId &&
    canManageQueueItems &&
    items.some((item) => item.id === suggestedId)
      ? await getPlanningQueueSuggestions(
          service,
          context,
          branchScope,
          suggestedId,
        )
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Planning queue
          </h1>
          <p className="text-sm text-muted-foreground">
            Openstaande planbare items met planning-core preview en suggesties.
          </p>
        </div>
        <Link
          href="/backoffice/agenda"
          className={buttonVariants({ variant: "secondary" })}
        >
          <CalendarClock className="h-4 w-4" aria-hidden />
          Agenda
        </Link>
      </div>

      {sp.error ? (
        <Card className="border-danger/40 bg-danger/5 p-4 text-sm text-danger">
          {decodeURIComponent(String(sp.error))}
        </Card>
      ) : null}
      {sp.scheduled ? (
        <Card className="border-success/40 bg-success/5 p-4 text-sm text-success">
          Queue item is gepland.
        </Card>
      ) : null}

      <Card>
        <CardContent className="pt-6">
          <form className="grid gap-3 md:grid-cols-6">
            <Select name="branch" defaultValue={filters.branchId ?? ""}>
              <option value="">Alle vestigingen</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
            <Select name="type" defaultValue={filters.appointmentType ?? ""}>
              <option value="">Alle types</option>
              {QUEUE_APPOINTMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {QUEUE_TYPE_LABEL[type]}
                </option>
              ))}
            </Select>
            <Select name="priority" defaultValue={filters.priority ?? ""}>
              <option value="">Alle prioriteiten</option>
              {PLANNING_QUEUE_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_LABEL[priority]}
                </option>
              ))}
            </Select>
            <Select name="rayon" defaultValue={filters.serviceAreaId ?? ""}>
              <option value="">Alle rayons</option>
              {serviceAreas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </Select>
            <Select name="status" defaultValue={filters.status ?? ""}>
              <option value="">Alle statussen</option>
              {PLANNING_QUEUE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABEL[status]}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="secondary">
              <Filter className="h-4 w-4" aria-hidden />
              Filter
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-4">
          {items.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                Geen queue items voor deze filters.
              </CardContent>
            </Card>
          ) : (
            items.map((item) => (
              <QueueItemCard
                key={item.id}
                item={item}
                instructors={instructors}
                vehicles={vehicles}
                suggestions={item.id === suggestedId ? suggestions : null}
                canManage={
                  canManageQueueItems &&
                  canManagePlanningQueueItem(context, branchScope, item)
                }
              />
            ))
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4" aria-hidden />
              Nieuw queue item
            </CardTitle>
          </CardHeader>
          <CardContent>
            {canManageQueueItems ? (
              <form action={savePlanningQueueItem} className="space-y-3">
                <input
                  type="hidden"
                  name="redirect_to"
                  value="/backoffice/planning-queue"
                />
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select name="appointment_type" defaultValue="exam">
                    {QUEUE_APPOINTMENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {QUEUE_TYPE_LABEL[type]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="space-y-1.5">
                    <Label>Vestiging</Label>
                    <Select
                      name="branch_id"
                      defaultValue={defaultCreateBranchId}
                    >
                      {canCreateOrganizationWide ? (
                        <option value="">Organisatiebreed</option>
                      ) : null}
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Prioriteit</Label>
                    <Select name="priority" defaultValue="normal">
                      {PLANNING_QUEUE_PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>
                          {PRIORITY_LABEL[priority]}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="space-y-1.5">
                    <Label>Leerling</Label>
                    <Select name="student_id" defaultValue="">
                      <option value="">Geen leerling</option>
                      {students.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.full_name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Lead</Label>
                    <Select name="lead_id" defaultValue="">
                      <option value="">Geen lead</option>
                      {leads.map((lead) => (
                        <option key={lead.id} value={lead.id}>
                          {lead.full_name}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="space-y-1.5">
                    <Label>Duur</Label>
                    <Input
                      name="duration_minutes"
                      type="number"
                      min={15}
                      max={720}
                      defaultValue={60}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Transmissie</Label>
                    <Select name="required_transmission" defaultValue="">
                      <option value="">Geen eis</option>
                      <option value="schakel">Schakel</option>
                      <option value="automaat">Automaat</option>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Voorkeursinstructeur</Label>
                  <Select name="preferred_instructor_id" defaultValue="">
                    <option value="">Geen voorkeur</option>
                    {instructors.map((instructor) => (
                      <option key={instructor.id} value={instructor.id}>
                        {instructor.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Rayon</Label>
                  <Select name="pickup_service_area_id" defaultValue="">
                    <option value="">Geen rayon</option>
                    {serviceAreas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Ophaaladres</Label>
                  <Input
                    name="pickup_address_id"
                    placeholder="Adres of referentie"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="space-y-1.5">
                    <Label>Vanaf</Label>
                    <Input name="desired_date_from" type="date" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tot</Label>
                    <Input name="desired_date_until" type="date" />
                  </div>
                </div>
                <CapabilityChecks
                  title="Verplichte instructeur-eigenschappen"
                  name="required_capability_ids"
                  capabilities={instructorCapabilities}
                />
                <CapabilityChecks
                  title="Verplichte voertuig-eigenschappen"
                  name="required_vehicle_capability_ids"
                  capabilities={vehicleCapabilities}
                />
                <div className="space-y-1.5">
                  <Label>Notities</Label>
                  <Textarea name="notes" rows={3} />
                </div>
                <Button type="submit" className="w-full">
                  Toevoegen
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                Je hebt alleen leestoegang tot de planning queue.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
