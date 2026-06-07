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
import { Badge } from "@/components/ui/badge";
import { listBranches, type Branch } from "@/lib/branches/service";
import { loadVehicles, loadLocations } from "@/lib/lessons/context-data";
import {
  VEHICLE_TRANSMISSIONS,
  VEHICLE_TRANSMISSION_LABEL,
} from "@/lib/lessons/types";
import {
  createVehicle,
  toggleVehicleActive,
  createLocation,
  toggleLocationActive,
} from "./actions";

export const dynamic = "force-dynamic";

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

  const [vehicles, locations, allBranches] = await Promise.all([
    loadVehicles(service, tenant.id, {
      branchIds: branchFilterIds,
      includeShared: true,
    }),
    loadLocations(service, tenant.id, {
      branchIds: branchFilterIds,
      includeShared: true,
    }),
    listBranches(service, tenant.id, { activeOnly: true }),
  ]);
  const branches =
    branchScope.scope_type === "branches"
      ? allBranches.filter((b) => branchScope.branch_ids.includes(b.id))
      : allBranches;
  const branchesById = new Map(branches.map((b) => [b.id, b.name]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Voertuigen &amp; locaties
        </h1>
        <p className="text-sm text-muted-foreground">
          Beheer de lesvoertuigen en ophaal-/vertreklocaties van je rijschool.
        </p>
        {branchScope.scope_type === "branches" ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Je ziet gedeelde assets en assets van je toegestane vestigingen.
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className={canManageAssets ? "lg:col-span-2" : "lg:col-span-3"}>
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Voertuigen</CardTitle>
            </CardHeader>
            {vehicles.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Nog geen voertuigen binnen je vestigingsscope.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Naam</th>
                    <th className="px-4 py-3 font-medium">Vestiging</th>
                    <th className="px-4 py-3 font-medium">Kenteken</th>
                    <th className="px-4 py-3 font-medium">Transmissie</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    {canManageAssets ? <th className="px-4 py-3" /> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {vehicles.map((v) => (
                    <tr key={v.id}>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {v.label}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {branchLabel(v.branch_id, branchesById)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {v.license_plate ?? "-"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {v.transmission
                          ? VEHICLE_TRANSMISSION_LABEL[v.transmission]
                          : "-"}
                      </td>
                      <td className="px-4 py-3">
                        {v.active ? (
                          <Badge variant="success">Actief</Badge>
                        ) : (
                          <Badge variant="warning">Inactief</Badge>
                        )}
                      </td>
                      {canManageAssets ? (
                        <td className="px-4 py-3 text-right">
                          <form action={toggleVehicleActive}>
                            <input type="hidden" name="vehicle_id" value={v.id} />
                            <input
                              type="hidden"
                              name="active"
                              value={String(v.active)}
                            />
                            <Button type="submit" variant="ghost" size="sm">
                              {v.active ? "Deactiveren" : "Activeren"}
                            </Button>
                          </form>
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
                <div className="space-y-1.5">
                  <Label htmlFor="v-plate">Kenteken (optioneel)</Label>
                  <Input id="v-plate" name="license_plate" placeholder="00-XXX-0" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="v-transmission">Transmissie</Label>
                  <Select id="v-transmission" name="transmission" defaultValue="">
                    <option value="">- Niet opgegeven -</option>
                    {VEHICLE_TRANSMISSIONS.map((t) => (
                      <option key={t} value={t}>
                        {VEHICLE_TRANSMISSION_LABEL[t]}
                      </option>
                    ))}
                  </Select>
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
                Nog geen locaties binnen je vestigingsscope.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Naam</th>
                    <th className="px-4 py-3 font-medium">Vestiging</th>
                    <th className="px-4 py-3 font-medium">Adres</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    {canManageAssets ? <th className="px-4 py-3" /> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {locations.map((l) => (
                    <tr key={l.id}>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {l.name}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {branchLabel(l.branch_id, branchesById)}
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
                        <td className="px-4 py-3 text-right">
                          <form action={toggleLocationActive}>
                            <input type="hidden" name="location_id" value={l.id} />
                            <input
                              type="hidden"
                              name="active"
                              value={String(l.active)}
                            />
                            <Button type="submit" variant="ghost" size="sm">
                              {l.active ? "Deactiveren" : "Activeren"}
                            </Button>
                          </form>
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

function branchLabel(
  branchId: string | null,
  branchesById: Map<Branch["id"], Branch["name"]>,
): string {
  if (!branchId) return "Alle vestigingen";
  return branchesById.get(branchId) ?? "Onbekende vestiging";
}
