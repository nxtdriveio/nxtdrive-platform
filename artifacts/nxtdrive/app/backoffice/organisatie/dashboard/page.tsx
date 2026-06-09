import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Coins,
  Gauge,
  MapPin,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEuros } from "@/lib/invoices/types";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { loadOrganizationManagementOverview } from "@/lib/dashboard/management";

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

export default async function OrganizationDashboardPage() {
  const { tenant } = await requireActiveTenant([
    "tenant_admin",
    "franchise_admin",
    "branch_manager",
    "planner",
    "admin_staff",
    "marketing",
    "instructor",
  ]);

  const overview = await loadOrganizationManagementOverview(tenant.id, {
    branchScopeLabel: "Alle vestigingen",
  });
  const topBranches = overview.branches.slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <Link
            href="/backoffice/organisatie"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Terug naar organisatiebeheer
          </Link>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="primary">Sprint 9</Badge>
              <Badge variant="outline">{overview.branch_scope_label}</Badge>
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Organisatiedashboard
              </h1>
              <p className="text-sm text-muted-foreground">
                Centrale cockpit voor omzet, capaciteit, opvolging en vestigingsritme
                binnen {tenant.name}.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/backoffice/rapportages"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Naar rapportages
          </Link>
          <Link
            href="/backoffice/instellingen/vestigingen"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Vestigingen beheren
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Omzet 30 dagen"
          value={formatEuros(overview.totals.revenue_30d_cents)}
          description="Betaalde facturen van de afgelopen 30 dagen."
          icon={Coins}
        />
        <StatCard
          title="Geplande lessen"
          value={String(overview.totals.upcoming_lessons_7d)}
          description="Lessen die de komende 7 dagen al op de rit staan."
          icon={CalendarDays}
        />
        <StatCard
          title="Leadconversie"
          value={
            overview.totals.conversion_rate === null
              ? "-"
              : `${overview.totals.conversion_rate}%`
          }
          description="Conversie van leads naar leerling in de laatste 30 dagen."
          icon={Gauge}
        />
        <StatCard
          title="Actieve leerlingen"
          value={String(overview.totals.active_students)}
          description="Leerlingen met een actief dossier binnen zichtbare vestigingen."
          icon={Users}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Vestigingsritme</CardTitle>
            <p className="text-sm text-muted-foreground">
              Welke vestigingen trekken omzet en planning, en waar valt ritme weg?
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {topBranches.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
                <MapPin className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
                <p className="mt-3 font-medium text-foreground">Nog geen vestigingen</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Zodra vestigingen bestaan, verschijnt hier direct het managementritme.
                </p>
              </div>
            ) : (
              topBranches.map((branch) => (
                <div
                  key={branch.branch.id}
                  className="rounded-xl border border-border px-4 py-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground">{branch.branch.name}</p>
                        {!branch.branch.is_active ? (
                          <Badge variant="outline">Inactief</Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {branch.branch.city ?? "Locatie onbekend"} - {" "}
                        {branch.assigned_staff} medewerker
                        {branch.assigned_staff === 1 ? "" : "s"}
                      </p>
                    </div>
                    <Link
                      href={`/backoffice/instellingen/vestigingen/${branch.branch.id}/dashboard`}
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      Vestigingsdashboard
                      <ArrowUpRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg bg-muted/40 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Omzet 30 dagen
                      </p>
                      <p className="mt-1 font-semibold text-foreground">
                        {formatEuros(branch.revenue_30d_cents)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Lessen 7 dagen
                      </p>
                      <p className="mt-1 font-semibold text-foreground">
                        {branch.upcoming_lessons_7d}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Conversie
                      </p>
                      <p className="mt-1 font-semibold text-foreground">
                        {branch.conversion_rate === null ? "-" : `${branch.conversion_rate}%`}
                      </p>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Zonder vervolgles
                      </p>
                      <p className="mt-1 font-semibold text-foreground">
                        {branch.students_without_next_lesson}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">Managementsignalen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="rounded-lg border border-border px-3 py-3">
                <strong className="text-foreground">
                  {overview.health.branches_without_upcoming_lessons}
                </strong>{" "}
                vestiging
                {overview.health.branches_without_upcoming_lessons === 1 ? "" : "en"} zonder
                geplande lessen in de komende 7 dagen.
              </div>
              <div className="rounded-lg border border-border px-3 py-3">
                <strong className="text-foreground">
                  {overview.health.branches_without_assigned_staff}
                </strong>{" "}
                vestiging
                {overview.health.branches_without_assigned_staff === 1 ? "" : "en"} zonder
                toegewezen medewerkerscope.
              </div>
              <div className="rounded-lg border border-border px-3 py-3">
                <strong className="text-foreground">
                  {overview.totals.students_without_next_lesson}
                </strong>{" "}
                actieve leerling
                {overview.totals.students_without_next_lesson === 1 ? "" : "en"} zonder
                vervolgafspraak.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">Besturingsroutes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <Link
                href="/backoffice/rapportages"
                className="flex items-center justify-between rounded-lg border border-border px-3 py-3 transition-colors hover:bg-muted/40"
              >
                <span>
                  <span className="block font-medium text-foreground">Rapportages</span>
                  <span className="block text-xs">
                    Gebruik detailrapportages voor tijdvakken, bronnen en kwaliteit.
                  </span>
                </span>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground" aria-hidden />
              </Link>
              <Link
                href="/backoffice/instellingen/vestigingen"
                className="flex items-center justify-between rounded-lg border border-border px-3 py-3 transition-colors hover:bg-muted/40"
              >
                <span>
                  <span className="block font-medium text-foreground">Vestigingen</span>
                  <span className="block text-xs">
                    Ga van organisatiebeeld naar operationele vestigingsdashboards.
                  </span>
                </span>
                <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />
              </Link>
              <Link
                href="/backoffice/organisatie"
                className="flex items-center justify-between rounded-lg border border-border px-3 py-3 transition-colors hover:bg-muted/40"
              >
                <span>
                  <span className="block font-medium text-foreground">Organisatiebeheer</span>
                  <span className="block text-xs">
                    Werk structuur, rollen en vestigingen bij vanuit dezelfde managementlaag.
                  </span>
                </span>
                <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
