import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  BookOpenCheck,
  Building2,
  CalendarDays,
  ExternalLink,
  Gauge,
  MapPin,
  Network,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import { loadFranchiseGovernanceOverview } from "@/lib/franchise/governance";
import { loadFranchiseOverview } from "@/lib/franchise/overview";
import { loadFranchisePerformanceOverview } from "@/lib/franchise/performance";
import { requireFranchiseOperator } from "@/lib/franchise/access";
import { PLAN_LABELS } from "@/lib/platform/features";
import type { FranchiseeLocation } from "@/lib/franchise/overview";
import { FranchiseDowngradeAlert } from "@/components/backoffice/franchise-downgrade-alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const euroFmt = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatRevenue(cents: number): string {
  return euroFmt.format(cents / 100);
}

function PassRate({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">-</span>;
  const colour =
    value >= 70 ? "text-green-500" : value >= 50 ? "text-yellow-500" : "text-red-400";
  return <span className={colour}>{value}%</span>;
}

function CapacityBar({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-xs text-muted-foreground">-</span>;
  }

  const colour =
    value >= 80 ? "bg-green-500" : value >= 50 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${colour}`} style={{ width: `${value}%` }} />
      </div>
      <span className="w-8 text-right text-xs tabular-nums text-foreground">{value}%</span>
    </div>
  );
}

function FranchiseeRow({ loc }: { loc: FranchiseeLocation }) {
  const activeBranches = loc.branches.filter((branch) => branch.is_active);

  return (
    <>
      <tr className="border-t-2 border-border bg-muted/30">
        <td className="px-4 py-2.5" colSpan={2}>
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="font-semibold text-foreground">{loc.tenant_name}</span>
            {activeBranches.length > 0 ? (
              <Badge variant="outline" className="text-[10px]">
                {activeBranches.length}{" "}
                {activeBranches.length === 1 ? "vestiging" : "vestigingen"}
              </Badge>
            ) : null}
          </div>
        </td>
        <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-foreground">
          {loc.active_students}
        </td>
        <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-foreground">
          {loc.lessons_last_30d}
        </td>
        <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-foreground">
          {formatRevenue(loc.revenue_last_30d_cents)}
        </td>
        <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
          <PassRate value={loc.exam_pass_rate} />
        </td>
        <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-foreground">
          {loc.lead_conversion_rate !== null ? `${loc.lead_conversion_rate}%` : "-"}
        </td>
        <td className="px-4 py-2.5 text-right">
          <CapacityBar value={loc.capacity_utilisation} />
        </td>
        <td className="px-4 py-2.5 text-right">
          <Link
            href={`/backoffice/leads?franchise_tenant=${loc.tenant_id}`}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Leads
            <ExternalLink className="h-3 w-3" aria-hidden />
          </Link>
        </td>
      </tr>

      {activeBranches.length === 0 ? (
        <tr className="border-t border-dashed border-border/50">
          <td className="px-4 py-2 pl-10" colSpan={9}>
            <span className="text-xs italic text-muted-foreground/60">
              Geen actieve vestigingen geregistreerd
            </span>
          </td>
        </tr>
      ) : (
        activeBranches.map((branch) => (
          <tr
            key={branch.id}
            className="border-t border-dashed border-border/40 hover:bg-muted/10"
          >
            <td className="px-4 py-2 pl-10" colSpan={2}>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                <span className="text-xs">{branch.name}</span>
                {branch.city ? (
                  <span className="text-xs text-muted-foreground/60">- {branch.city}</span>
                ) : null}
              </div>
            </td>
            <td className="px-4 py-2 text-right text-xs tabular-nums text-muted-foreground">
              {branch.active_students}
            </td>
            <td className="px-4 py-2 text-right text-xs tabular-nums text-muted-foreground">
              {branch.lessons_last_30d}
            </td>
            <td className="px-4 py-2 text-right text-xs text-muted-foreground/40" colSpan={5}>
              -
            </td>
          </tr>
        ))
      )}
    </>
  );
}

export default async function FranchiseDashboardPage() {
  const { tenant, franchiseAccess, readOnlyDowngrade } =
    await requireFranchiseOperator();
  let overview: Awaited<ReturnType<typeof loadFranchiseOverview>> | null = null;
  let performance: Awaited<ReturnType<typeof loadFranchisePerformanceOverview>> | null = null;
  let governance: Awaited<ReturnType<typeof loadFranchiseGovernanceOverview>> | null = null;
  try {
    [overview, performance, governance] = await Promise.all([
      loadFranchiseOverview(tenant.id),
      loadFranchisePerformanceOverview(tenant.id),
      loadFranchiseGovernanceOverview(tenant.id),
    ]);
  } catch (error) {
    console.error("[franchise] dashboard load failed", error);
  }
  if (!overview || !performance || !governance) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Franchise Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            De franchisegegevens konden nog niet worden geladen voor {tenant.name}.
          </p>
        </div>
        <Card>
          <CardContent className="flex items-start gap-3 p-6">
            <AlertTriangle className="h-5 w-5 text-warning" aria-hidden />
            <div>
              <p className="font-medium text-foreground">
                Geen franchisecontext beschikbaar
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Controleer of deze tenant als franchisegever is ingericht en of
                de franchise-tabellen/migraties actief zijn.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  const hasFranchisees = overview.locations.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Franchise Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Overzicht van alle locaties binnen uw franchisenetwerk
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/backoffice/franchise/playbook">
            <Button variant="outline" size="sm">
              Franchise playbook
            </Button>
          </Link>
          <Link href="/backoffice/franchise/aandacht">
            <Button variant="outline" size="sm">
              Aandacht
            </Button>
          </Link>
          <Link href="/backoffice/franchise/prestaties">
            <Button variant="outline" size="sm">
              Prestaties
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
              Templates beheren
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4" aria-hidden />
              Omzettrend netwerk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-foreground">
              {performance.network.revenue_delta_pct === null
                ? "-"
                : `${performance.network.revenue_delta_pct}%`}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatRevenue(performance.network.current_revenue_cents)} in de laatste 30 dagen
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              Directe aandacht
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-foreground">
              {governance.high_priority_count}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              franchisees met directe centrale opvolging
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <Gauge className="h-4 w-4" aria-hidden />
              Gem. bezetting
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-foreground">
              {governance.average_capacity_utilisation === null
                ? "-"
                : `${governance.average_capacity_utilisation}%`}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              gemiddelde netwerkcapaciteit op basis van beschikbaarheid
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <BookOpenCheck className="h-4 w-4" aria-hidden />
              Template-adoptie
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-foreground">
              {governance.template_activation_rate}%
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              franchisees met actieve template-activatie
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Network className="h-4 w-4 text-muted-foreground" aria-hidden />
              Franchise is geen multi-vestiging
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
            <div className="rounded-lg border border-border px-3 py-3">
              Een franchisegever stuurt op meerdere zelfstandige tenants onder een formule, niet
              alleen op branches binnen een tenant.
            </div>
            <div className="rounded-lg border border-border px-3 py-3">
              Deze cockpit geeft centraal inzicht, vergelijking en routing-signalen zonder
              franchisee-data direct te muteren.
            </div>
            <div className="rounded-lg border border-border px-3 py-3">
              Lokale uitvoering blijft bij franchisee, vestigingsmanager of planner. Dat houdt de
              governance zuiver.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Besturingsroutes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <Link
              href="/backoffice/franchise/playbook"
              className="flex items-center justify-between rounded-lg border border-border px-3 py-3 transition-colors hover:bg-muted/40"
            >
              <span>
                <span className="block font-medium text-foreground">Franchise playbook</span>
                <span className="block text-xs">
                  Gebruik een bestuurlijke ingang voor governance, template-uitrol en netwerk-readiness.
                </span>
              </span>
              <BookOpenCheck className="h-4 w-4 text-muted-foreground" aria-hidden />
            </Link>
            <Link
              href="/backoffice/franchise/aandacht"
              className="flex items-center justify-between rounded-lg border border-border px-3 py-3 transition-colors hover:bg-muted/40"
            >
              <span>
                <span className="block font-medium text-foreground">Franchise aandacht</span>
                <span className="block text-xs">
                  Prioriteer opvolging, coachingsroutes en lokale vervolgstappen per franchisee.
                </span>
              </span>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" aria-hidden />
            </Link>
            <Link
              href="/backoffice/franchise/prestaties"
              className="flex items-center justify-between rounded-lg border border-border px-3 py-3 transition-colors hover:bg-muted/40"
            >
              <span>
                <span className="block font-medium text-foreground">Franchiseprestaties</span>
                <span className="block text-xs">
                  Volg omzet, lesvolume en netwerkbrede aandachtssignalen over 90 dagen.
                </span>
              </span>
              <TrendingUp className="h-4 w-4 text-muted-foreground" aria-hidden />
            </Link>
            <div className="rounded-lg border border-dashed border-border px-3 py-3">
              <div className="flex items-center gap-2 text-foreground">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden />
                Read-only governance
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Franchise-sturing blijft bewust leesgericht. Cross-tenant acties blijven expliciet
                en auditbaar.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Netwerkgezondheid</CardTitle>
            <p className="text-sm text-muted-foreground">
              Een managementlaag voor omzet, capaciteit, adoptie en directe aandacht.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {governance.rollout_gaps.map((item) => (
              <div key={item.label} className="rounded-lg border border-border px-3 py-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {item.label}
                </p>
                <p className="mt-1 text-xl font-semibold text-foreground">{item.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Coaching targets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            {governance.coaching_targets.length === 0 ? (
              <div className="rounded-lg border border-border px-3 py-3">
                Geen directe coachingtargets. Het netwerk draait stabiel op de huidige signalen.
              </div>
            ) : (
              governance.coaching_targets.slice(0, 4).map((target) => (
                <div key={target.tenant_id} className="rounded-lg border border-border px-3 py-3">
                  <p className="font-medium text-foreground">{target.tenant_name}</p>
                  <p className="mt-1 text-xs">{target.reason}</p>
                  <p className="mt-2 text-xs text-muted-foreground/80">{target.next_step}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: "Franchisees",
            value: overview.totals.franchisees,
            icon: Building2,
          },
          {
            label: "Actieve leerlingen",
            value: overview.totals.active_students,
            icon: Users,
          },
          {
            label: "Lessen (30 dgn)",
            value: overview.totals.lessons_last_30d,
            icon: BookOpen,
          },
          {
            label: "Omzet (30 dgn)",
            value: formatRevenue(overview.totals.revenue_last_30d_cents),
            icon: TrendingUp,
          },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-1 pt-4">
              <CardTitle className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <stat.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden />
            Locaties per franchisee
          </CardTitle>
        </CardHeader>

        {!hasFranchisees ? (
          <CardContent>
            <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-center">
              <Building2 className="h-8 w-8 text-muted-foreground/40" aria-hidden />
              <p className="text-sm text-muted-foreground">Nog geen franchisees gekoppeld.</p>
              <p className="text-xs text-muted-foreground/60">
                Vraag een platformbeheerder om franchisees te koppelen via het admin-paneel.
              </p>
            </div>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium" colSpan={2}>
                    Franchisee / Locatie
                  </th>
                  <th className="px-4 py-3 text-right font-medium">Leerlingen</th>
                  <th className="px-4 py-3 text-right font-medium">Lessen (30 dgn)</th>
                  <th className="px-4 py-3 text-right font-medium">Omzet (30 dgn)</th>
                  <th className="px-4 py-3 text-right font-medium">Slagings%</th>
                  <th className="px-4 py-3 text-right font-medium">Conversie%</th>
                  <th className="px-4 py-3 text-right font-medium">
                    <span className="inline-flex items-center justify-end gap-1">
                      <Gauge className="h-3.5 w-3.5" aria-hidden />
                      Bezetting
                    </span>
                  </th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {overview.locations.map((loc) => (
                  <FranchiseeRow key={loc.tenant_id} loc={loc} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>
          <strong>Bezetting</strong>: gereden lesminuten / beschikbare instructeurminuten
          (30 dgn). Toont - als er geen beschikbaarheidsblokken zijn ingesteld.
        </span>
        <span>
          Lessen- en omzetcijfers betreffen de afgelopen 30 dagen. Slagingspercentage toont alleen
          voltooide examens met geregistreerde uitslag.
        </span>
      </div>
    </div>
  );
}
