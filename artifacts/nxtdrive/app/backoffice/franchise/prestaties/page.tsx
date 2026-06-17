import Link from "next/link";
import { AlertTriangle, BarChart3, CalendarDays, Gauge, ShieldCheck, TrendingDown, TrendingUp, Users } from "lucide-react";
import { FranchiseDowngradeAlert } from "@/components/backoffice/franchise-downgrade-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireFranchiseOperator } from "@/lib/franchise/access";
import {
  loadFranchisePerformanceOverview,
  type FranchisePerformanceRow,
} from "@/lib/franchise/performance";
import { PLAN_LABELS } from "@/lib/platform/features";

export const dynamic = "force-dynamic";

const euroFmt = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatRevenue(cents: number) {
  return euroFmt.format(cents / 100);
}

function formatDelta(value: number | null, suffix = "%") {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}${suffix}`;
}

function StatCard({
  title,
  value,
  description,
  badge,
  icon: Icon,
}: {
  title: string;
  value: string;
  description: string;
  badge?: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </p>
        </div>
        <span className="rounded-full bg-primary-soft p-2 text-primary">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">{description}</p>
        {badge ? <Badge variant="outline">{badge}</Badge> : null}
      </CardContent>
    </Card>
  );
}

function WatchlistCard({
  title,
  description,
  items,
  renderValue,
  icon: Icon,
}: {
  title: string;
  description: string;
  items: FranchisePerformanceRow[];
  renderValue: (item: FranchisePerformanceRow) => string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <span className="rounded-full bg-primary-soft p-2 text-primary">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen aandachtssignalen.</p>
        ) : (
          items.map((item) => (
            <div
              key={item.tenant_id}
              className="rounded-lg border border-border px-3 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">{item.tenant_name}</p>
                  <p className="text-xs text-muted-foreground">{item.attention_reason}</p>
                </div>
                <Badge variant={item.attention_priority === "hoog" ? "danger" : item.attention_priority === "middel" ? "warning" : "outline"}>
                  {renderValue(item)}
                </Badge>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export default async function FranchisePerformancePage() {
  const { tenant, franchiseAccess, readOnlyDowngrade } =
    await requireFranchiseOperator();
  let overview: Awaited<ReturnType<typeof loadFranchisePerformanceOverview>> | null = null;
  try {
    overview = await loadFranchisePerformanceOverview(tenant.id);
  } catch (error) {
    console.error("[franchise/prestaties] load failed", error);
  }

  if (!overview) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Link
            href="/backoffice/franchise"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Terug naar franchise dashboard
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Franchiseprestaties
          </h1>
          <p className="text-sm text-muted-foreground">
            De prestatiegegevens konden nog niet worden geladen voor {tenant.name}.
          </p>
        </div>
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Controleer of deze tenant franchisees heeft en of de benodigde
            rapportagetabellen beschikbaar zijn.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <Link
            href="/backoffice/franchise"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Terug naar franchise dashboard
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Franchiseprestaties
            </h1>
            <p className="text-sm text-muted-foreground">
              Read-only rapportagecockpit voor {tenant.name}. Bekijk omzet, lesvolume en aandachtssignalen over de laatste 90 dagen zonder tenantgrenzen te doorbreken.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="primary">{overview.network.franchisees} franchisees</Badge>
            <Badge variant="outline">90 dagen trend</Badge>
            <Badge variant="outline">Read-only governance</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/backoffice/franchise/aandacht">
            <Button variant="outline" size="sm">
              Aandacht
            </Button>
          </Link>
          <Link href="/backoffice/franchise/planning">
            <Button variant="outline" size="sm">
              Centrale planning
            </Button>
          </Link>
          <Link href="/backoffice/franchise/vergelijking">
            <Button variant="outline" size="sm">
              Vergelijking
            </Button>
          </Link>
          <Link href="/backoffice/franchise/templates">
            <Button variant="outline" size="sm">
              Templates
            </Button>
          </Link>
        </div>
      </div>

      {readOnlyDowngrade ? (
        <FranchiseDowngradeAlert
          planLabel={PLAN_LABELS[franchiseAccess.requiredPlan]}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Omzet laatste 30 dgn"
          value={formatRevenue(overview.network.current_revenue_cents)}
          description="Betaalde omzet van alle franchisees samen in de meest recente periode."
          badge={`vs. vorige 30 dgn ${formatDelta(overview.network.revenue_delta_pct)}`}
          icon={TrendingUp}
        />
        <StatCard
          title="Lessen laatste 30 dgn"
          value={String(overview.network.current_lessons)}
          description="Voltooide lessen in het netwerk in de meest recente 30 dagen."
          badge={`verschil ${formatDelta(overview.network.lesson_delta, "")}`}
          icon={CalendarDays}
        />
        <StatCard
          title="Actieve leerlingen"
          value={String(overview.network.active_students)}
          description="Huidig totaal actieve leerlingen verspreid over alle franchisees."
          icon={Users}
        />
        <StatCard
          title="Aandachtssignalen"
          value={String(overview.network.attention_count)}
          description="Franchisees met een directe terugval, kwaliteits- of capaciteitswaarschuwing."
          badge={`${overview.network.high_priority_count} hoog`}
          icon={AlertTriangle}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hoe je deze cockpit leest</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 text-sm text-muted-foreground">
          <div className="rounded-lg border border-border px-3 py-3">
            1. Gebruik trends voor franchisebrede sturing, niet om lokale teams over te nemen.
          </div>
          <div className="rounded-lg border border-border px-3 py-3">
            2. Kijk eerst naar omzet en lesvolume, en gebruik daarna pass-rate, conversie en bezetting als verklaring.
          </div>
          <div className="rounded-lg border border-border px-3 py-3">
            3. Elk signaal vraagt lokale opvolging door franchisee, planner of vestigingsmanager binnen die tenant.
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <WatchlistCard
          title="Grootste omzetterugval"
          description="Waar de meest recente 30 dagen het hardst terugvallen ten opzichte van de vorige periode."
          items={overview.watchlists.revenue_softness}
          renderValue={(item) => formatDelta(item.revenue_delta_pct)}
          icon={TrendingDown}
        />
        <WatchlistCard
          title="Zwakste lesvolume"
          description="Franchisees waar het aantal voltooide lessen het sterkst daalt."
          items={overview.watchlists.lesson_softness}
          renderValue={(item) => formatDelta(item.lesson_delta, "")}
          icon={CalendarDays}
        />
        <WatchlistCard
          title="Governance-aandacht"
          description="Directe aandachtssignalen op basis van terugval, kwaliteit, capaciteit of conversie."
          items={overview.watchlists.attention}
          renderValue={(item) => item.attention_label}
          icon={Gauge}
        />
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden />
            Alle franchisees in één overzicht
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Franchisee</th>
                  <th className="px-4 py-3 text-right font-medium">Vestigingen</th>
                  <th className="px-4 py-3 text-right font-medium">Leerlingen</th>
                  <th className="px-4 py-3 text-right font-medium">Omzet 30 dgn</th>
                  <th className="px-4 py-3 text-right font-medium">Omzet delta</th>
                  <th className="px-4 py-3 text-right font-medium">Lessen 30 dgn</th>
                  <th className="px-4 py-3 text-right font-medium">Lesdelta</th>
                  <th className="px-4 py-3 text-right font-medium">Conversie</th>
                  <th className="px-4 py-3 text-right font-medium">Slagings%</th>
                  <th className="px-4 py-3 text-right font-medium">Bezetting</th>
                  <th className="px-4 py-3 font-medium">Aandacht</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {overview.franchisees.map((row) => (
                  <tr key={row.tenant_id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{row.tenant_name}</div>
                      <div className="text-xs text-muted-foreground">{row.tenant_slug}</div>
                    </td>
                    <td className="px-4 py-3 text-right">{row.branch_count}</td>
                    <td className="px-4 py-3 text-right">{row.active_students}</td>
                    <td className="px-4 py-3 text-right">{formatRevenue(row.current_revenue_cents)}</td>
                    <td className="px-4 py-3 text-right">{formatDelta(row.revenue_delta_pct)}</td>
                    <td className="px-4 py-3 text-right">{row.current_lessons}</td>
                    <td className="px-4 py-3 text-right">{formatDelta(row.lesson_delta, "")}</td>
                    <td className="px-4 py-3 text-right">
                      {row.lead_conversion_rate === null ? "—" : `${row.lead_conversion_rate}%`}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.exam_pass_rate === null ? "—" : `${row.exam_pass_rate}%`}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.capacity_utilisation === null ? "—" : `${row.capacity_utilisation}%`}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={row.attention_priority === "hoog" ? "danger" : row.attention_priority === "middel" ? "warning" : "outline"}>
                        {row.attention_label}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>
          <strong>Governance</strong>: franchise-insight blijft read-only en vervangt geen lokale verantwoordelijkheid binnen franchisees.
        </span>
        <span>
          Gebruik het aandachtsscherm om prioriteiten en follow-up routes sneller aan de juiste franchisebegeleiding te koppelen.
        </span>
      </div>
    </div>
  );
}
