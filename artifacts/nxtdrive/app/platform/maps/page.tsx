import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Building2,
  Gauge,
  MapPinned,
  ReceiptText,
} from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { closeMapsCircuitBreaker } from "./actions";

export const dynamic = "force-dynamic";

export default async function PlatformMapsPage() {
  await requirePlatformAdmin();
  const service = createServiceRoleClient();
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);
  const [
    { data: rollups },
    { data: tenants },
    { data: alerts },
    { data: breakers },
    { data: reconciliations },
  ] = await Promise.all([
    service
      .from("maps_usage_daily_rollups")
      .select(
        "tenant_id, usage_date, feature_code, provider, sku_code, unit_type, result_status, units, estimated_gross_cost_micros, event_count, fallback_count, error_count",
      )
      .gte("usage_date", since.toISOString().slice(0, 10))
      .order("usage_date"),
    service.from("tenants").select("id, name, plan").order("name"),
    service
      .from("maps_budget_alerts")
      .select(
        "id, tenant_id, threshold_percent, forecast_cost_micros, budget_cost_micros, status, opened_at",
      )
      .in("status", ["OPEN", "ACKNOWLEDGED"])
      .order("opened_at", { ascending: false }),
    service
      .from("maps_circuit_breakers")
      .select(
        "id, tenant_id, api_code, feature_code, state, failure_count, reason_code, retry_after",
      )
      .in("state", ["OPEN", "HALF_OPEN"])
      .order("updated_at", { ascending: false }),
    service
      .from("maps_cost_reconciliations")
      .select(
        "period_start, period_end, actual_account_cost_micros, currency, imported_at",
      )
      .order("period_end", { ascending: false })
      .limit(1),
  ]);
  const tenantById = new Map(
    (tenants ?? []).map((tenant) => [tenant.id, tenant]),
  );
  const usageByTenant = new Map<
    string,
    {
      units: number;
      grossMicros: number;
      events: number;
      fallbacks: number;
      errors: number;
    }
  >();
  const usageByProduct = new Map<string, number>();
  const usageByDay = new Map<string, number>();
  for (const row of rollups ?? []) {
    const current = usageByTenant.get(row.tenant_id) ?? {
      units: 0,
      grossMicros: 0,
      events: 0,
      fallbacks: 0,
      errors: 0,
    };
    current.units += Number(row.units ?? 0);
    current.grossMicros += Number(row.estimated_gross_cost_micros ?? 0);
    current.events += Number(row.event_count ?? 0);
    current.fallbacks += Number(row.fallback_count ?? 0);
    current.errors += Number(row.error_count ?? 0);
    usageByTenant.set(row.tenant_id, current);
    const product = productLabel(row.feature_code);
    usageByProduct.set(
      product,
      (usageByProduct.get(product) ?? 0) + Number(row.units ?? 0),
    );
    usageByDay.set(
      row.usage_date,
      (usageByDay.get(row.usage_date) ?? 0) +
        Number(row.estimated_gross_cost_micros ?? 0),
    );
  }
  const total = [...usageByTenant.values()].reduce(
    (sum, item) => ({
      units: sum.units + item.units,
      grossMicros: sum.grossMicros + item.grossMicros,
      events: sum.events + item.events,
      fallbacks: sum.fallbacks + item.fallbacks,
      errors: sum.errors + item.errors,
    }),
    { units: 0, grossMicros: 0, events: 0, fallbacks: 0, errors: 0 },
  );
  const warningTenantIds = new Set(
    (alerts ?? []).map((alert) => alert.tenant_id).filter(Boolean),
  );
  const daysElapsed = Math.max(1, new Date().getUTCDate());
  const daysInMonth = new Date(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth() + 1,
    0,
  ).getUTCDate();
  const forecastMicros = Math.round(
    (total.grossMicros / daysElapsed) * daysInMonth,
  );
  const actual = reconciliations?.[0];

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[96rem] space-y-4">
        <header className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Platformbeheer
            </Link>
            <div className="mt-2 flex items-center gap-2 text-violet-300">
              <MapPinned className="h-4 w-4" aria-hidden />
              <span className="text-xs font-black uppercase tracking-[0.2em]">
                Maps & Routing
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
              Control Center
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              PII-vrij gebruik, kostenramingen, limieten, degradatie en
              providerstatus.
            </p>
          </div>
          <p className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
            Werkelijke accountkosten:{" "}
            {actual
              ? `${money(actual.actual_account_cost_micros)} · t/m ${actual.period_end}`
              : "nog niet gereconcilieerd"}
          </p>
        </header>

        <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <Metric
            icon={ReceiptText}
            label="Verwachte maandwaarde"
            value={money(forecastMicros)}
            hint="Lijstprijsmodel, geen factuur"
          />
          <Metric
            icon={Gauge}
            label="Budgetverbruik"
            value={
              alerts?.length
                ? `${Math.max(...alerts.map((a) => a.threshold_percent))}%+`
                : "Binnen signalen"
            }
            hint={`${alerts?.length ?? 0} open waarschuwingen`}
          />
          <Metric
            icon={Activity}
            label="Billable units"
            value={formatNumber(total.units)}
            hint={`${total.events} events`}
          />
          <Metric
            icon={Building2}
            label="Tenants boven signaal"
            value={warningTenantIds.size}
            hint="Budget of forecast"
          />
          <Metric
            icon={AlertTriangle}
            label="Fallback + error"
            value={
              total.events
                ? `${(((total.fallbacks + total.errors) / total.events) * 100).toFixed(1)}%`
                : "0,0%"
            }
            hint={`${breakers?.length ?? 0} open breakers`}
          />
        </section>

        <section className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(22rem,.6fr)]">
          <Panel
            title="Verbruikstrend"
            subtitle="Geschatte bruto gebruikswaarde per dag"
          >
            <Trend rows={[...usageByDay.entries()]} />
          </Panel>
          <Panel title="Productverdeling" subtitle="Units, niet HTTP-requests">
            <Distribution rows={[...usageByProduct.entries()]} />
          </Panel>
        </section>

        <Panel
          title="Grootste tenants"
          subtitle="Forecast en kosten blijven expliciet modelschattingen"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[68rem] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs text-slate-400">
                  <th className="px-3 py-2">Tenant</th>
                  <th className="px-3 py-2">Plan</th>
                  <th className="px-3 py-2">Units</th>
                  <th className="px-3 py-2">Bruto waarde</th>
                  <th className="px-3 py-2">Forecast</th>
                  <th className="px-3 py-2">Fallback</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {[...usageByTenant.entries()]
                  .sort((a, b) => b[1].grossMicros - a[1].grossMicros)
                  .map(([tenantId, usage]) => {
                    const tenant = tenantById.get(tenantId);
                    return (
                      <tr key={tenantId} className="border-b border-white/10">
                        <td className="px-3 py-3 font-black">
                          {tenant?.name ?? tenantId}
                        </td>
                        <td className="px-3 py-3 uppercase text-slate-400">
                          {tenant?.plan ?? "—"}
                        </td>
                        <td className="px-3 py-3">
                          {formatNumber(usage.units)}
                        </td>
                        <td className="px-3 py-3">
                          {money(usage.grossMicros)}
                        </td>
                        <td className="px-3 py-3">
                          {money(
                            Math.round(
                              (usage.grossMicros / daysElapsed) * daysInMonth,
                            ),
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {usage.events
                            ? `${((usage.fallbacks / usage.events) * 100).toFixed(1)}%`
                            : "0,0%"}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded-full px-2 py-1 text-[11px] font-black ${
                              warningTenantIds.has(tenantId)
                                ? "bg-amber-400/15 text-amber-300"
                                : "bg-emerald-400/15 text-emerald-300"
                            }`}
                          >
                            {warningTenantIds.has(tenantId)
                              ? "Aandacht"
                              : "Normaal"}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <Link
                            href={`/platform/maps/tenants/${tenantId}`}
                            className="font-black text-violet-300 hover:text-violet-200"
                          >
                            Beheer
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          title="Operationele waarschuwingen"
          subtitle="Quota, credentials, budget, errors en fallback"
        >
          <div className="grid gap-2 md:grid-cols-2">
            {(breakers ?? []).map((breaker) => (
              <article
                key={breaker.id}
                className="rounded-xl border border-red-400/20 bg-red-400/5 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-red-200">
                      {breaker.api_code} · {breaker.state}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {breaker.feature_code ?? "Alle functies"} ·{" "}
                      {breaker.reason_code ?? "geen reden"} ·{" "}
                      {breaker.failure_count} fouten
                    </p>
                  </div>
                  {breaker.state === "OPEN" ? (
                    <form action={closeMapsCircuitBreaker}>
                      <input
                        type="hidden"
                        name="breaker_id"
                        value={breaker.id}
                      />
                      <button
                        type="submit"
                        className="rounded-lg border border-white/15 px-2 py-1 text-xs font-black"
                      >
                        Half-open test
                      </button>
                    </form>
                  ) : null}
                </div>
              </article>
            ))}
            {(alerts ?? []).map((alert) => (
              <article
                key={alert.id}
                className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3"
              >
                <p className="font-black text-amber-200">
                  Budgetsignaal {alert.threshold_percent}%
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {tenantById.get(alert.tenant_id)?.name ?? "Platform"} ·
                  forecast {money(alert.forecast_cost_micros ?? 0)}
                </p>
              </article>
            ))}
            {!breakers?.length && !alerts?.length ? (
              <p className="rounded-xl bg-emerald-400/10 p-4 text-sm text-emerald-200">
                Geen open operationele Maps-waarschuwingen.
              </p>
            ) : null}
          </div>
        </Panel>
      </div>
    </main>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Activity;
  label: string;
  value: React.ReactNode;
  hint: string;
}) {
  return (
    <div className="min-h-28 rounded-2xl border border-white/10 bg-white/[0.045] p-3">
      <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
        <span>{label}</span>
        <Icon className="h-4 w-4 text-violet-300" aria-hidden />
      </div>
      <p className="mt-3 text-xl font-black">{value}</p>
      <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
      <div className="border-b border-white/10 px-4 py-3">
        <h2 className="font-black">{title}</h2>
        <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Trend({ rows }: { rows: Array<[string, number]> }) {
  const maximum = Math.max(...rows.map((row) => row[1]), 1);
  return (
    <div className="flex h-52 items-end gap-1.5 overflow-x-auto">
      {rows.map(([day, cost]) => (
        <div
          key={day}
          className="flex min-w-8 flex-1 flex-col items-center gap-2"
        >
          <div className="flex h-40 w-full items-end rounded-t bg-white/5">
            <div
              className="w-full rounded-t bg-gradient-to-t from-violet-600 to-violet-300"
              style={{ height: `${Math.max(3, (cost / maximum) * 100)}%` }}
              title={`${day}: ${money(cost)}`}
            />
          </div>
          <span className="text-[9px] text-slate-500">{day.slice(8)}</span>
        </div>
      ))}
      {rows.length === 0 ? (
        <p className="self-center text-sm text-slate-400">
          Nog geen rollups deze maand.
        </p>
      ) : null}
    </div>
  );
}

function Distribution({ rows }: { rows: Array<[string, number]> }) {
  const total = rows.reduce((sum, row) => sum + row[1], 0);
  return (
    <div className="space-y-3">
      {rows
        .sort((a, b) => b[1] - a[1])
        .map(([label, units]) => (
          <div key={label}>
            <div className="flex justify-between text-xs">
              <span className="font-black">{label}</span>
              <span className="text-slate-400">{formatNumber(units)}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-violet-400"
                style={{ width: `${total ? (units / total) * 100 : 0}%` }}
              />
            </div>
          </div>
        ))}
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">Nog geen productgebruik.</p>
      ) : null}
    </div>
  );
}

function productLabel(feature: string) {
  if (feature.includes("ADDRESS") || feature.includes("PLACE"))
    return "Places & Validation";
  if (feature.includes("MATRIX")) return "Route Matrix";
  if (feature.includes("OPTIMIZATION")) return "Optimization";
  if (feature.includes("ROUTE")) return "Routes";
  if (feature.includes("MAP") || feature.includes("AREA")) return "Maps";
  return "Analytics";
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
  }).format(Number(micros ?? 0) / 1_000_000);
}
