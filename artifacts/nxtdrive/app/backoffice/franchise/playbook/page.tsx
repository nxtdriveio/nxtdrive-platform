import Link from "next/link";
import {
  AlertTriangle,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  Network,
  ShieldCheck,
  TrendingUp,
  Workflow,
} from "lucide-react";
import { FranchiseDowngradeAlert } from "@/components/backoffice/franchise-downgrade-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireFranchiseOperator } from "@/lib/franchise/access";
import { loadFranchiseGovernanceOverview } from "@/lib/franchise/governance";
import { PLAN_LABELS } from "@/lib/platform/features";

export const dynamic = "force-dynamic";

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
          <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
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

export default async function FranchisePlaybookPage() {
  const { tenant, franchiseAccess, readOnlyDowngrade } =
    await requireFranchiseOperator();
  const governance = await loadFranchiseGovernanceOverview(tenant.id);

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
              Franchise playbook
            </h1>
            <p className="text-sm text-muted-foreground">
              Bestuurlijke cockpit voor {governance.franchisegever_name}. Combineer governance, template-adoptie, aandacht en planning in één read-only stuurlaag.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="primary">Sprint 7 wrap-up</Badge>
            <Badge variant="outline">Read-only governance</Badge>
            <Badge variant="outline">Geen cross-tenant mutaties</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/backoffice/franchise/aandacht">
            <Button variant="outline" size="sm">Aandacht</Button>
          </Link>
          <Link href="/backoffice/franchise/prestaties">
            <Button variant="outline" size="sm">Prestaties</Button>
          </Link>
          <Link href="/backoffice/franchise/planning">
            <Button variant="outline" size="sm">Planning</Button>
          </Link>
          <Link href="/backoffice/franchise/templates">
            <Button variant="outline" size="sm">Templates</Button>
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
          title="Template adoptie"
          value={`${governance.template_activation_rate}%`}
          description="Hoeveel franchisees minimaal één actieve template-activatie hebben."
          icon={BookOpenCheck}
        />
        <StatCard
          title="Directe aandacht"
          value={String(governance.high_priority_count)}
          description="Franchisees die nu eerst coaching of centrale opvolging nodig hebben."
          icon={AlertTriangle}
        />
        <StatCard
          title="Planningsbasis"
          value={String(governance.branches_without_lessons)}
          description="Vestigingen zonder lessen in de komende 7 dagen."
          icon={CalendarDays}
        />
        <StatCard
          title="Gem. bezetting"
          value={
            governance.average_capacity_utilisation === null
              ? "—"
              : `${governance.average_capacity_utilisation}%`
          }
          description="Gemiddelde capaciteit op netwerkniveau waar beschikbaarheidsdata aanwezig is."
          icon={TrendingUp}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Workflow className="h-4 w-4 text-muted-foreground" aria-hidden />
              Besturingsmodel Sprint 7
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 text-sm text-muted-foreground">
            <div className="rounded-lg border border-border px-3 py-3">
              <span className="block font-medium text-foreground">1. Eerst signaleren</span>
              Start bij aandacht en prestaties om te zien welke franchisees achterblijven.
            </div>
            <div className="rounded-lg border border-border px-3 py-3">
              <span className="block font-medium text-foreground">2. Dan routeren</span>
              Kies vervolgens de juiste route: coaching, lokale planning, kwaliteit of marketing.
            </div>
            <div className="rounded-lg border border-border px-3 py-3">
              <span className="block font-medium text-foreground">3. Standaardiseren</span>
              Gebruik templates om commerciële of operationele standaarden uit te rollen zonder aparte codepaden.
            </div>
            <div className="rounded-lg border border-border px-3 py-3">
              <span className="block font-medium text-foreground">4. Governance bewaken</span>
              Franchise blijft read-only over tenants heen; lokale uitvoering blijft binnen franchisee of vestiging.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden />
              Governance status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-lg border border-border px-3 py-3">
              <div className="font-medium text-foreground">{governance.franchisees_total} franchisees in netwerk</div>
              <div className="text-xs">{governance.franchisees_without_active_branches} zonder actieve vestigingsbasis.</div>
            </div>
            <div className="rounded-lg border border-border px-3 py-3">
              <div className="font-medium text-foreground">{governance.active_templates} actieve templates</div>
              <div className="text-xs">{governance.inactive_templates} inactief of nog niet bruikbaar voor uitrol.</div>
            </div>
            <div className="rounded-lg border border-border px-3 py-3">
              <div className="font-medium text-foreground">{governance.attention_count} netwerkbrede signalen</div>
              <div className="text-xs">Waarvan {governance.high_priority_count} direct prioriteit heeft.</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-4 w-4 text-muted-foreground" aria-hidden />
            Rollout gaps
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {governance.rollout_gaps.map((gap) => (
            <div key={gap.label} className="rounded-lg border border-border px-3 py-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{gap.label}</div>
              <div className="mt-1 text-2xl font-semibold text-foreground">{gap.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{gap.detail}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Coaching targets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {governance.coaching_targets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              Geen high-priority franchisees op dit moment. Gebruik prestaties en planning voor periodieke bewaking.
            </div>
          ) : (
            governance.coaching_targets.map((target) => (
              <div key={target.tenant_id} className="rounded-lg border border-border px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-foreground">{target.tenant_name}</div>
                    <div className="text-sm text-muted-foreground">{target.reason}</div>
                  </div>
                  <Badge variant="danger">Directe opvolging</Badge>
                </div>
                <div className="mt-3 text-sm text-muted-foreground">
                  <strong className="text-foreground">Volgende stap:</strong> {target.next_step}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>
          <strong>Sprint 7 canon</strong>: franchise is een tenant-overstijgende stuurlaag, geen gewone multi-vestiging met centrale schrijfbevoegdheid.
        </span>
        <span>
          Gebruik deze playbook-pagina als ingang; voer daarna opvolging uit via aandacht, planning, prestaties of templates.
        </span>
      </div>
    </div>
  );
}
