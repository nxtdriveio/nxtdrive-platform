import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarDays, ShieldCheck, TrendingDown, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireFranchiseOperator } from "@/lib/franchise/access";
import {
  loadFranchisePerformanceOverview,
  type FranchisePerformanceRow,
} from "@/lib/franchise/performance";

export const dynamic = "force-dynamic";

function routeLabel(route: FranchisePerformanceRow["follow_up_route"]) {
  if (route === "franchise-coaching") return "Franchise-coaching";
  if (route === "lokale-planning") return "Lokale planning";
  if (route === "kwaliteit") return "Kwaliteitsopvolging";
  if (route === "marketing") return "Marketing & intake";
  return "Bewaken";
}

function priorityVariant(priority: FranchisePerformanceRow["attention_priority"]) {
  if (priority === "hoog") return "danger" as const;
  if (priority === "middel") return "warning" as const;
  if (priority === "laag") return "outline" as const;
  return "outline" as const;
}

function priorityLabel(priority: FranchisePerformanceRow["attention_priority"]) {
  if (priority === "hoog") return "Hoge prioriteit";
  if (priority === "middel") return "Middel";
  if (priority === "laag") return "Laag";
  return "Stabiel";
}

function AttentionCard({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: FranchisePerformanceRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Geen franchisees in deze categorie.</p>
        ) : (
          items.map((item) => (
            <div key={item.tenant_id} className="rounded-lg border border-border px-3 py-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">{item.tenant_name}</p>
                  <p className="text-xs text-muted-foreground">{item.attention_reason}</p>
                </div>
                <Badge variant={priorityVariant(item.attention_priority)}>
                  {priorityLabel(item.attention_priority)}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{routeLabel(item.follow_up_route)}</Badge>
                <Badge variant="outline">{item.branch_count} vestiging(en)</Badge>
                <Badge variant="outline">{item.active_students} leerlingen</Badge>
              </div>
              <p className="text-sm text-foreground">{item.next_step}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export default async function FranchiseAttentionPage() {
  const { tenant } = await requireFranchiseOperator();
  const overview = await loadFranchisePerformanceOverview(tenant.id);

  const mediumPriority = overview.franchisees.filter((item) => item.attention_priority === "middel");
  const lowPriority = overview.franchisees.filter((item) => item.attention_priority === "laag");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <Link href="/backoffice/franchise" className="text-sm text-muted-foreground hover:text-foreground">
            ← Terug naar franchise dashboard
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Franchise aandacht</h1>
            <p className="text-sm text-muted-foreground">
              Bestuurscockpit voor opvolging binnen {tenant.name}. Combineer prestaties, planning en kwaliteitssignalen tot een duidelijke vervolgrichting per franchisee.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="primary">{overview.network.attention_count} actieve signalen</Badge>
            <Badge variant="outline">{overview.network.high_priority_count} hoog</Badge>
            <Badge variant="outline">Read-only governance</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/backoffice/franchise/prestaties">
            <Button variant="outline" size="sm">Prestaties</Button>
          </Link>
          <Link href="/backoffice/franchise/planning">
            <Button variant="outline" size="sm">Centrale planning</Button>
          </Link>
          <Link href="/backoffice/franchise/vergelijking">
            <Button variant="outline" size="sm">Vergelijking</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Hoge prioriteit</CardTitle>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                {overview.network.high_priority_count}
              </p>
            </div>
            <span className="rounded-full bg-primary-soft p-2 text-primary">
              <AlertTriangle className="h-5 w-5" aria-hidden />
            </span>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Directe aandacht nodig vanuit franchise-coaching of herstelsturing.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Planning-routes</CardTitle>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                {overview.franchisees.filter((item) => item.follow_up_route === "lokale-planning").length}
              </p>
            </div>
            <span className="rounded-full bg-primary-soft p-2 text-primary">
              <CalendarDays className="h-5 w-5" aria-hidden />
            </span>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Signalen die lokaal vooral via planning of capaciteit opgepakt moeten worden.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Kwaliteit & coaching</CardTitle>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                {overview.franchisees.filter((item) => item.follow_up_route === "kwaliteit" || item.follow_up_route === "franchise-coaching").length}
              </p>
            </div>
            <span className="rounded-full bg-primary-soft p-2 text-primary">
              <ShieldCheck className="h-5 w-5" aria-hidden />
            </span>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Franchisees die vooral instructiekwaliteit of direct coachingswerk vragen.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Marketing & intake</CardTitle>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                {overview.franchisees.filter((item) => item.follow_up_route === "marketing").length}
              </p>
            </div>
            <span className="rounded-full bg-primary-soft p-2 text-primary">
              <Users className="h-5 w-5" aria-hidden />
            </span>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Conversie- of intakevraagstukken die niet eerst via planning opgelost worden.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hoe je deze cockpit gebruikt</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 text-sm text-muted-foreground">
          <div className="rounded-lg border border-border px-3 py-3">
            1. Kijk eerst naar hoge prioriteit en bepaal of directe franchise-coaching nodig is.
          </div>
          <div className="rounded-lg border border-border px-3 py-3">
            2. Gebruik daarna de follow-up route om het signaal bij planning, kwaliteit of marketing te beleggen.
          </div>
          <div className="rounded-lg border border-border px-3 py-3">
            3. Houd uitvoering lokaal: deze pagina helpt sturen, niet muteren over tenants heen.
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <AttentionCard
          title="Directe aandacht"
          description="Franchisees die het snelst bestuurlijke opvolging nodig hebben."
          items={overview.watchlists.high_priority}
        />
        <AttentionCard
          title="Operationele opvolging"
          description="Middelprioriteit die vooral planning of kwaliteit lokaal moet oplossen."
          items={mediumPriority}
        />
        <AttentionCard
          title="Lichte signalen"
          description="Lagere urgentie, vaak rond conversie of lichte terugval."
          items={lowPriority}
        />
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-muted-foreground" aria-hidden />
            Volledige opvolgmatrix
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Franchisee</th>
                  <th className="px-4 py-3 font-medium">Prioriteit</th>
                  <th className="px-4 py-3 font-medium">Route</th>
                  <th className="px-4 py-3 text-right font-medium">Omzet delta</th>
                  <th className="px-4 py-3 text-right font-medium">Lesdelta</th>
                  <th className="px-4 py-3 text-right font-medium">Conversie</th>
                  <th className="px-4 py-3 text-right font-medium">Slagings%</th>
                  <th className="px-4 py-3 text-right font-medium">Bezetting</th>
                  <th className="px-4 py-3 font-medium">Volgende stap</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {overview.franchisees.map((row) => (
                  <tr key={row.tenant_id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{row.tenant_name}</div>
                      <div className="text-xs text-muted-foreground">{row.attention_reason}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={priorityVariant(row.attention_priority)}>
                        {priorityLabel(row.attention_priority)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{routeLabel(row.follow_up_route)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">{row.revenue_delta_pct === null ? "—" : `${row.revenue_delta_pct}%`}</td>
                    <td className="px-4 py-3 text-right">{row.lesson_delta > 0 ? `+${row.lesson_delta}` : row.lesson_delta}</td>
                    <td className="px-4 py-3 text-right">{row.lead_conversion_rate === null ? "—" : `${row.lead_conversion_rate}%`}</td>
                    <td className="px-4 py-3 text-right">{row.exam_pass_rate === null ? "—" : `${row.exam_pass_rate}%`}</td>
                    <td className="px-4 py-3 text-right">{row.capacity_utilisation === null ? "—" : `${row.capacity_utilisation}%`}</td>
                    <td className="px-4 py-3 text-sm text-foreground">
                      <span className="inline-flex items-start gap-2">
                        <ArrowRight className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                        <span>{row.next_step}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
