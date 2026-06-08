import Link from "next/link";
import { notFound } from "next/navigation";
import { KeyRound, MapPin, ShieldCheck, Workflow } from "lucide-react";
import { GovernanceAlerts } from "@/components/organization/governance-alerts";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listBranches, listMembershipBranches } from "@/lib/branches/service";
import {
  effectiveRolePermissions,
  isBranchScopedGovernanceRole,
  isStaffGovernanceRole,
  listMembershipOrganizationTeamIds,
  listOrganizationRolePermissionOverrides,
  listOrganizationTeams,
  manageableRoles,
  permissionOverrideValue,
  requireOrganizationPermission,
  roleGovernanceAlerts,
  roleGovernanceDefinition,
  roleLabel,
  roleScopeLabel,
  type ManageablePermissionRole,
} from "@/lib/organization";
import {
  permissionAction,
  permissionResource,
  type Permission,
} from "@/lib/permissions";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { MemberRole } from "@/lib/types";

export const dynamic = "force-dynamic";

const RESOURCE_LABEL: Record<string, string> = {
  organization: "Organisatie",
  settings: "Instellingen",
  branch: "Vestigingen",
  team: "Teams",
  user: "Medewerkers",
  student: "Leerlingen",
  lead: "Leads",
  planning: "Planning",
  vehicle: "Voertuigen",
  invoice: "Facturen",
  task: "Taken",
  franchise: "Franchise",
  report: "Rapportages",
};

const ACTION_LABEL: Record<string, string> = {
  manage: "Beheren",
  read: "Lezen",
  update: "Bijwerken",
  export: "Exporteren",
};

function isManageableRole(role: MemberRole): role is ManageablePermissionRole {
  return manageableRoles().includes(role as ManageablePermissionRole);
}

function permissionLabel(permission: Permission): string {
  const resource = permissionResource(permission);
  const action = permissionAction(permission);
  return `${RESOURCE_LABEL[resource] ?? resource} ${ACTION_LABEL[action] ?? action}`;
}

function groupPermissions(permissions: readonly Permission[]) {
  const grouped = new Map<string, Permission[]>();
  for (const permission of permissions) {
    const resource = permissionResource(permission);
    grouped.set(resource, [...(grouped.get(resource) ?? []), permission]);
  }
  return Array.from(grouped.entries()).map(([resource, items]) => ({ resource, items }));
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

export default async function MembershipAccessPage({
  params,
}: {
  params: Promise<{ membershipId: string }>;
}) {
  const { organization } = await requireOrganizationPermission("user:manage");
  const { membershipId } = await params;
  const service = createServiceRoleClient();

  const { data: membershipRow } = await service
    .from("memberships")
    .select("id, user_id, role, branch_scope_type")
    .eq("id", membershipId)
    .eq("tenant_id", organization.id)
    .maybeSingle();

  if (!membershipRow) notFound();

  const role = membershipRow.role as MemberRole;
  const userId = membershipRow.user_id as string;
  const branchScopeType = (membershipRow.branch_scope_type as string | null) ?? "all";

  const { data: profileRow } = await service
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();

  const displayName =
    (profileRow?.full_name as string | null) ??
    (profileRow?.email as string | null) ??
    "Onbekend";

  const [branches, branchIds, teams, teamIds, overrides] = await Promise.all([
    listBranches(service, organization.id, { activeOnly: true }),
    listMembershipBranches(service, membershipId),
    listOrganizationTeams(service, organization.id, { activeOnly: true }),
    listMembershipOrganizationTeamIds(service, organization.id, membershipId),
    listOrganizationRolePermissionOverrides(service, organization.id),
  ]);

  const branchNameById = new Map(branches.map((branch) => [branch.id, branch.name]));
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const branchNames = branchIds
    .map((branchId) => branchNameById.get(branchId))
    .filter((value): value is string => Boolean(value));
  const teamNames = teamIds
    .map((teamId) => teamById.get(teamId)?.name)
    .filter((value): value is string => Boolean(value));

  const permissions = effectiveRolePermissions(role, overrides);
  const permissionGroups = groupPermissions(permissions);
  const overrideCount = isManageableRole(role)
    ? permissions.filter(
        (permission) => permissionOverrideValue(role, permission, overrides) !== "inherit",
      ).length
    : 0;

  const scopeSummary =
    branchIds.length === 0 || branchScopeType === "all"
      ? "Alle vestigingen"
      : `${branchIds.length} vestiging(en)`;
  const governanceDefinition = isStaffGovernanceRole(role)
    ? roleGovernanceDefinition(role)
    : null;
  const governanceAlerts = roleGovernanceAlerts(role, {
    selectedBranchCount: branchIds.length,
    availableBranchCount: branches.length,
    selectedTeamCount: teamNames.length,
    includeTeamHint: true,
  });
  const showBranchEditor =
    branches.length > 0 && (isBranchScopedGovernanceRole(role) || branchIds.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <Link
            href="/backoffice/medewerkers"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Terug naar medewerkers
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Toegang voor {displayName}
            </h1>
            <p className="text-sm text-muted-foreground">
              Rol, vestigingsscope, teams en effectieve permissies voor deze medewerker binnen {organization.name}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="primary">{roleLabel(role)}</Badge>
            <Badge variant="outline">{scopeSummary}</Badge>
            {governanceDefinition ? (
              <Badge variant="outline">{roleScopeLabel(governanceDefinition.role)}</Badge>
            ) : null}
            {teamNames.length > 0 ? <Badge variant="outline">{teamNames.length} team(s)</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/backoffice/medewerkers/${membershipId}/rol`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Rol beheren
          </Link>
          {showBranchEditor ? (
            <Link
              href={`/backoffice/medewerkers/${membershipId}/vestigingen`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Vestigingen beheren
            </Link>
          ) : null}
          <Link
            href={`/backoffice/medewerkers/${membershipId}/teams`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Teams beheren
          </Link>
          {isManageableRole(role) ? (
            <Link
              href={`/backoffice/organisatie/permissies?role=${role}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Rolpermissies bekijken
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Rol"
          value={roleLabel(role)}
          description="Basisrol blijft de eerste laag van toegang binnen de organisatie."
          icon={ShieldCheck}
        />
        <StatCard
          title="Vestigingsscope"
          value={scopeSummary}
          description="Geen expliciete selectie betekent organisatiebrede toegang over alle vestigingen."
          icon={MapPin}
        />
        <StatCard
          title="Teams"
          value={String(teamNames.length)}
          description="Operationele teamindeling helpt bij samenwerking, zonder zelfstandig rechten toe te kennen."
          icon={Workflow}
        />
        <StatCard
          title="Custom overrides"
          value={String(overrideCount)}
          description="Tenant-specifieke permissie-afwijkingen bovenop de standaard registry voor deze rol."
          icon={KeyRound}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Governance context</CardTitle>
              <p className="text-sm text-muted-foreground">
                Gebruik deze laag om eerst te toetsen of de basisrol en scope logisch zijn, voordat je permissies gaat finetunen.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {governanceDefinition ? (
                <div className="rounded-xl border border-border bg-muted/30 px-4 py-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="primary">{governanceDefinition.label}</Badge>
                    <Badge variant="outline">{roleScopeLabel(governanceDefinition.role)}</Badge>
                  </div>
                  <p className="mt-3 text-foreground">{governanceDefinition.description}</p>
                  <p className="mt-2 text-muted-foreground">{governanceDefinition.intended_use}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{governanceDefinition.governance_note}</p>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-muted/30 px-4 py-4 text-sm text-muted-foreground">
                  Deze rol valt buiten de standaard staff-canon. Gebruik permissiebeheer en organisatiestructuur daarom extra bewust.
                </div>
              )}

              <GovernanceAlerts alerts={governanceAlerts} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Vestigingstoegang</CardTitle>
              <p className="text-sm text-muted-foreground">
                Scope-based access bepaalt op welke vestigingen branch-gebonden rechten echt toepasbaar zijn.
              </p>
            </CardHeader>
            <CardContent>
              {branchNames.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
                  Deze medewerker heeft op dit moment geen expliciete branch-selectie en valt daardoor terug op alle vestigingen.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {branchNames.map((branchName) => (
                    <Badge key={branchName} variant="outline">
                      {branchName}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Teamindeling</CardTitle>
              <p className="text-sm text-muted-foreground">
                Teams zijn operationeel en mogen dus meebewegen met de organisatiestructuur, zonder het rolmodel te vervangen.
              </p>
            </CardHeader>
            <CardContent>
              {teamNames.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
                  Geen teams gekoppeld. Dat is toegestaan wanneer deze medewerker organisatiebreed of solo werkt.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {teamNames.map((teamName) => (
                    <Badge key={teamName} variant="outline">
                      {teamName}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Effectieve permissies</CardTitle>
            <p className="text-sm text-muted-foreground">
              Dit overzicht combineert de standaard permission registry met tenant-overrides voor de rol van deze medewerker.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {permissionGroups.map((group) => (
              <div key={group.resource} className="rounded-xl border border-border p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="font-medium text-foreground">
                    {RESOURCE_LABEL[group.resource] ?? group.resource}
                  </h2>
                  <Badge variant="outline">{group.items.length}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.items.map((permission) => (
                    <Badge key={permission} variant="info">
                      {permissionLabel(permission)}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
