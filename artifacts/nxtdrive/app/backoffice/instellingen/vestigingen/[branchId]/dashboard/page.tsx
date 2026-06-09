import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Coins,
  Gauge,
  MapPin,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEuros } from "@/lib/invoices/types";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { loadBranchManagementOverview } from "@/lib/dashboard/management";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

type MembershipBranchRow = {
  membership_id: string;
  branch_id: string;
};

async function canAccessBranchDashboard(
  branchId: string,
  memberships: Array<{
    id: string;
    branch_scope_type: "all" | "branches";
    tenant_id: string;
  }>,
) {
  if (memberships.some((membership) => membership.branch_scope_type === "all")) {
    return true;
  }

  const scopedMembershipIds = memberships.map((membership) => membership.id);
  if (scopedMembershipIds.length === 0) return false;

  const service = createServiceRoleClient();
  const result = await service
    .from("membership_branches")
    .select("membership_id, branch_id")
    .in("membership_id", scopedMembershipIds)
    .eq("branch_id", branchId);

  if (result.error) {
    throw new Error(`Vestigingstoegang laden mislukt: ${result.error.message}`);
  }

  return ((result.data ?? []) as MembershipBranchRow[]).length > 0;
}

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

export default async function BranchDashboardPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId } = await params;
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "franchise_admin",
    "branch_manager",
    "planner",
    "admin_staff",
    "marketing",
    "instructor",
  ]);

  const tenantMemberships = user.memberships.filter((membership) => membership.tenant_id === tenant.id);
  const canAccess = await canAccessBranchDashboard(branchId, tenantMemberships);
  if (!canAccess) {
    notFound();
  }

  const overview = await loadBranchManagementOverview(tenant.id, branchId, {
    branchScopeLabel: "Vestigingsscope",
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <Link
            href="/backoffice/instellingen/vestigingen"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Terug naar vestigingen
          </Link>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="primary">Vestigingsdashboard</Badge>
              <Badge variant="outline">{overview.branch_scope_label}</Badge>
              {!overview.branch.branch.is_active ? (
                <Badge variant="outline">Inactief</Badge>
              ) : null}
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {overview.branch.branch.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                Operationeel overzicht voor {overview.branch.branch.city ?? "deze vestiging"}.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Omzet 30 dagen"
          value={formatEuros(overview.branch.revenue_30d_cents)}
          description={`Gemiddelde organisatie: ${formatEuros(
            overview.organization_average_revenue_30d_cents,
          )}`}
          icon={Coins}
        />
        <StatCard
          title="Lessen 7 dagen"
          value={String(overview.branch.upcoming_lessons_7d)}
          description={`Organisatiegemiddelde: ${overview.organization_average_upcoming_lessons_7d}`}
          icon={CalendarDays}
        />
        <StatCard
          title="Leadconversie"
          value={
            overview.branch.conversion_rate === null
              ? "-"
              : `${overview.branch.conversion_rate}%`
          }
          description={
            overview.organization_average_conversion_rate === null
              ? "Nog geen organisatiebenchmark beschikbaar."
              : `Organisatiegemiddelde: ${overview.organization_average_conversion_rate}%`
          }
          icon={Gauge}
        />
        <StatCard
          title="Actieve leerlingen"
          value={String(overview.branch.active_students)}
          description="Leerlingen met een actief dossier binnen deze vestiging."
          icon={Users}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Vestigingssnapshot</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border px-3 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Geplande lessen 7 dagen
              </p>
              <p className="mt-1 text-xl font-semibold text-foreground">
                {overview.branch.upcoming_lessons_7d}
              </p>
            </div>
            <div className="rounded-lg border border-border px-3 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Gereden lessen 30 dagen
              </p>
              <p className="mt-1 text-xl font-semibold text-foreground">
                {overview.branch.completed_lessons_30d}
              </p>
            </div>
            <div className="rounded-lg border border-border px-3 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Open facturen
              </p>
              <p className="mt-1 text-xl font-semibold text-foreground">
                {overview.branch.open_invoices}
              </p>
            </div>
            <div className="rounded-lg border border-border px-3 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Zonder vervolgles
              </p>
              <p className="mt-1 text-xl font-semibold text-foreground">
                {overview.branch.students_without_next_lesson}
              </p>
            </div>
            <div className="rounded-lg border border-border px-3 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Leads 30 dagen
              </p>
              <p className="mt-1 text-xl font-semibold text-foreground">
                {overview.branch.leads_30d}
              </p>
            </div>
            <div className="rounded-lg border border-border px-3 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Medewerkerscope
              </p>
              <p className="mt-1 text-xl font-semibold text-foreground">
                {overview.branch.assigned_staff}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">Aandachtspunten</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {overview.branch.watchlist.length === 0 ? (
                <div className="rounded-lg border border-border px-3 py-3">
                  Geen directe signalen. Deze vestiging draait stabiel op de huidige
                  managementregels.
                </div>
              ) : (
                overview.branch.watchlist.map((item) => (
                  <div key={item} className="rounded-lg border border-border px-3 py-3">
                    {item}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">Navigatie</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <Link
                href="/backoffice/rapportages"
                className="flex items-center justify-between rounded-lg border border-border px-3 py-3 transition-colors hover:bg-muted/40"
              >
                <span>
                  <span className="block font-medium text-foreground">Rapportages</span>
                  <span className="block text-xs">
                    Bekijk dieper tijdvak- en kwaliteitsdata vanuit dezelfde vestiging.
                  </span>
                </span>
                <Gauge className="h-4 w-4 text-muted-foreground" aria-hidden />
              </Link>
              <Link
                href="/backoffice/instellingen/vestigingen"
                className="flex items-center justify-between rounded-lg border border-border px-3 py-3 transition-colors hover:bg-muted/40"
              >
                <span>
                  <span className="block font-medium text-foreground">Vestigingen</span>
                  <span className="block text-xs">
                    Schakel terug naar het organisatieoverzicht of bewerk deze locatie.
                  </span>
                </span>
                <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
