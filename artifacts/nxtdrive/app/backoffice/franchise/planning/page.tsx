import Link from "next/link";
import { AlertTriangle, CalendarDays, Clock3, Network, ShieldCheck, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireFranchiseOperator } from "@/lib/franchise/access";
import { loadFranchiseContext } from "@/lib/franchise/context";
import { loadFranchisePlanningOverview } from "@/lib/franchise/planning";

export const dynamic = "force-dynamic";

const dateTimeFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function StatCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: string;
  description: string;
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
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

export default async function FranchisePlanningPage() {
  const { tenant } = await requireFranchiseOperator();

  const [franchiseContext, planning] = await Promise.all([
    loadFranchiseContext(tenant.id),
    loadFranchisePlanningOverview(tenant.id),
  ]);

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
              Centrale planning
            </h1>
            <p className="text-sm text-muted-foreground">
              Read-only planningsradar voor {franchiseContext.franchisegever_name}. Bekijk waar de komende {planning.horizon_days} dagen weinig of geen lesactiviteit staat.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="primary">{franchiseContext.franchisees.length} franchisees</Badge>
            <Badge variant="outline">Read-only over tenants heen</Badge>
            <Badge variant="outline">Geen cross-tenant mutaties</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
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
          <Link href="/backoffice/franchise/vergelijking">
            <Button variant="outline" size="sm">
              Vergelijk franchisees
            </Button>
          </Link>
          <Link href="/backoffice/franchise/templates">
            <Button variant="outline" size="sm">
              Templates
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Franchisees"
          value={String(franchiseContext.franchisees.length)}
          description="Alle gekoppelde franchisees in dit netwerk."
          icon={Network}
        />
        <StatCard
          title="Lessen 7 dagen"
          value={String(planning.total_upcoming_lessons)}
          description="Alle komende lessen over het hele franchisenetwerk."
          icon={CalendarDays}
        />
        <StatCard
          title="Vestigingen zonder lessen"
          value={String(planning.branches_without_lessons)}
          description="Locaties die de komende week nog geen geplande lesactiviteit hebben."
          icon={AlertTriangle}
        />
        <StatCard
          title="Governance"
          value="Read-only"
          description="Franchiseplanning geeft centraal inzicht, maar schrijft niet in franchisee-data."
          icon={ShieldCheck}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hoe je deze cockpit gebruikt</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 text-sm text-muted-foreground">
          <div className="rounded-lg border border-border px-3 py-3">
            1. Kijk centraal welke franchisees of vestigingen te weinig lesactiviteit hebben.
          </div>
          <div className="rounded-lg border border-border px-3 py-3">
            2. Gebruik dit om lokale planners of vestigingsmanagers te sturen, niet om hun planning direct over te nemen.
          </div>
          <div className="rounded-lg border border-border px-3 py-3">
            3. Houd franchise-inzicht en multi-vestiging gescheiden: dit scherm werkt tenant-overstijgend, gewone vestigingsplanning niet.
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Vestigingen met laagste komende activiteit</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {planning.branches.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              Nog geen franchise-vestigingen beschikbaar.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Franchisee</th>
                    <th className="px-4 py-3 font-medium">Vestiging</th>
                    <th className="px-4 py-3 text-right font-medium">Komende lessen</th>
                    <th className="px-4 py-3 text-right font-medium">Eerste les</th>
                    <th className="px-4 py-3 text-right font-medium">Signaal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {planning.branches.map((branch) => (
                    <tr key={branch.branch_id}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{branch.tenant_name}</div>
                        <div className="text-xs text-muted-foreground">{branch.tenant_slug}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{branch.branch_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {branch.city ?? "Plaats niet ingesteld"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Badge
                          variant={branch.upcoming_lessons_7d === 0 ? "warning" : "outline"}
                        >
                          {branch.upcoming_lessons_7d}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {branch.next_lesson_at ? (
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="h-3.5 w-3.5" aria-hidden />
                            {dateTimeFmt.format(new Date(branch.next_lesson_at))}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs text-muted-foreground">
                          {branch.upcoming_lessons_7d === 0
                            ? "Lokale opvolging nodig"
                            : "Binnen lokale planning"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>
          <strong>Vervolgroute</strong>: combineer deze planningsradar met de aandacht-cockpit om prioriteit, coaching en lokale opvolging scherper te kiezen.
        </span>
        <span>
          Gebruik lokale opvolging voor uitvoering; dit scherm blijft tenant-overstijgend read-only.
        </span>
      </div>
    </div>
  );
}
