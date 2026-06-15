import {
  loadOrganizationBranchScope,
  requireOrganizationPermission,
} from "@/lib/organization";
import { listBranches, type Branch } from "@/lib/branches/service";
import { loadTenantInstructors } from "@/lib/availability/service";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  BranchScopeBadge,
  BranchScopeSummary,
} from "@/components/backoffice/branch-scope-ui";
import {
  deleteServiceAreaZone,
  saveInstructorServiceAreaAssignment,
  savePlanningSettings,
  saveServiceArea,
  saveServiceAreaZone,
  saveTravelMatrixEntry,
} from "./actions";

export const dynamic = "force-dynamic";

type PlanningSettingsRow = {
  rayon_policy: "hard_block" | "warning_only" | "ignore";
  default_travel_buffer_minutes: number;
  same_area_travel_minutes: number;
  different_area_travel_minutes: number;
};

type ServiceArea = {
  id: string;
  branch_id: string | null;
  name: string;
  description: string | null;
  active: boolean;
};

type ServiceAreaZone = {
  id: string;
  service_area_id: string;
  type: string;
  value: string;
};

type AreaAssignment = {
  id: string;
  instructor_id: string;
  service_area_id: string;
  priority: "primary" | "secondary";
};

type TravelMatrixEntry = {
  id: string;
  from_service_area_id: string;
  to_service_area_id: string;
  estimated_minutes: number;
};

const DEFAULT_SETTINGS: PlanningSettingsRow = {
  rayon_policy: "hard_block",
  default_travel_buffer_minutes: 15,
  same_area_travel_minutes: 10,
  different_area_travel_minutes: 30,
};

const RAYON_POLICY_LABEL = {
  hard_block: "Hard blokkeren",
  warning_only: "Waarschuwen",
  ignore: "Negeren",
};

const ZONE_TYPE_LABEL: Record<string, string> = {
  city: "Plaats",
  district: "Wijk",
  postcode_prefix: "Postcode",
  custom: "Vrij veld",
};

function branchOptions(branches: readonly Branch[]) {
  return (
    <>
      <option value="">Alle vestigingen</option>
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
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function groupBy<T extends Record<K, string>, K extends keyof T>(
  rows: readonly T[],
  key: K,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    map.set(row[key], [...(map.get(row[key]) ?? []), row]);
  }
  return map;
}

export default async function RayonsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = searchParams ? await searchParams : {};
  const context = await requireOrganizationPermission("planning:read");
  const { organization: tenant, roles, user } = context;
  const service = createServiceRoleClient();
  const [branchScope, allBranches] = await Promise.all([
    loadOrganizationBranchScope(service, context),
    listBranches(service, tenant.id, { activeOnly: true }),
  ]);
  const visibleBranches =
    branchScope.scope_type === "all"
      ? allBranches
      : allBranches.filter((branch) => branchScope.branch_ids.includes(branch.id));
  const branchIds =
    branchScope.scope_type === "branches" ? branchScope.branch_ids : null;
  const canManageOrganizationWidePlanning =
    Boolean(user.profile?.is_platform_admin) ||
    roles.includes("tenant_admin") ||
    roles.includes("franchise_admin");

  let areasQuery = service
    .from("service_areas")
    .select("id, branch_id, name, description, active")
    .eq("tenant_id", tenant.id)
    .order("name", { ascending: true });
  if (branchIds) {
    areasQuery = areasQuery.or(
      `branch_id.is.null,branch_id.in.(${branchIds.join(",")})`,
    );
  }

  const [settingsRes, areasRes, instructors, zonesRes, assignmentsRes, matrixRes] =
    await Promise.all([
      service
        .from("planning_settings")
        .select(
          "rayon_policy, default_travel_buffer_minutes, same_area_travel_minutes, different_area_travel_minutes",
        )
        .eq("tenant_id", tenant.id)
        .maybeSingle(),
      areasQuery,
      loadTenantInstructors(tenant.id, { branchIds }),
      service
        .from("service_area_zones")
        .select("id, service_area_id, type, value")
        .eq("tenant_id", tenant.id)
        .order("value", { ascending: true }),
      service
        .from("instructor_service_area_assignments")
        .select("id, instructor_id, service_area_id, priority")
        .eq("tenant_id", tenant.id),
      service
        .from("service_area_travel_matrix")
        .select("id, from_service_area_id, to_service_area_id, estimated_minutes")
        .eq("tenant_id", tenant.id)
        .order("estimated_minutes", { ascending: true }),
    ]);

  if (settingsRes.error)
    throw new Error(`Planninginstellingen laden mislukt: ${settingsRes.error.message}`);
  if (areasRes.error) throw new Error(`Rayons laden mislukt: ${areasRes.error.message}`);
  if (zonesRes.error) throw new Error(`Rayonzones laden mislukt: ${zonesRes.error.message}`);
  if (assignmentsRes.error)
    throw new Error(`Rayontoewijzingen laden mislukt: ${assignmentsRes.error.message}`);
  if (matrixRes.error)
    throw new Error(`Reistijdmatrix laden mislukt: ${matrixRes.error.message}`);

  const settings = (settingsRes.data as PlanningSettingsRow | null) ?? DEFAULT_SETTINGS;
  const areas = (areasRes.data ?? []) as ServiceArea[];
  const zonesByArea = groupBy((zonesRes.data ?? []) as ServiceAreaZone[], "service_area_id");
  const assignments = (assignmentsRes.data ?? []) as AreaAssignment[];
  const assignmentsByArea = groupBy(assignments, "service_area_id");
  const matrix = (matrixRes.data ?? []) as TravelMatrixEntry[];
  const branchesById = new Map(allBranches.map((branch) => [branch.id, branch.name]));
  const instructorsById = new Map(
    instructors.map((instructor) => [instructor.id, instructor.full_name]),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Rayons &amp; reistijden
        </h1>
        <p className="text-sm text-muted-foreground">
          Beheer servicegebieden, zones, instructeurdekking en fallback-reistijden.
        </p>
      </div>

      <BranchScopeSummary
        scope={branchScope}
        branchCount={visibleBranches.length}
        sharedRowsLabel="Gedeelde rayons blijven zichtbaar in de planning."
      />
      {sp.error === "forbidden" ? (
        <Card className="border-danger/40 bg-danger/5 p-4 text-sm text-danger">
          Je hebt geen rechten om organisatiebrede rayoninstellingen te wijzigen.
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>Rayons</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {areas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nog geen rayons ingericht.</p>
            ) : (
              <div className="divide-y divide-border">
                {areas.map((area) => (
                  <div key={area.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-semibold text-foreground">{area.name}</h2>
                          <Badge variant={area.active ? "success" : "outline"}>
                            {area.active ? "Actief" : "Inactief"}
                          </Badge>
                          <BranchScopeBadge
                            branchId={area.branch_id}
                            branchesById={branchesById}
                          />
                        </div>
                        {area.description ? (
                          <p className="text-sm text-muted-foreground">{area.description}</p>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          {(zonesByArea.get(area.id) ?? []).map((zone) => (
                            <form
                              key={zone.id}
                              action={deleteServiceAreaZone}
                              className="inline-flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs"
                            >
                              <input type="hidden" name="zone_id" value={zone.id} />
                              <span className="text-muted-foreground">
                                {ZONE_TYPE_LABEL[zone.type] ?? zone.type}
                              </span>
                              <span className="font-medium text-foreground">{zone.value}</span>
                              <button
                                type="submit"
                                className="text-muted-foreground hover:text-destructive"
                                aria-label="Zone verwijderen"
                              >
                                x
                              </button>
                            </form>
                          ))}
                        </div>
                        <div className="space-y-2 text-sm">
                          {(assignmentsByArea.get(area.id) ?? []).length === 0 ? (
                            <p className="text-muted-foreground">
                              Geen instructeurs gekoppeld.
                            </p>
                          ) : (
                            (assignmentsByArea.get(area.id) ?? []).map((assignment) => (
                              <div
                                key={assignment.id}
                                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                              >
                                <span className="text-foreground">
                                  {instructorsById.get(assignment.instructor_id) ??
                                    "Instructeur"}
                                </span>
                                <Badge variant="outline">
                                  {assignment.priority === "primary"
                                    ? "Primair"
                                    : "Secundair"}
                                </Badge>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <form action={saveServiceArea} className="space-y-2">
                          <input type="hidden" name="service_area_id" value={area.id} />
                          <Label>Naam</Label>
                          <Input name="name" defaultValue={area.name} required />
                          <Label>Vestiging</Label>
                          <Select name="branch_id" defaultValue={area.branch_id ?? ""}>
                            {branchOptions(visibleBranches)}
                          </Select>
                          <Label>Omschrijving</Label>
                          <Textarea
                            name="description"
                            rows={2}
                            defaultValue={area.description ?? ""}
                          />
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              name="active"
                              defaultChecked={area.active}
                            />
                            Actief
                          </label>
                          <Button type="submit" size="sm">
                            Rayon opslaan
                          </Button>
                        </form>
                        <form
                          action={saveServiceAreaZone}
                          className="grid gap-2 sm:grid-cols-[9rem_minmax(0,1fr)_auto]"
                        >
                          <input type="hidden" name="service_area_id" value={area.id} />
                          <Select name="type" defaultValue="city">
                            <option value="city">Plaats</option>
                            <option value="district">Wijk</option>
                            <option value="postcode_prefix">Postcode</option>
                            <option value="custom">Vrij veld</option>
                          </Select>
                          <Input name="value" placeholder="Waarde" required />
                          <Button type="submit" size="sm" variant="secondary">
                            Toevoegen
                          </Button>
                        </form>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Nieuw rayon</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={saveServiceArea} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Naam</Label>
                  <Input name="name" required placeholder="bv. Arnhem Noord" />
                </div>
                <div className="space-y-1.5">
                  <Label>Vestiging</Label>
                  <Select name="branch_id" defaultValue="">
                    {branchOptions(visibleBranches)}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Omschrijving</Label>
                  <Textarea name="description" rows={3} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="active" defaultChecked />
                  Actief
                </label>
                <Button type="submit" size="sm" className="w-full">
                  Rayon aanmaken
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Planningbeleid</CardTitle>
            </CardHeader>
            <CardContent>
              {canManageOrganizationWidePlanning ? (
                <form action={savePlanningSettings} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Rayonbeleid</Label>
                    <Select
                      name="rayon_policy"
                      defaultValue={settings.rayon_policy}
                    >
                      {Object.entries(RAYON_POLICY_LABEL).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
                    <div className="space-y-1.5">
                      <Label>Standaard buffer</Label>
                      <Input
                        name="default_travel_buffer_minutes"
                        type="number"
                        min={0}
                        max={240}
                        defaultValue={settings.default_travel_buffer_minutes}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Zelfde rayon</Label>
                      <Input
                        name="same_area_travel_minutes"
                        type="number"
                        min={0}
                        max={240}
                        defaultValue={settings.same_area_travel_minutes}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Ander rayon</Label>
                      <Input
                        name="different_area_travel_minutes"
                        type="number"
                        min={0}
                        max={240}
                        defaultValue={settings.different_area_travel_minutes}
                      />
                    </div>
                  </div>
                  <Button type="submit" size="sm" className="w-full">
                    Beleid opslaan
                  </Button>
                </form>
              ) : (
                <div className="space-y-3 text-sm">
                  <div className="rounded-md border border-border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Rayonbeleid</p>
                    <p className="font-medium text-foreground">
                      {RAYON_POLICY_LABEL[settings.rayon_policy]}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Metric
                      label="Standaard"
                      value={`${settings.default_travel_buffer_minutes} min`}
                    />
                    <Metric
                      label="Zelfde"
                      value={`${settings.same_area_travel_minutes} min`}
                    />
                    <Metric
                      label="Ander"
                      value={`${settings.different_area_travel_minutes} min`}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Alleen tenant- en franchisebeheerders kunnen dit
                    organisatiebrede beleid wijzigen.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Instructeur-rayon koppelen</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={saveInstructorServiceAreaAssignment}
              className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9rem_auto]"
            >
              <Select name="instructor_id" required defaultValue="">
                <option value="" disabled>
                  Instructeur
                </option>
                {instructors.map((instructor) => (
                  <option key={instructor.id} value={instructor.id}>
                    {instructor.full_name}
                  </option>
                ))}
              </Select>
              <Select name="service_area_id" required defaultValue="">
                <option value="" disabled>
                  Rayon
                </option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </Select>
              <Select name="priority" defaultValue="primary">
                <option value="primary">Primair</option>
                <option value="secondary">Secundair</option>
              </Select>
              <div className="flex items-center gap-2">
                <input type="hidden" name="enabled" value="true" />
                <Button type="submit" size="sm">
                  Koppelen
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reistijdmatrix</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {canManageOrganizationWidePlanning ? (
              <form
                action={saveTravelMatrixEntry}
                className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem_auto]"
              >
                <Select name="from_service_area_id" required defaultValue="">
                  <option value="" disabled>
                    Van rayon
                  </option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </Select>
                <Select name="to_service_area_id" required defaultValue="">
                  <option value="" disabled>
                    Naar rayon
                  </option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </Select>
                <Input
                  name="estimated_minutes"
                  type="number"
                  min={0}
                  max={600}
                  placeholder="Min"
                  required
                />
                <Button type="submit" size="sm">
                  Opslaan
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                De reistijdmatrix is organisatiebreed en kan alleen door
                tenant- of franchisebeheerders worden gewijzigd.
              </p>
            )}
            {matrix.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Geen expliciete reistijden. De planning gebruikt fallback-buffers.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3">Van</th>
                      <th className="py-2 pr-3">Naar</th>
                      <th className="py-2 pr-3">Minuten</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {matrix.map((entry) => (
                      <tr key={entry.id}>
                        <td className="py-2 pr-3">
                          {areas.find((area) => area.id === entry.from_service_area_id)
                            ?.name ?? "-"}
                        </td>
                        <td className="py-2 pr-3">
                          {areas.find((area) => area.id === entry.to_service_area_id)
                            ?.name ?? "-"}
                        </td>
                        <td className="py-2 pr-3">{entry.estimated_minutes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
