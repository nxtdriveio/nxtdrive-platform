import Link from "next/link";
import { ArrowLeft, Settings2 } from "lucide-react";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { Button } from "@/components/ui/button";
import { saveMapsEntitlement, saveMapsLimit } from "../../actions";

export const dynamic = "force-dynamic";

const FEATURE_LABELS = [
  ["ADDRESS_AUTOCOMPLETE", "Adres zoeken"],
  ["PLACE_DETAILS", "Adresdetail ophalen"],
  ["ADDRESS_VALIDATION", "Adresvalidatie"],
  ["GEOCODING", "Geocodering"],
  ["MAP_LOAD", "Kaartpreview"],
  ["EXTERNAL_NAVIGATION", "Externe navigatie"],
  ["ROUTE_CALCULATION", "Routeberekening"],
  ["ROUTE_MATRIX", "Route Matrix"],
  ["ROUTE_CONFLICT_CHECK", "Conflictcontrole"],
  ["INSTRUCTOR_RECOMMENDATION", "Beste-instructeurvoorstel"],
  ["VEHICLE_LOCATION_RECOMMENDATION", "Voertuig- en vestigingsvoorstel"],
  ["SINGLE_VEHICLE_OPTIMIZATION", "Routevolgordeoptimalisatie"],
  ["FLEET_OPTIMIZATION", "Multi-instructeurscenario"],
  ["CANCELLATION_OPTIMIZATION", "Annuleringsoptimalisatie"],
  ["WORK_AREA_MAP", "Werkgebiedenkaart"],
  ["EMPTY_MILE_ANALYSIS", "Lege-kilometeranalyse"],
  ["POSTCODE_ANALYTICS", "Postcodeanalyse"],
  ["EXAM_DEPARTURE_ADVICE", "Examenvertrekadvies"],
] as const;

export default async function TenantMapsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  await requirePlatformAdmin();
  const [{ tenantId }, query] = await Promise.all([params, searchParams]);
  const activeTab = query.tab ?? "overzicht";
  const service = createServiceRoleClient();
  const [
    { data: tenant },
    { data: entitlements },
    { data: limits },
    { data: rollups },
    { data: degradations },
    { data: breakers },
  ] = await Promise.all([
    service
      .from("tenants")
      .select("id, name, plan")
      .eq("id", tenantId)
      .maybeSingle(),
    service
      .from("maps_tenant_entitlements")
      .select(
        "feature_code, status, included_units, allocation_method, updated_at",
      )
      .eq("tenant_id", tenantId)
      .order("feature_code"),
    service
      .from("maps_tenant_limits")
      .select(
        "id, feature_code, sku_code, period_type, environment, soft_limit, hard_limit, warning_thresholds, degradation_action, enabled, created_at",
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    service
      .from("maps_usage_daily_rollups")
      .select(
        "usage_date, feature_code, provider, sku_code, unit_type, result_status, units, estimated_gross_cost_micros, event_count, fallback_count, error_count",
      )
      .eq("tenant_id", tenantId)
      .order("usage_date", { ascending: false })
      .limit(300),
    service
      .from("maps_feature_degradation_events")
      .select(
        "id, feature_code, trigger_type, normal_mode, degraded_mode, status, correlation_id, opened_at, closed_at, reason",
      )
      .eq("tenant_id", tenantId)
      .order("opened_at", { ascending: false })
      .limit(50),
    service
      .from("maps_circuit_breakers")
      .select(
        "id, api_code, feature_code, state, failure_count, reason_code, updated_at",
      )
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
      .order("updated_at", { ascending: false }),
  ]);
  if (!tenant) notFound();
  const entitlementByFeature = new Map(
    (entitlements ?? []).map((item) => [item.feature_code, item]),
  );
  const totalUnits = (rollups ?? []).reduce(
    (sum, row) => sum + Number(row.units),
    0,
  );
  const grossMicros = (rollups ?? []).reduce(
    (sum, row) => sum + Number(row.estimated_gross_cost_micros ?? 0),
    0,
  );
  const totalEvents = (rollups ?? []).reduce(
    (sum, row) => sum + Number(row.event_count ?? 0),
    0,
  );
  const totalErrors = (rollups ?? []).reduce(
    (sum, row) => sum + Number(row.error_count ?? 0),
    0,
  );

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-5 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="border-b border-white/10 pb-4">
          <Link
            href="/platform/maps"
            className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Control Center
          </Link>
          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-300">
                Tenantdetail · {tenant.plan}
              </p>
              <h1 className="mt-1 text-2xl font-black">{tenant.name}</h1>
            </div>
            <Settings2 className="h-5 w-5 text-slate-500" aria-hidden />
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.035] p-1">
          {[
            "overzicht",
            "gebruik",
            "kosten",
            "functies",
            "limieten",
            "fouten",
            "degradatie",
            "configuratie",
            "historie",
          ].map((tab) => (
            <Link
              key={tab}
              href={`/platform/maps/tenants/${tenantId}?tab=${tab}`}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-black capitalize ${
                activeTab === tab
                  ? "bg-violet-500 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {tab}
            </Link>
          ))}
        </nav>

        {activeTab === "functies" || activeTab === "configuratie" ? (
          <section className="grid gap-2 md:grid-cols-2">
            {FEATURE_LABELS.map(([featureCode, label]) => {
              const entitlement = entitlementByFeature.get(featureCode);
              return (
                <form
                  key={featureCode}
                  action={saveMapsEntitlement}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-3"
                >
                  <input type="hidden" name="tenant_id" value={tenantId} />
                  <input
                    type="hidden"
                    name="feature_code"
                    value={featureCode}
                  />
                  <div>
                    <p className="text-sm font-black">{label}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-slate-500">
                      {featureCode}
                    </p>
                  </div>
                  <select
                    name="status"
                    defaultValue={entitlement?.status ?? "DISABLED"}
                    className="h-9 rounded-lg border border-white/15 bg-slate-900 px-2 text-xs font-black"
                  >
                    <option value="ENABLED">ENABLED</option>
                    <option value="PILOT">PILOT</option>
                    <option value="DISABLED">DISABLED</option>
                    <option value="SUSPENDED">SUSPENDED</option>
                  </select>
                  <Button type="submit" size="sm">
                    Opslaan
                  </Button>
                </form>
              );
            })}
          </section>
        ) : activeTab === "limieten" ? (
          <div className="grid gap-3 lg:grid-cols-[22rem_minmax(0,1fr)]">
            <form
              action={saveMapsLimit}
              className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4"
            >
              <h2 className="font-black">Maandlimiet toevoegen</h2>
              <input type="hidden" name="tenant_id" value={tenantId} />
              <select
                name="feature_code"
                className="h-10 w-full rounded-lg border border-white/15 bg-slate-900 px-3 text-sm"
              >
                {FEATURE_LABELS.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                name="soft_limit"
                type="number"
                min="0"
                required
                placeholder="Soft limit"
                className="h-10 w-full rounded-lg border border-white/15 bg-slate-900 px-3 text-sm"
              />
              <input
                name="hard_limit"
                type="number"
                min="1"
                required
                placeholder="Hard limit"
                className="h-10 w-full rounded-lg border border-white/15 bg-slate-900 px-3 text-sm"
              />
              <select
                name="degradation_action"
                className="h-10 w-full rounded-lg border border-white/15 bg-slate-900 px-3 text-sm"
              >
                <option value="MANUAL_INPUT">Handmatige invoer</option>
                <option value="LIST_ONLY">Alleen lijst</option>
                <option value="NON_TRAFFIC_ROUTE">Route zonder verkeer</option>
                <option value="RAYON_OR_HAVERSINE">Rayon / Haversine</option>
                <option value="LOCAL_HEURISTIC">Lokale heuristiek</option>
                <option value="BLOCK">Blokkeren</option>
              </select>
              <Button type="submit">Limiet opslaan</Button>
            </form>
            <DataTable
              headers={[
                "Functie",
                "Periode",
                "Soft",
                "Hard",
                "Actie",
                "Status",
              ]}
              rows={(limits ?? []).map((limit) => [
                limit.feature_code,
                `${limit.period_type} · ${limit.environment ?? "alle"}`,
                limit.soft_limit ?? "—",
                limit.hard_limit,
                limit.degradation_action,
                limit.enabled ? "Actief" : "Uit",
              ])}
            />
          </div>
        ) : activeTab === "degradatie" ? (
          <DataTable
            headers={[
              "Functie",
              "Trigger",
              "Pad",
              "Status",
              "Geopend",
              "Reden",
            ]}
            rows={(degradations ?? []).map((item) => [
              item.feature_code,
              item.trigger_type,
              `${item.normal_mode} → ${item.degraded_mode}`,
              item.status,
              new Date(item.opened_at).toLocaleString("nl-NL"),
              item.reason ?? item.correlation_id,
            ])}
          />
        ) : activeTab === "fouten" ? (
          <DataTable
            headers={[
              "API",
              "Functie",
              "Status",
              "Fouten",
              "Reden",
              "Bijgewerkt",
            ]}
            rows={(breakers ?? []).map((item) => [
              item.api_code,
              item.feature_code ?? "Alle",
              item.state,
              item.failure_count,
              item.reason_code ?? "—",
              new Date(item.updated_at).toLocaleString("nl-NL"),
            ])}
          />
        ) : (
          <>
            <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Summary label="Units" value={formatNumber(totalUnits)} />
              <Summary
                label="Bruto gebruikswaarde"
                value={money(grossMicros)}
              />
              <Summary label="Events" value={formatNumber(totalEvents)} />
              <Summary
                label="Errorratio"
                value={
                  totalEvents
                    ? `${((totalErrors / totalEvents) * 100).toFixed(1)}%`
                    : "0,0%"
                }
              />
            </section>
            <DataTable
              headers={[
                "Dag",
                "Functie",
                "Provider",
                "SKU",
                "Units",
                "Status",
                "Bruto waarde",
              ]}
              rows={(rollups ?? [])
                .slice(0, 100)
                .map((row) => [
                  row.usage_date,
                  row.feature_code,
                  row.provider,
                  row.sku_code || "intern",
                  formatNumber(Number(row.units)),
                  row.result_status,
                  money(Number(row.estimated_gross_cost_micros ?? 0)),
                ])}
            />
          </>
        )}
      </div>
    </main>
  );
}

function Summary({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-black">{value}</p>
    </div>
  );
}

function DataTable({
  headers,
  rows,
}: {
  headers: readonly string[];
  rows: readonly (readonly React.ReactNode[])[];
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.035]">
      <table className="w-full min-w-[48rem] text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-xs text-slate-400">
            {headers.map((header) => (
              <th key={header} className="px-3 py-2">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-white/10">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-3">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-400">
          Nog geen gegevens.
        </p>
      ) : null}
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 }).format(
    value,
  );
}

function money(micros: number) {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(micros / 1_000_000);
}
