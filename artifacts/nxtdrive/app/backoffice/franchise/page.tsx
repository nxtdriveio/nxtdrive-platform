import { notFound } from "next/navigation";
import Link from "next/link";
import {
  BarChart3,
  Building2,
  Users,
  BookOpen,
  TrendingUp,
  ExternalLink,
  MapPin,
  Gauge,
} from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { loadFranchiseOverview } from "@/lib/franchise/overview";
import type { FranchiseeLocation } from "@/lib/franchise/overview";
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
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const colour =
    value >= 70
      ? "text-green-500"
      : value >= 50
        ? "text-yellow-500"
        : "text-red-400";
  return <span className={colour}>{value}%</span>;
}

function CapacityBar({ value }: { value: number | null }) {
  if (value === null)
    return <span className="text-muted-foreground text-xs">—</span>;
  const colour =
    value >= 80
      ? "bg-green-500"
      : value >= 50
        ? "bg-yellow-400"
        : "bg-red-400";
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${colour}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="tabular-nums text-foreground text-xs w-8 text-right">
        {value}%
      </span>
    </div>
  );
}

function FranchiseeRow({ loc }: { loc: FranchiseeLocation }) {
  const activeBranches = loc.branches.filter((b) => b.is_active);

  return (
    <>
      {/* Tenant header row */}
      <tr className="bg-muted/30 border-t-2 border-border">
        <td className="px-4 py-2.5" colSpan={2}>
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
            <span className="font-semibold text-foreground">{loc.tenant_name}</span>
            {activeBranches.length > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {activeBranches.length}{" "}
                {activeBranches.length === 1 ? "vestiging" : "vestigingen"}
              </Badge>
            )}
          </div>
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-foreground">
          {loc.active_students}
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-foreground">
          {loc.lessons_last_30d}
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-foreground">
          {formatRevenue(loc.revenue_last_30d_cents)}
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
          <PassRate value={loc.exam_pass_rate} />
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-foreground">
          {loc.lead_conversion_rate !== null ? (
            `${loc.lead_conversion_rate}%`
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
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

      {/* Per-branch detail rows */}
      {activeBranches.length === 0 ? (
        <tr className="border-t border-dashed border-border/50">
          <td className="px-4 py-2 pl-10" colSpan={9}>
            <span className="text-xs text-muted-foreground/60 italic">
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
                {branch.city && (
                  <span className="text-xs text-muted-foreground/60">
                    · {branch.city}
                  </span>
                )}
              </div>
            </td>
            <td className="px-4 py-2 text-right tabular-nums text-xs text-muted-foreground">
              {branch.active_students}
            </td>
            <td className="px-4 py-2 text-right tabular-nums text-xs text-muted-foreground">
              {branch.lessons_last_30d}
            </td>
            {/* Revenue / exam / conversion / capacity are not branch-scoped yet */}
            <td className="px-4 py-2 text-right text-xs text-muted-foreground/40" colSpan={5}>
              —
            </td>
          </tr>
        ))
      )}
    </>
  );
}

export default async function FranchiseDashboardPage() {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "franchise_admin",
  ]);

  const { tenantHasFeature } = await import("@/lib/platform/features");
  if (!tenantHasFeature(tenant, "franchise_as_franchisegever")) {
    notFound();
  }

  const service = createServiceRoleClient();

  // Verify this tenant is a franchisegever: it must not itself be a franchisee
  // (parent_tenant_id IS NULL). org_type is informational and not required here —
  // the sidebar link (isFranchisegever) already gates navigation.
  const { data: tenantRow } = await service
    .from("tenants")
    .select("id, parent_tenant_id")
    .eq("id", tenant.id)
    .single();

  if (!tenantRow || tenantRow.parent_tenant_id !== null) {
    notFound();
  }

  const overview = await loadFranchiseOverview(tenant.id);
  const hasFranchisees = overview.locations.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Franchise Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Overzicht van alle locaties binnen uw franchisenetwerk
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/backoffice/franchise/templates">
            <Button variant="outline" size="sm">
              Templates beheren
            </Button>
          </Link>
        </div>
      </div>

      {/* Totals strip */}
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

      {/* Per-franchisee / per-branch table */}
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
              <p className="text-sm text-muted-foreground">
                Nog geen franchisees gekoppeld.
              </p>
              <p className="text-xs text-muted-foreground/60">
                Vraag een platformbeheerder om franchisees te koppelen via het
                admin-paneel.
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
                    <span className="inline-flex items-center gap-1 justify-end">
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

      {/* Legend / info */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>
          <strong>Bezetting</strong>: gereden lesminuten / beschikbare
          instructeurminuten (30 dgn). Toont — als er geen beschikbaarheidsblokken
          zijn ingesteld.
        </span>
        <span>
          Lessen-/omzetcijfers betreffen de afgelopen 30 dagen.
          Slagingspercentage: voltooide examens met geregistreerde uitslag.
        </span>
      </div>
    </div>
  );
}
