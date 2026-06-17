import Link from "next/link";
import { KeyRound, ShieldCheck, Users, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  effectiveRolePermissions,
  governanceRoles,
  isBranchScopedGovernanceRole,
  listOrganizationRolePermissionOverrides,
  requireOrganizationPermission,
  roleGovernanceDefinition,
  roleScopeLabel,
} from "@/lib/organization";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { MemberRole } from "@/lib/types";

export const dynamic = "force-dynamic";

type MembershipCountRow = { role: MemberRole };

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

export default async function OrganizationRolesPage() {
  const { organization } = await requireOrganizationPermission("user:manage");
  const service = createServiceRoleClient();
  const roles = governanceRoles();

  const [membershipCountsResult, overrides] = await Promise.all([
    service
      .from("memberships")
      .select("role")
      .eq("tenant_id", organization.id)
      .in("role", [...roles]),
    listOrganizationRolePermissionOverrides(service, organization.id),
  ]);

  if (membershipCountsResult.error) {
    throw new Error(`Kon rolverdeling niet laden: ${membershipCountsResult.error.message}`);
  }

  const membershipCounts = ((membershipCountsResult.data ?? []) as MembershipCountRow[]).reduce<Record<string, number>>(
    (acc, row) => {
      acc[row.role] = (acc[row.role] ?? 0) + 1;
      return acc;
    },
    {},
  );

  const totalOverrides = overrides.length;
  const branchScopedRoles = roles.filter((role) => isBranchScopedGovernanceRole(role)).length;
  const rolesWithOverrides = new Set(overrides.map((override) => override.role)).size;
  const totalMembers = Object.values(membershipCounts).reduce((sum, count) => sum + count, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="primary">Rollen</Badge>
            <Badge variant="outline">Governance canon</Badge>
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Rolgovernance
            </h1>
            <p className="text-sm text-muted-foreground">
              Gebruik deze canon om de juiste basisrol te kiezen voordat je branch-scope of tenant-overrides inzet.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/backoffice/medewerkers"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Medewerkers beheren
          </Link>
          <Link
            href="/backoffice/organisatie/permissies"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Permissies beheren
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Governance rollen"
          value={String(roles.length)}
          description="Canonieke backoffice- en operationele rollen voor deze organisatiestructuur."
          icon={ShieldCheck}
        />
        <StatCard
          title="Vestiging-scoped"
          value={String(branchScopedRoles)}
          description="Rollen die meestal per vestiging begrensd horen te worden."
          icon={Workflow}
        />
        <StatCard
          title="Medewerkers"
          value={String(totalMembers)}
          description="Aantal medewerkers dat momenteel over deze rollen is verdeeld."
          icon={Users}
        />
        <StatCard
          title="Overrides actief"
          value={String(totalOverrides)}
          description="Tenant-specifieke rolpermissie-afwijkingen bovenop de standaard registry."
          icon={KeyRound}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Governance regels</CardTitle>
          <p className="text-sm text-muted-foreground">
            Eerst de juiste rol, daarna pas scope en uitzonderingen. Zo blijft het platform schaalbaar van kleine rijschool tot franchise-structuur.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-xl border border-border px-4 py-4 text-sm text-muted-foreground">
            Een verkeerde basisrol later repareren is duurder dan een extra branch-selectie of teamkoppeling nu goed zetten.
          </div>
          <div className="rounded-xl border border-border px-4 py-4 text-sm text-muted-foreground">
            Branch-scoped rollen horen standaard lokaal te blijven; organisatiebrede toegang is een bewuste uitzondering.
          </div>
          <div className="rounded-xl border border-border px-4 py-4 text-sm text-muted-foreground">
            Tenant-overrides zijn voor uitzonderingen, niet als vervanging van de rolcanon.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Van canon naar uitvoering</CardTitle>
          <p className="text-sm text-muted-foreground">
            Gebruik overal dezelfde volgorde: rol kiezen, scope begrenzen en pas daarna uitzonderingen in permissies vastleggen.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Link
            href="/backoffice/medewerkers"
            className="rounded-xl border border-border px-4 py-4 transition-colors hover:border-primary/30 hover:bg-muted/40"
          >
            <p className="font-medium text-foreground">1. Medewerkers</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Nodig mensen uit, kies de juiste basisrol en ga daarna pas naar detailbeheer.
            </p>
          </Link>
          <Link
            href="/backoffice/organisatie/permissies"
            className="rounded-xl border border-border px-4 py-4 transition-colors hover:border-primary/30 hover:bg-muted/40"
          >
            <p className="font-medium text-foreground">2. Permissies</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Leg alleen tenant-specifieke afwijkingen vast wanneer de standaardrol operationeel niet genoeg is.
            </p>
          </Link>
          <Link
            href="/backoffice/organisatie/teams"
            className="rounded-xl border border-border px-4 py-4 transition-colors hover:border-primary/30 hover:bg-muted/40"
          >
            <p className="font-medium text-foreground">3. Teams</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Organiseer samenwerking operationeel, zonder het rol- en rechtenmodel te vervormen.
            </p>
          </Link>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {roles.map((role) => {
          const definition = roleGovernanceDefinition(role);
          const roleOverrides = overrides.filter((override) => override.role === role).length;
          const permissionCount = effectiveRolePermissions(role, overrides).length;
          const memberCount = membershipCounts[role] ?? 0;

          return (
            <Card key={role}>
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-foreground">{definition.label}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">{definition.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="primary">{roleScopeLabel(role)}</Badge>
                    <Badge variant="outline">{memberCount} medewerker(s)</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-border px-3 py-3">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Effectieve rechten</p>
                    <p className="mt-2 text-xl font-semibold text-foreground">{permissionCount}</p>
                  </div>
                  <div className="rounded-xl border border-border px-3 py-3">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Overrides</p>
                    <p className="mt-2 text-xl font-semibold text-foreground">{roleOverrides}</p>
                  </div>
                  <div className="rounded-xl border border-border px-3 py-3">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Scope</p>
                    <p className="mt-2 text-sm font-semibold text-foreground">{roleScopeLabel(role)}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-muted/30 px-4 py-4 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Aanbevolen gebruik</p>
                  <p className="mt-1">{definition.intended_use}</p>
                  <p className="mt-2 text-xs">{definition.governance_note}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/backoffice/organisatie/permissies?role=${role}`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Permissies van deze rol
                  </Link>
                  <Link
                    href="/backoffice/medewerkers"
                    className={buttonVariants({ variant: "ghost", size: "sm" })}
                  >
                    Naar medewerkers
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rolcanon samengevat</CardTitle>
          <p className="text-sm text-muted-foreground">
            {rolesWithOverrides} van {roles.length} rollen hebben tenant-specifieke overrides. Houd dat aantal bewust laag om de canon sterk te houden.
          </p>
        </CardHeader>
      </Card>
    </div>
  );
}
