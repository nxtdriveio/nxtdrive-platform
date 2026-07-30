import {
  AlertTriangle,
  Building2,
  Gauge,
  MapPinned,
  ShieldCheck,
} from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  AdminGrid,
  AdminMetricStrip,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from "@/components/backoffice/admin-primitives";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { saveCbrLocation } from "./cbr-actions";

export const dynamic = "force-dynamic";

export default async function LocationManagementPage() {
  const { tenant } = await requireActiveTenant([
    "tenant_admin",
    "branch_manager",
    "planner",
    "admin_staff",
  ]);
  const service = createServiceRoleClient();
  const [
    { data: validations },
    { data: workAreas },
    { data: emptyMiles },
    { data: postcodeCells },
    { data: cbrLocations },
    { data: scenarios },
  ] = await Promise.all([
    service
      .from("location_validation_events")
      .select("id, validation_status, occurred_at")
      .eq("tenant_id", tenant.id)
      .in("validation_status", ["INVALID", "REVIEW_REQUIRED", "PARTIAL"])
      .order("occurred_at", { ascending: false })
      .limit(20),
    service
      .from("work_area_versions")
      .select(
        "id, label, status, postcode_prefixes, city_names, capacity_units",
      )
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false }),
    service
      .from("empty_mile_daily_rollups")
      .select(
        "usage_date, method, appointment_count, covered_appointment_count, empty_distance_meters, empty_duration_seconds, potential_saving_meters",
      )
      .eq("tenant_id", tenant.id)
      .order("usage_date", { ascending: false })
      .limit(31),
    service
      .from("postcode_analytics_snapshots")
      .select(
        "geography_code, subject_count, appointment_count, metrics_document, suppression_status, period_start, period_end",
      )
      .eq("tenant_id", tenant.id)
      .eq("suppression_status", "VISIBLE")
      .order("period_end", { ascending: false })
      .limit(12),
    service
      .from("cbr_locations")
      .select(
        "id, stable_code, name, address_snapshot, official_source_reference, last_verified_at, status",
      )
      .or(`tenant_id.is.null,tenant_id.eq.${tenant.id}`)
      .order("name"),
    service
      .from("planning_optimization_scenarios")
      .select(
        "id, scenario_type, status, current_travel_seconds, proposed_travel_seconds, current_empty_meters, proposed_empty_meters, provider, created_at",
      )
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const emptyDistance = (emptyMiles ?? []).reduce(
    (sum, row) => sum + Number(row.empty_distance_meters ?? 0),
    0,
  );
  const covered = (emptyMiles ?? []).reduce(
    (sum, row) => sum + Number(row.covered_appointment_count ?? 0),
    0,
  );
  const appointments = (emptyMiles ?? []).reduce(
    (sum, row) => sum + Number(row.appointment_count ?? 0),
    0,
  );

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Locaties & routes"
        title="Locatiebeheer"
        description="Uitzonderingen eerst: adreskwaliteit, werkgebieden, geplande lege kilometers, privacyveilige postcodecellen en CBR-bronnen."
      />
      <AdminMetricStrip
        items={[
          {
            label: "Adrescontrole nodig",
            value: validations?.length ?? 0,
            hint: "Ongeldig, partieel of review",
          },
          {
            label: "Werkgebieden",
            value:
              workAreas?.filter((area) => area.status === "PUBLISHED").length ??
              0,
            hint: "Gepubliceerde versies",
          },
          {
            label: "Geplande lege km",
            value: `${Math.round(emptyDistance / 1000)} km`,
            hint: "Geen GPS-meting",
          },
          {
            label: "Datadekking",
            value: appointments
              ? `${Math.round((covered / appointments) * 100)}%`
              : "—",
            hint: `${appointments} afspraken`,
          },
        ]}
      />
      <AdminGrid columns="2">
        <AdminPanel
          title="Aandacht nodig"
          description="Adreskwaliteit zonder locatiepayload in logs"
          className="min-h-72"
        >
          <div className="space-y-2">
            {(validations ?? []).map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between rounded-xl border border-brand-border p-3 text-sm"
              >
                <span className="inline-flex items-center gap-2 font-black">
                  <AlertTriangle
                    className="h-4 w-4 text-amber-500"
                    aria-hidden
                  />
                  {event.validation_status}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(event.occurred_at).toLocaleDateString("nl-NL")}
                </span>
              </div>
            ))}
            {!validations?.length ? (
              <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
                Geen open adreskwaliteitsmeldingen.
              </p>
            ) : null}
          </div>
        </AdminPanel>
        <AdminPanel
          title="Werkgebieden"
          description="Versies, capaciteit en overlappende gebieden"
          className="min-h-72"
        >
          <div className="space-y-2">
            {(workAreas ?? []).map((area) => (
              <div
                key={area.id}
                className="rounded-xl border border-brand-border p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black">{area.label}</span>
                  <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-bold">
                    {area.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {(area.postcode_prefixes ?? []).join(", ") ||
                    "Geen postcodeprefixen"}{" "}
                  · {(area.city_names ?? []).join(", ") || "Geen plaatsen"}
                </p>
              </div>
            ))}
            {!workAreas?.length ? (
              <p className="text-sm text-muted-foreground">
                Nog geen versieerbare werkgebieden.
              </p>
            ) : null}
          </div>
        </AdminPanel>
        <AdminPanel
          title="Lege-kilometeranalyse"
          description="Geplande afstand, reistijd, dekking en methode"
          className="min-h-72"
        >
          <div className="space-y-3">
            {(emptyMiles ?? []).slice(0, 8).map((row) => (
              <div
                key={`${row.usage_date}:${row.method}`}
                className="grid grid-cols-[1fr_auto] gap-3 border-b border-brand-border/70 pb-2 text-sm"
              >
                <div>
                  <p className="font-black">{row.usage_date}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.method} · {row.covered_appointment_count}/
                    {row.appointment_count} gedekt
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-black">
                    {(Number(row.empty_distance_meters) / 1000).toFixed(1)} km
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {Math.round(Number(row.empty_duration_seconds) / 60)} min
                  </p>
                </div>
              </div>
            ))}
            {!emptyMiles?.length ? (
              <p className="text-sm text-muted-foreground">
                De background-rollup heeft nog geen complete periode.
              </p>
            ) : null}
            <p className="text-[11px] text-muted-foreground">
              Planninginschatting; geen live tracking of GPS-gemeten afstand.
            </p>
          </div>
        </AdminPanel>
        <AdminPanel
          title="Postcodeanalyse"
          description="Alleen zichtbare cellen boven de privacydrempel"
          className="min-h-72"
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {(postcodeCells ?? []).map((cell) => (
              <div
                key={`${cell.geography_code}:${cell.period_end}`}
                className="rounded-xl bg-muted/60 p-3"
              >
                <p className="text-lg font-black">{cell.geography_code}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {cell.subject_count} personen · {cell.appointment_count}{" "}
                  afspraken
                </p>
              </div>
            ))}
            {!postcodeCells?.length ? (
              <p className="text-sm text-muted-foreground sm:col-span-2">
                Geen privacyveilige cellen voor de gekozen complete periode.
              </p>
            ) : null}
          </div>
        </AdminPanel>
      </AdminGrid>

      <AdminPanel
        title="CBR-locatiecatalogus"
        description="Geen scraping; iedere locatie heeft een expliciete bron en reviewstatus"
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead>
                <tr className="border-b border-brand-border text-xs text-muted-foreground">
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Locatie</th>
                  <th className="px-3 py-2">Bron</th>
                  <th className="px-3 py-2">Actualiteit</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {(cbrLocations ?? []).map((location) => (
                  <tr
                    key={location.id}
                    className="border-b border-brand-border/70"
                  >
                    <td className="px-3 py-3 font-mono text-xs">
                      {location.stable_code}
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-black">{location.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {location.address_snapshot}
                      </p>
                    </td>
                    <td className="max-w-52 truncate px-3 py-3 text-xs">
                      {location.official_source_reference ?? "Bron ontbreekt"}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {location.last_verified_at
                        ? new Date(
                            location.last_verified_at,
                          ).toLocaleDateString("nl-NL")
                        : "Niet geverifieerd"}
                    </td>
                    <td className="px-3 py-3">{location.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form
            action={saveCbrLocation}
            className="space-y-3 rounded-2xl border border-brand-border p-4"
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
              <h3 className="font-black">Locatie ter review</h3>
            </div>
            <div>
              <Label htmlFor="cbr-code">Stabiele interne code</Label>
              <Input
                id="cbr-code"
                name="stable_code"
                required
                placeholder="CBR-RIJSWIJK"
              />
            </div>
            <div>
              <Label htmlFor="cbr-name">Naam</Label>
              <Input id="cbr-name" name="name" required />
            </div>
            <div>
              <Label htmlFor="cbr-address">Bevestigd adres</Label>
              <Input id="cbr-address" name="address" required />
            </div>
            <div>
              <Label htmlFor="cbr-source">Officiële bron of referentie</Label>
              <Input
                id="cbr-source"
                name="source"
                required
                placeholder="URL of documentreferentie"
              />
            </div>
            <Button type="submit">Indienen voor review</Button>
          </form>
        </div>
      </AdminPanel>

      <AdminPanel
        title="Optimalisatiescenario's"
        description="Adviserend, uitlegbaar en nooit automatisch gepubliceerd"
      >
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {(scenarios ?? []).map((scenario) => (
            <article
              key={scenario.id}
              className="rounded-xl border border-brand-border p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black">
                  {scenario.scenario_type}
                </span>
                <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold">
                  {scenario.status}
                </span>
              </div>
              <p className="mt-3 text-sm font-black">
                {minutesDelta(
                  scenario.current_travel_seconds,
                  scenario.proposed_travel_seconds,
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {scenario.provider} · menselijke review vereist
              </p>
            </article>
          ))}
          {!scenarios?.length ? (
            <p className="text-sm text-muted-foreground">
              Nog geen routevolgorde- of annuleringherstelvoorstellen.
            </p>
          ) : null}
        </div>
      </AdminPanel>
    </AdminPage>
  );
}

function minutesDelta(current: number | null, proposed: number | null) {
  if (current === null || proposed === null)
    return "Reistijd nog niet berekend";
  const delta = Math.round((current - proposed) / 60);
  return delta > 0
    ? `${delta} min potentiële besparing`
    : "Geen tijdsbesparing";
}
