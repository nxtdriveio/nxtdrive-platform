import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDownWideNarrow, ArrowUpWideNarrow, BarChart3, Gauge, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { loadFranchiseContext } from "@/lib/franchise/context";
import {
  loadFranchiseOverview,
  type FranchiseeLocation,
} from "@/lib/franchise/overview";
import { tenantHasFeature } from "@/lib/platform/features";

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

function leaderboard<T>(
  items: T[],
  pick: (item: T) => number | null,
  direction: "desc" | "asc" = "desc",
): T[] {
  return [...items]
    .filter((item) => pick(item) !== null)
    .sort((a, b) => {
      const left = pick(a) ?? 0;
      const right = pick(b) ?? 0;
      return direction === "desc" ? right - left : left - right;
    })
    .slice(0, 3);
}

function LeaderboardCard({
  title,
  description,
  items,
  renderValue,
  icon: Icon,
}: {
  title: string;
  description: string;
  items: FranchiseeLocation[];
  renderValue: (item: FranchiseeLocation) => string;
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
          <p className="text-sm text-muted-foreground">Nog onvoldoende data.</p>
        ) : (
          items.map((item, index) => (
            <div
              key={`${item.tenant_name}-${index}`}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-3"
            >
              <div>
                <p className="font-medium text-foreground">{item.tenant_name}</p>
                <p className="text-xs text-muted-foreground">
                  {item.branches.length} vestiging(en)
                </p>
              </div>
              <Badge variant={index === 0 ? "primary" : "outline"}>
                {renderValue(item)}
              </Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export default async function FranchiseComparisonPage() {
  const { tenant } = await requireActiveTenant(["tenant_admin", "franchise_admin"]);

  if (!tenantHasFeature(tenant, "franchise_as_franchisegever")) {
    notFound();
  }

  if (tenant.parent_tenant_id) {
    notFound();
  }

  const [franchiseContext, overview] = await Promise.all([
    loadFranchiseContext(tenant.id),
    loadFranchiseOverview(tenant.id),
  ]);

  const strongestRevenue = leaderboard(
    overview.locations,
    (item) => item.revenue_last_30d_cents,
  );
  const strongestConversion = leaderboard(
    overview.locations,
    (item) => item.lead_conversion_rate,
  );
  const weakestCapacity = leaderboard(
    overview.locations,
    (item) => item.capacity_utilisation,
    "asc",
  );
  const weakestPassRate = leaderboard(
    overview.locations,
    (item) => item.exam_pass_rate,
    "asc",
  );

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
              Franchisevergelijking
            </h1>
            <p className="text-sm text-muted-foreground">
              Vergelijk franchisees binnen {franchiseContext.franchisegever_name} op omzet, conversie, bezetting en slagingspercentage zonder de scheiding tussen tenants te doorbreken.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="primary">{franchiseContext.franchisees.length} franchisees</Badge>
            <Badge variant="outline">Benchmarking</Badge>
            <Badge variant="outline">Read-only</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/backoffice/franchise/planning">
            <Button variant="outline" size="sm">
              Centrale planning
            </Button>
          </Link>
          <Link href="/backoffice/franchise/templates">
            <Button variant="outline" size="sm">
              Templates
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Franchise versus multi-vestiging</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 text-sm text-muted-foreground">
          <div className="rounded-lg border border-border px-3 py-3">
            Franchisevergelijking werkt tenant-overstijgend en vergelijkt zelfstandige organisaties onder één formule.
          </div>
          <div className="rounded-lg border border-border px-3 py-3">
            Een multi-vestiging tenant stuurt intern op branches; een franchisegever stuurt op franchisees én hun lokale vestigingen.
          </div>
          <div className="rounded-lg border border-border px-3 py-3">
            Deze cockpit geeft inzicht en benchmarking, maar geen recht om in franchisee-data te schrijven.
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <LeaderboardCard
          title="Sterkste omzet"
          description="Top franchisees op betaalde omzet in de afgelopen 30 dagen."
          items={strongestRevenue}
          renderValue={(item) => formatRevenue(item.revenue_last_30d_cents)}
          icon={TrendingUp}
        />
        <LeaderboardCard
          title="Sterkste leadconversie"
          description="Wie zet aanvragen het best om naar gewonnen leads."
          items={strongestConversion}
          renderValue={(item) => `${item.lead_conversion_rate ?? 0}%`}
          icon={ArrowUpWideNarrow}
        />
        <LeaderboardCard
          title="Laagste bezetting"
          description="Locaties met de meeste ruimte of de grootste planningsaandacht."
          items={weakestCapacity}
          renderValue={(item) =>
            item.capacity_utilisation === null ? "—" : `${item.capacity_utilisation}%`
          }
          icon={Gauge}
        />
        <LeaderboardCard
          title="Laagste slagingspercentages"
          description="Gebruik dit voor coaching en centrale kwaliteitsbewaking."
          items={weakestPassRate}
          renderValue={(item) =>
            item.exam_pass_rate === null ? "—" : `${item.exam_pass_rate}%`
          }
          icon={ArrowDownWideNarrow}
        />
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden />
            Alle franchisees naast elkaar
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Franchisee</th>
                  <th className="px-4 py-3 text-right font-medium">Vestigingen</th>
                  <th className="px-4 py-3 text-right font-medium">Leerlingen</th>
                  <th className="px-4 py-3 text-right font-medium">Lessen (30 dgn)</th>
                  <th className="px-4 py-3 text-right font-medium">Omzet</th>
                  <th className="px-4 py-3 text-right font-medium">Conversie</th>
                  <th className="px-4 py-3 text-right font-medium">Slagings%</th>
                  <th className="px-4 py-3 text-right font-medium">Bezetting</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {overview.locations.map((location) => (
                  <tr key={location.tenant_id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{location.tenant_name}</div>
                      <div className="text-xs text-muted-foreground">{location.tenant_slug}</div>
                    </td>
                    <td className="px-4 py-3 text-right">{location.branches.length}</td>
                    <td className="px-4 py-3 text-right">{location.active_students}</td>
                    <td className="px-4 py-3 text-right">{location.lessons_last_30d}</td>
                    <td className="px-4 py-3 text-right">{formatRevenue(location.revenue_last_30d_cents)}</td>
                    <td className="px-4 py-3 text-right">
                      {location.lead_conversion_rate === null ? "—" : `${location.lead_conversion_rate}%`}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {location.exam_pass_rate === null ? "—" : `${location.exam_pass_rate}%`}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {location.capacity_utilisation === null ? "—" : `${location.capacity_utilisation}%`}
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
          Gebruik deze pagina om verschillen zichtbaar te maken en daarna lokaal op te volgen via planners, vestigingsmanagers of franchisecoaching.
        </span>
      </div>
    </div>
  );
}
