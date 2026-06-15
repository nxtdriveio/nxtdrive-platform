import {
  loadOrganizationBranchScope,
  requireOrganizationPermission,
} from "@/lib/organization";
import { rolesGrantPermission } from "@/lib/permissions";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BranchScopeBadge,
  BranchScopeSummary,
  ReadOnlyScopeNotice,
} from "@/components/backoffice/branch-scope-ui";
import { listBranches, type Branch } from "@/lib/branches/service";
import { loadVehicles, loadLocations } from "@/lib/lessons/context-data";
import { loadTenantInstructors } from "@/lib/availability/service";
import {
  VEHICLE_TRANSMISSIONS,
  VEHICLE_TRANSMISSION_LABEL,
  type Vehicle,
} from "@/lib/lessons/types";
import {
  createVehicle,
  updateVehicle,
  toggleVehicleActive,
  setVehicleStatus,
  assignVehicleBranch,
  addOdometerEntry,
  saveDamageReport,
  saveMaintenanceEvent,
  createLocation,
  toggleLocationActive,
  assignLocationBranch,
} from "./actions";

export const dynamic = "force-dynamic";

const VEHICLE_TYPES = ["car", "motorcycle", "trailer", "other"] as const;
const VEHICLE_TYPE_LABEL: Record<
  (typeof VEHICLE_TYPES)[number] | "scooter",
  string
> = {
  car: "Auto",
  motorcycle: "Motor",
  trailer: "Aanhanger",
  scooter: "Scooter",
  other: "Overig",
};

const VEHICLE_STATUSES = [
  "active",
  "inactive",
  "maintenance",
  "damaged",
  "sold",
] as const;
const VEHICLE_STATUS_LABEL: Record<(typeof VEHICLE_STATUSES)[number], string> =
  {
    active: "Actief",
    inactive: "Inactief",
    maintenance: "Onderhoud",
    damaged: "Schade",
    sold: "Verkocht",
  };
const VEHICLE_STATUS_VARIANT: Record<
  (typeof VEHICLE_STATUSES)[number],
  "success" | "warning" | "danger" | "default"
> = {
  active: "success",
  inactive: "warning",
  maintenance: "warning",
  damaged: "danger",
  sold: "default",
};

type VehicleOdometerEntry = {
  id: string;
  vehicle_id: string;
  instructor_id: string | null;
  appointment_id: string | null;
  reading_km: number;
  entry_type: string;
  recorded_at: string;
  notes: string | null;
};

type VehicleDamageReport = {
  id: string;
  vehicle_id: string;
  severity: string;
  status: string;
  occurred_at: string | null;
  description: string;
  blocks_planning: boolean;
  created_at: string;
};

type VehicleMaintenanceEvent = {
  id: string;
  vehicle_id: string;
  type: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  odometer_km: number | null;
  blocks_planning: boolean;
  notes: string | null;
};

type InstructorOption = { id: string; full_name: string | null };

function dateLabel(value: string | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function dateTimeLabel(value: string | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function warningLabels(
  vehicle: Vehicle,
  damageReports: readonly VehicleDamageReport[],
  maintenanceEvents: readonly VehicleMaintenanceEvent[],
  odometerEntries: readonly VehicleOdometerEntry[],
): string[] {
  const warnings: string[] = [];
  const now = new Date();
  if (vehicle.apk_expires_at) {
    const apk = new Date(`${vehicle.apk_expires_at}T00:00:00Z`);
    const days = Math.ceil((apk.getTime() - now.getTime()) / 86400000);
    if (days < 0) warnings.push("APK verlopen");
    else if (days <= 30) warnings.push("APK bijna verlopen");
  }
  if (
    damageReports.some(
      (d) => d.status !== "repaired" && d.status !== "archived",
    )
  ) {
    warnings.push("Open schade");
  }
  if (
    maintenanceEvents.some((event) => {
      if (event.status !== "planned" || !event.starts_at) return false;
      const days = Math.ceil(
        (new Date(event.starts_at).getTime() - now.getTime()) / 86400000,
      );
      return days >= 0 && days <= 30;
    })
  ) {
    warnings.push("Onderhoud gepland");
  }
  if (odometerEntries.length === 0 && vehicle.current_odometer_km === null) {
    warnings.push("KM onbekend");
  }
  return warnings;
}

export default async function VoertuigenPage() {
  const context = await requireOrganizationPermission("vehicle:read");
  const { organization: tenant } = context;
  const service = createServiceRoleClient();
  const branchScope = await loadOrganizationBranchScope(service, context);
  const branchFilterIds =
    branchScope.scope_type === "branches" ? branchScope.branch_ids : null;
  const canManageAssets =
    context.user.profile?.is_platform_admin ||
    rolesGrantPermission(context.roles, "vehicle:manage");

  const [vehicles, locations, allBranches, instructors] = await Promise.all([
    loadVehicles(service, tenant.id, {
      branchIds: branchFilterIds,
      includeShared: true,
    }),
    loadLocations(service, tenant.id, {
      branchIds: branchFilterIds,
      includeShared: true,
    }),
    listBranches(service, tenant.id, { activeOnly: true }),
    loadTenantInstructors(tenant.id, { branchIds: branchFilterIds }),
  ]);
  const branches =
    branchScope.scope_type === "branches"
      ? allBranches.filter((b) => branchScope.branch_ids.includes(b.id))
      : allBranches;
  const branchesById = new Map(branches.map((b) => [b.id, b.name]));
  const instructorsById = new Map(
    instructors.map((i) => [i.id, i.full_name ?? "Instructeur"]),
  );
  const vehicleIds = vehicles.map((vehicle) => vehicle.id);
  const [odometerRes, damageRes, maintenanceRes, appointmentRes] =
    vehicleIds.length > 0
      ? await Promise.all([
          service
            .from("vehicle_odometer_entries")
            .select(
              "id, vehicle_id, instructor_id, appointment_id, reading_km, entry_type, recorded_at, notes",
            )
            .eq("tenant_id", tenant.id)
            .in("vehicle_id", vehicleIds)
            .order("recorded_at", { ascending: false }),
          service
            .from("vehicle_damage_reports")
            .select(
              "id, vehicle_id, severity, status, occurred_at, description, blocks_planning, created_at",
            )
            .eq("tenant_id", tenant.id)
            .in("vehicle_id", vehicleIds)
            .order("created_at", { ascending: false }),
          service
            .from("vehicle_maintenance_events")
            .select(
              "id, vehicle_id, type, status, starts_at, ends_at, odometer_km, blocks_planning, notes",
            )
            .eq("tenant_id", tenant.id)
            .in("vehicle_id", vehicleIds)
            .order("starts_at", { ascending: false, nullsFirst: false }),
          service
            .from("agenda_appointments")
            .select("vehicle_id, starts_at, ends_at, title, type")
            .eq("tenant_id", tenant.id)
            .in("vehicle_id", vehicleIds)
            .eq("status", "planned")
            .gte("starts_at", new Date().toISOString())
            .order("starts_at", { ascending: true })
            .limit(20),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
        ];
  if (odometerRes.error)
    throw new Error(
      `Kilometerstanden laden mislukt: ${odometerRes.error.message}`,
    );
  if (damageRes.error)
    throw new Error(`Schades laden mislukt: ${damageRes.error.message}`);
  if (maintenanceRes.error)
    throw new Error(`Onderhoud laden mislukt: ${maintenanceRes.error.message}`);
  if (appointmentRes.error)
    throw new Error(
      `Planning-context laden mislukt: ${appointmentRes.error.message}`,
    );

  const odometerByVehicle = new Map<string, VehicleOdometerEntry[]>();
  for (const row of (odometerRes.data ?? []) as VehicleOdometerEntry[]) {
    odometerByVehicle.set(row.vehicle_id, [
      ...(odometerByVehicle.get(row.vehicle_id) ?? []),
      row,
    ]);
  }
  const damageByVehicle = new Map<string, VehicleDamageReport[]>();
  for (const row of (damageRes.data ?? []) as VehicleDamageReport[]) {
    damageByVehicle.set(row.vehicle_id, [
      ...(damageByVehicle.get(row.vehicle_id) ?? []),
      row,
    ]);
  }
  const maintenanceByVehicle = new Map<string, VehicleMaintenanceEvent[]>();
  for (const row of (maintenanceRes.data ?? []) as VehicleMaintenanceEvent[]) {
    maintenanceByVehicle.set(row.vehicle_id, [
      ...(maintenanceByVehicle.get(row.vehicle_id) ?? []),
      row,
    ]);
  }
  const appointmentsByVehicle = new Map<
    string,
    {
      vehicle_id: string;
      starts_at: string;
      ends_at: string;
      title: string | null;
      type: string;
    }[]
  >();
  for (const row of (appointmentRes.data ?? []) as {
    vehicle_id: string;
    starts_at: string;
    ends_at: string;
    title: string | null;
    type: string;
  }[]) {
    appointmentsByVehicle.set(row.vehicle_id, [
      ...(appointmentsByVehicle.get(row.vehicle_id) ?? []),
      row,
    ]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Voertuigen &amp; locaties
        </h1>
        <p className="text-sm text-muted-foreground">
          Beheer de lesvoertuigen en ophaal-/vertreklocaties van je rijschool.
        </p>
      </div>

      <BranchScopeSummary
        scope={branchScope}
        branchCount={branches.length}
        sharedRowsLabel="Gedeelde voertuigen en locaties blijven zichtbaar."
      />
      {!canManageAssets ? (
        <ReadOnlyScopeNotice description="Je kunt voertuigen en locaties bekijken binnen je vestigingsscope, maar aanmaken, koppelen en activeren is voorbehouden aan beheerders." />
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        <div className={canManageAssets ? "xl:col-span-3" : "xl:col-span-4"}>
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Voertuigen</CardTitle>
            </CardHeader>
            {vehicles.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Geen voertuigen binnen deze vestigingsscope.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {vehicles.map((v) => {
                  const odometer = odometerByVehicle.get(v.id) ?? [];
                  const damage = damageByVehicle.get(v.id) ?? [];
                  const maintenance = maintenanceByVehicle.get(v.id) ?? [];
                  const appointments = appointmentsByVehicle.get(v.id) ?? [];
                  const warnings = warningLabels(
                    v,
                    damage,
                    maintenance,
                    odometer,
                  );
                  return (
                    <div key={v.id} className="p-4">
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-base font-semibold text-foreground">
                              {v.license_plate ?? v.label}
                            </h2>
                            <Badge variant={VEHICLE_STATUS_VARIANT[v.status]}>
                              {VEHICLE_STATUS_LABEL[v.status]}
                            </Badge>
                            <BranchScopeBadge
                              branchId={v.branch_id}
                              branchesById={branchesById}
                            />
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {[v.brand, v.model].filter(Boolean).join(" ") ||
                              v.label}
                            {" · "}
                            {v.transmission
                              ? VEHICLE_TRANSMISSION_LABEL[v.transmission]
                              : "-"}
                            {" · "}
                            {VEHICLE_TYPE_LABEL[v.vehicle_type]}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                          <Metric
                            label="APK"
                            value={dateLabel(v.apk_expires_at)}
                          />
                          <Metric
                            label="KM"
                            value={
                              v.current_odometer_km?.toLocaleString("nl-NL") ??
                              "-"
                            }
                          />
                          <Metric
                            label="Instructeur"
                            value={
                              v.default_instructor_id
                                ? (instructorsById.get(
                                    v.default_instructor_id,
                                  ) ?? "-")
                                : "-"
                            }
                          />
                          <Metric
                            label="Warnings"
                            value={
                              warnings.length ? String(warnings.length) : "0"
                            }
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {warnings.map((warning) => (
                          <Badge key={warning} variant="warning">
                            {warning}
                          </Badge>
                        ))}
                      </div>

                      <Tabs defaultValue="algemeen" className="mt-4">
                        <TabsList className="max-w-3xl rounded-md">
                          <TabsTrigger value="algemeen">Algemeen</TabsTrigger>
                          <TabsTrigger value="kilometers">
                            Kilometers
                          </TabsTrigger>
                          <TabsTrigger value="schades">Schades</TabsTrigger>
                          <TabsTrigger value="onderhoud">
                            Onderhoud/APK
                          </TabsTrigger>
                          <TabsTrigger value="planning">Planning</TabsTrigger>
                        </TabsList>
                        <TabsContent value="algemeen">
                          <VehicleGeneralTab
                            vehicle={v}
                            branches={branches}
                            branchesById={branchesById}
                            instructors={instructors}
                            canManageAssets={canManageAssets}
                          />
                        </TabsContent>
                        <TabsContent value="kilometers">
                          <OdometerTab
                            vehicle={v}
                            entries={odometer}
                            instructors={instructors}
                            canManageAssets={canManageAssets}
                          />
                        </TabsContent>
                        <TabsContent value="schades">
                          <DamageTab
                            vehicle={v}
                            reports={damage}
                            canManageAssets={canManageAssets}
                          />
                        </TabsContent>
                        <TabsContent value="onderhoud">
                          <MaintenanceTab
                            vehicle={v}
                            events={maintenance}
                            canManageAssets={canManageAssets}
                          />
                        </TabsContent>
                        <TabsContent value="planning">
                          <PlanningContextTab appointments={appointments} />
                        </TabsContent>
                      </Tabs>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {canManageAssets ? (
          <Card>
            <CardHeader>
              <CardTitle>Nieuw voertuig</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createVehicle} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="v-label">Naam</Label>
                  <Input
                    id="v-label"
                    name="label"
                    required
                    placeholder="bv. VW Golf 1"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="v-brand">Merk</Label>
                    <Input id="v-brand" name="brand" placeholder="Volkswagen" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="v-model">Model</Label>
                    <Input id="v-model" name="model" placeholder="Golf" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="v-plate">Kenteken (optioneel)</Label>
                  <Input
                    id="v-plate"
                    name="license_plate"
                    placeholder="00-XXX-0"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="v-transmission">Transmissie</Label>
                    <Select
                      id="v-transmission"
                      name="transmission"
                      defaultValue=""
                    >
                      <option value="">- Niet opgegeven -</option>
                      {VEHICLE_TRANSMISSIONS.map((t) => (
                        <option key={t} value={t}>
                          {VEHICLE_TRANSMISSION_LABEL[t]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="v-type">Type</Label>
                    <Select id="v-type" name="vehicle_type" defaultValue="car">
                      {VEHICLE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {VEHICLE_TYPE_LABEL[type]}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="v-status">Status</Label>
                    <Select id="v-status" name="status" defaultValue="active">
                      {VEHICLE_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {VEHICLE_STATUS_LABEL[status]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="v-branch">Vestiging</Label>
                    <Select id="v-branch" name="branch_id" defaultValue="">
                      <BranchOptions
                        currentBranchId={null}
                        branches={branches}
                        branchesById={branchesById}
                      />
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="v-instructor">Standaard instructeur</Label>
                  <Select
                    id="v-instructor"
                    name="default_instructor_id"
                    defaultValue=""
                  >
                    <option value="">- Geen -</option>
                    {instructors.map((instructor) => (
                      <option key={instructor.id} value={instructor.id}>
                        {instructor.full_name ?? "Instructeur"}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="v-apk">APK vervalt</Label>
                    <Input id="v-apk" name="apk_expires_at" type="date" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="v-insurance">Verzekering vervalt</Label>
                    <Input
                      id="v-insurance"
                      name="insurance_expires_at"
                      type="date"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="v-odometer">Kilometerstand</Label>
                  <Input
                    id="v-odometer"
                    name="current_odometer_km"
                    type="number"
                    min={0}
                  />
                </div>
                <Button type="submit" size="sm" className="w-full">
                  Voertuig aanmaken
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className={canManageAssets ? "lg:col-span-2" : "lg:col-span-3"}>
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Locaties</CardTitle>
            </CardHeader>
            {locations.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Geen locaties binnen deze vestigingsscope.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Naam</th>
                    <th className="px-4 py-3 font-medium">Vestiging</th>
                    <th className="px-4 py-3 font-medium">Adres</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    {canManageAssets ? (
                      <th className="px-4 py-3 text-right font-medium">
                        Acties
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {locations.map((l) => (
                    <tr key={l.id}>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {l.name}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <BranchScopeBadge
                          branchId={l.branch_id}
                          branchesById={branchesById}
                        />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {l.address ?? "-"}
                      </td>
                      <td className="px-4 py-3">
                        {l.active ? (
                          <Badge variant="success">Actief</Badge>
                        ) : (
                          <Badge variant="warning">Inactief</Badge>
                        )}
                      </td>
                      {canManageAssets ? (
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap justify-end gap-2">
                            <form
                              action={assignLocationBranch}
                              className="flex items-center gap-2"
                            >
                              <input
                                type="hidden"
                                name="location_id"
                                value={l.id}
                              />
                              <Select
                                name="branch_id"
                                defaultValue={l.branch_id ?? ""}
                                className="h-8 w-44 py-1 text-xs"
                                aria-label={`Vestiging voor ${l.name}`}
                              >
                                <BranchOptions
                                  currentBranchId={l.branch_id}
                                  branches={branches}
                                  branchesById={branchesById}
                                />
                              </Select>
                              <Button
                                type="submit"
                                variant="secondary"
                                size="sm"
                              >
                                Opslaan
                              </Button>
                            </form>
                            <form action={toggleLocationActive}>
                              <input
                                type="hidden"
                                name="location_id"
                                value={l.id}
                              />
                              <input
                                type="hidden"
                                name="active"
                                value={String(l.active)}
                              />
                              <Button type="submit" variant="ghost" size="sm">
                                {l.active ? "Deactiveren" : "Activeren"}
                              </Button>
                            </form>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        {canManageAssets ? (
          <Card>
            <CardHeader>
              <CardTitle>Nieuwe locatie</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createLocation} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="l-name">Naam</Label>
                  <Input
                    id="l-name"
                    name="name"
                    required
                    placeholder="bv. Station Centraal"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="l-address">Adres (optioneel)</Label>
                  <Input
                    id="l-address"
                    name="address"
                    placeholder="bv. Stationsplein 1"
                  />
                </div>
                <Button type="submit" size="sm" className="w-full">
                  Locatie aanmaken
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function BranchOptions({
  currentBranchId,
  branches,
  branchesById,
}: {
  currentBranchId: string | null;
  branches: Branch[];
  branchesById: Map<Branch["id"], Branch["name"]>;
}) {
  const hasCurrentBranch =
    !currentBranchId || branchesById.has(currentBranchId);

  return (
    <>
      <option value="">Alle vestigingen</option>
      {!hasCurrentBranch && currentBranchId ? (
        <option value={currentBranchId}>Huidige vestiging</option>
      ) : null}
      {branches.map((branch) => (
        <option key={branch.id} value={branch.id}>
          {branch.name}
        </option>
      ))}
    </>
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

function VehicleGeneralTab({
  vehicle,
  branches,
  branchesById,
  instructors,
  canManageAssets,
}: {
  vehicle: Vehicle;
  branches: Branch[];
  branchesById: Map<Branch["id"], Branch["name"]>;
  instructors: InstructorOption[];
  canManageAssets: boolean;
}) {
  if (!canManageAssets) {
    return (
      <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Kenteken" value={vehicle.license_plate ?? "-"} />
        <Metric
          label="Vestiging"
          value={
            vehicle.branch_id
              ? (branchesById.get(vehicle.branch_id) ?? "-")
              : "Alle vestigingen"
          }
        />
        <Metric
          label="Verzekering"
          value={dateLabel(vehicle.insurance_expires_at)}
        />
        <Metric label="Notities" value={vehicle.notes ?? "-"} />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <form action={updateVehicle} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="vehicle_id" value={vehicle.id} />
        <div className="space-y-1.5">
          <Label>Naam</Label>
          <Input name="label" defaultValue={vehicle.label} required />
        </div>
        <div className="space-y-1.5">
          <Label>Kenteken</Label>
          <Input
            name="license_plate"
            defaultValue={vehicle.license_plate ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Merk</Label>
          <Input name="brand" defaultValue={vehicle.brand ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label>Model</Label>
          <Input name="model" defaultValue={vehicle.model ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label>Transmissie</Label>
          <Select name="transmission" defaultValue={vehicle.transmission ?? ""}>
            <option value="">- Niet opgegeven -</option>
            {VEHICLE_TRANSMISSIONS.map((t) => (
              <option key={t} value={t}>
                {VEHICLE_TRANSMISSION_LABEL[t]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select name="vehicle_type" defaultValue={vehicle.vehicle_type}>
            {VEHICLE_TYPES.map((type) => (
              <option key={type} value={type}>
                {VEHICLE_TYPE_LABEL[type]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select name="status" defaultValue={vehicle.status}>
            {VEHICLE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {VEHICLE_STATUS_LABEL[status]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Vestiging</Label>
          <Select name="branch_id" defaultValue={vehicle.branch_id ?? ""}>
            <BranchOptions
              currentBranchId={vehicle.branch_id}
              branches={branches}
              branchesById={branchesById}
            />
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Standaard instructeur</Label>
          <Select
            name="default_instructor_id"
            defaultValue={vehicle.default_instructor_id ?? ""}
          >
            <option value="">- Geen -</option>
            {instructors.map((instructor) => (
              <option key={instructor.id} value={instructor.id}>
                {instructor.full_name ?? "Instructeur"}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Kilometerstand</Label>
          <Input
            name="current_odometer_km"
            type="number"
            min={0}
            defaultValue={vehicle.current_odometer_km ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label>APK vervalt</Label>
          <Input
            name="apk_expires_at"
            type="date"
            defaultValue={vehicle.apk_expires_at ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Verzekering vervalt</Label>
          <Input
            name="insurance_expires_at"
            type="date"
            defaultValue={vehicle.insurance_expires_at ?? ""}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Notities</Label>
          <Textarea name="notes" rows={3} defaultValue={vehicle.notes ?? ""} />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" size="sm">
            Wijzigingen opslaan
          </Button>
        </div>
      </form>

      <div className="space-y-3">
        <form action={assignVehicleBranch} className="space-y-2">
          <input type="hidden" name="vehicle_id" value={vehicle.id} />
          <Label>Vestiging koppelen</Label>
          <Select name="branch_id" defaultValue={vehicle.branch_id ?? ""}>
            <BranchOptions
              currentBranchId={vehicle.branch_id}
              branches={branches}
              branchesById={branchesById}
            />
          </Select>
          <Button type="submit" variant="secondary" size="sm">
            Koppelen
          </Button>
        </form>
        <form action={setVehicleStatus} className="space-y-2">
          <input type="hidden" name="vehicle_id" value={vehicle.id} />
          <Label>Status wijzigen</Label>
          <Select name="status" defaultValue={vehicle.status}>
            {VEHICLE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {VEHICLE_STATUS_LABEL[status]}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary" size="sm">
            Status opslaan
          </Button>
        </form>
        <form action={toggleVehicleActive}>
          <input type="hidden" name="vehicle_id" value={vehicle.id} />
          <input type="hidden" name="active" value={String(vehicle.active)} />
          <Button type="submit" variant="ghost" size="sm">
            {vehicle.active ? "Deactiveren" : "Activeren"}
          </Button>
        </form>
      </div>
    </div>
  );
}

function OdometerTab({
  vehicle,
  entries,
  instructors,
  canManageAssets,
}: {
  vehicle: Vehicle;
  entries: VehicleOdometerEntry[];
  instructors: InstructorOption[];
  canManageAssets: boolean;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-2">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nog geen kilometerregistratie.
          </p>
        ) : (
          entries.slice(0, 5).map((entry) => (
            <div
              key={entry.id}
              className="rounded-md border border-border p-3 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-foreground">
                  {entry.reading_km.toLocaleString("nl-NL")} km
                </span>
                <Badge variant="outline">{entry.entry_type}</Badge>
              </div>
              <p className="mt-1 text-muted-foreground">
                {dateTimeLabel(entry.recorded_at)}
              </p>
              {entry.notes ? (
                <p className="mt-1 text-muted-foreground">{entry.notes}</p>
              ) : null}
            </div>
          ))
        )}
      </div>
      {canManageAssets ? (
        <form
          action={addOdometerEntry}
          className="space-y-3 rounded-md border border-border p-3"
        >
          <input type="hidden" name="vehicle_id" value={vehicle.id} />
          <div className="space-y-1.5">
            <Label>Kilometerstand</Label>
            <Input name="reading_km" type="number" min={0} required />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select name="entry_type" defaultValue="manual">
              <option value="manual">Handmatig</option>
              <option value="lesson_start">Les start</option>
              <option value="lesson_end">Les einde</option>
              <option value="maintenance">Onderhoud</option>
              <option value="correction">Correctie</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Instructeur</Label>
            <Select name="instructor_id" defaultValue="">
              <option value="">- Geen -</option>
              {instructors.map((instructor) => (
                <option key={instructor.id} value={instructor.id}>
                  {instructor.full_name ?? "Instructeur"}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notities</Label>
            <Textarea name="notes" rows={3} />
          </div>
          <Button type="submit" size="sm">
            Kilometerstand toevoegen
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function DamageTab({
  vehicle,
  reports,
  canManageAssets,
}: {
  vehicle: Vehicle;
  reports: VehicleDamageReport[];
  canManageAssets: boolean;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-2">
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Geen schades geregistreerd.
          </p>
        ) : (
          reports.slice(0, 5).map((report) => (
            <div
              key={report.id}
              className="rounded-md border border-border p-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={report.blocks_planning ? "danger" : "warning"}>
                  {report.blocks_planning
                    ? "Blokkeert planning"
                    : "Waarschuwing"}
                </Badge>
                <Badge variant="outline">{report.severity}</Badge>
                <Badge variant="outline">{report.status}</Badge>
              </div>
              <p className="mt-2 text-foreground">{report.description}</p>
              <p className="mt-1 text-muted-foreground">
                {dateLabel(report.occurred_at ?? report.created_at)}
              </p>
            </div>
          ))
        )}
      </div>
      {canManageAssets ? (
        <form
          action={saveDamageReport}
          className="space-y-3 rounded-md border border-border p-3"
        >
          <input type="hidden" name="vehicle_id" value={vehicle.id} />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Ernst</Label>
              <Select name="severity" defaultValue="minor">
                <option value="minor">Licht</option>
                <option value="medium">Middel</option>
                <option value="severe">Ernstig</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select name="status" defaultValue="open">
                <option value="open">Open</option>
                <option value="in_review">In review</option>
                <option value="repaired">Gerepareerd</option>
                <option value="archived">Gearchiveerd</option>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Datum</Label>
            <Input name="occurred_at" type="datetime-local" />
          </div>
          <div className="space-y-1.5">
            <Label>Omschrijving</Label>
            <Textarea name="description" rows={3} required />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="blocks_planning" />
            Blokkeert planning
          </label>
          <Button type="submit" size="sm">
            Schade registreren
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function MaintenanceTab({
  vehicle,
  events,
  canManageAssets,
}: {
  vehicle: Vehicle;
  events: VehicleMaintenanceEvent[];
  canManageAssets: boolean;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-2">
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Geen onderhoud of APK-events.
          </p>
        ) : (
          events.slice(0, 5).map((event) => (
            <div
              key={event.id}
              className="rounded-md border border-border p-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={event.blocks_planning ? "danger" : "outline"}>
                  {event.blocks_planning
                    ? "Blokkeert planning"
                    : "Niet blokkerend"}
                </Badge>
                <Badge variant="outline">{event.type}</Badge>
                <Badge variant="outline">{event.status}</Badge>
              </div>
              <p className="mt-2 text-muted-foreground">
                {dateTimeLabel(event.starts_at)} -{" "}
                {dateTimeLabel(event.ends_at)}
              </p>
              {event.notes ? (
                <p className="mt-1 text-foreground">{event.notes}</p>
              ) : null}
            </div>
          ))
        )}
      </div>
      {canManageAssets ? (
        <form
          action={saveMaintenanceEvent}
          className="space-y-3 rounded-md border border-border p-3"
        >
          <input type="hidden" name="vehicle_id" value={vehicle.id} />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select name="type" defaultValue="service">
                <option value="apk">APK</option>
                <option value="service">Service</option>
                <option value="repair">Reparatie</option>
                <option value="tire_change">Bandenwissel</option>
                <option value="inspection">Inspectie</option>
                <option value="other">Overig</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select name="status" defaultValue="planned">
                <option value="planned">Gepland</option>
                <option value="completed">Afgerond</option>
                <option value="cancelled">Geannuleerd</option>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Start</Label>
            <Input name="starts_at" type="datetime-local" />
          </div>
          <div className="space-y-1.5">
            <Label>Einde</Label>
            <Input name="ends_at" type="datetime-local" />
          </div>
          <div className="space-y-1.5">
            <Label>Kilometerstand</Label>
            <Input name="odometer_km" type="number" min={0} />
          </div>
          <div className="space-y-1.5">
            <Label>Notities</Label>
            <Textarea name="notes" rows={3} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="blocks_planning" defaultChecked />
            Blokkeert planning
          </label>
          <Button type="submit" size="sm">
            Onderhoud registreren
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function PlanningContextTab({
  appointments,
}: {
  appointments: {
    starts_at: string;
    ends_at: string;
    title: string | null;
    type: string;
  }[];
}) {
  return (
    <div className="space-y-2">
      {appointments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Geen toekomstige afspraken met dit voertuig.
        </p>
      ) : (
        appointments.slice(0, 5).map((appointment) => (
          <div
            key={`${appointment.starts_at}-${appointment.type}`}
            className="rounded-md border border-border p-3 text-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-foreground">
                {appointment.title ?? appointment.type}
              </span>
              <Badge variant="outline">{appointment.type}</Badge>
            </div>
            <p className="mt-1 text-muted-foreground">
              {dateTimeLabel(appointment.starts_at)} -{" "}
              {dateTimeLabel(appointment.ends_at)}
            </p>
          </div>
        ))
      )}
    </div>
  );
}
