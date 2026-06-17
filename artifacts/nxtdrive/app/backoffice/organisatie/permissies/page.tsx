import Link from "next/link";
import { ShieldCheck, SlidersHorizontal, Users, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  defaultPermissionState,
  isStaffGovernanceRole,
  listOrganizationRolePermissionOverrides,
  manageablePermissions,
  manageableRoles,
  permissionOverrideExplains,
  permissionOverrideValue,
  requireOrganizationPermission,
  roleGovernanceDefinition,
  roleScopeLabel,
  type ManageablePermissionRole,
} from "@/lib/organization";
import {
  permissionAction,
  permissionResource,
  type Permission,
} from "@/lib/permissions";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { cn } from "@/lib/utils";
import type { MemberRole } from "@/lib/types";
import { saveOrganizationRolePermissionsAction } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type MembershipCountRow = {
  role: MemberRole;
};

const ROLE_LABEL: Record<ManageablePermissionRole, string> = {
  tenant_admin: "Organisatiebeheerder",
  franchise_admin: "Franchisebeheerder",
  branch_manager: "Vestigingsmanager",
  planner: "Planner",
  admin_staff: "Administratie",
  marketing: "Marketing",
  instructor: "Instructeur",
};

const ROLE_DESCRIPTION: Record<ManageablePermissionRole, string> = {
  tenant_admin: "Volledige beheerrol binnen een organisatie, inclusief instellingen en structuur.",
  franchise_admin: "Centrale beheerrol voor franchise-organisaties en vestigingsoverstijgende sturing.",
  branch_manager: "Lokale managerrol voor vestigingsoperatie, medewerkers en planning binnen scope.",
  planner: "Operationele planning zonder brede organisatie-instellingen.",
  admin_staff: "Backoffice- en facturatiegerichte rol voor administratie en operationele opvolging.",
  marketing: "Lead- en groeifocus zonder toegang tot gevoelige beheerinstellingen.",
  instructor: "Uitvoerende rol voor leerlingen en agenda, zonder brede backoffice-control.",
};

const RESOURCE_LABEL: Record<string, string> = {
  organization: "Organisatie",
  settings: "Instellingen",
  branch: "Vestigingen",
  team: "Teams",
  user: "Medewerkers",
  student: "Leerlingen",
  planning: "Planning",
  invoice: "Facturen",
  lead: "Leads",
  report: "Rapportages",
  franchise: "Franchise",
  vehicle: "Voertuigen",
  task: "Taken",
};

const ACTION_LABEL: Record<string, string> = {
  manage: "Beheren",
  read: "Lezen",
  update: "Bijwerken",
  export: "Exporteren",
};

function feedbackMessage(code: string | null, reason: string | null): string | null {
  if (code === "saved") return "Permissieprofiel opgeslagen.";
  if (code === "invalid_role") return "Kies een geldige rol om permissies op te slaan.";
  if (code === "save_failed") {
    return reason ? `Opslaan mislukt: ${reason}` : "Opslaan van permissies is mislukt.";
  }
  return null;
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

function permissionLabel(permission: Permission): string {
  const resource = permissionResource(permission);
  const action = permissionAction(permission);
  return `${RESOURCE_LABEL[resource] ?? resource} ${ACTION_LABEL[action] ?? action}`;
}

function groupPermissions(): Array<{ resource: string; permissions: Permission[] }> {
  const grouped = new Map<string, Permission[]>();
  for (const permission of manageablePermissions()) {
    const resource = permissionResource(permission);
    grouped.set(resource, [...(grouped.get(resource) ?? []), permission]);
  }

  return Array.from(grouped.entries()).map(([resource, permissions]) => ({
    resource,
    permissions,
  }));
}

export default async function OrganizationPermissionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { organization } = await requireOrganizationPermission("settings:manage");
  const service = createServiceRoleClient();
  const sp = await searchParams;
  const feedbackCode = typeof sp.success === "string" ? sp.success : typeof sp.error === "string" ? sp.error : null;
  const reason = typeof sp.reason === "string" ? sp.reason : null;
  const requestedRole = typeof sp.role === "string" ? (sp.role as ManageablePermissionRole) : null;
  const roles = manageableRoles();
  const selectedRole = roles.includes(requestedRole as ManageablePermissionRole)
    ? (requestedRole as ManageablePermissionRole)
    : roles[0];

  const [overrides, membershipCountsResult] = await Promise.all([
    listOrganizationRolePermissionOverrides(service, organization.id),
    service
      .from("memberships")
      .select("role")
      .eq("tenant_id", organization.id)
      .in("role", [...roles]),
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

  const roleOverrideCount = overrides.filter((override) => override.role === selectedRole).length;
  const rolesWithOverrides = new Set(overrides.map((override) => override.role)).size;
  const groups = groupPermissions();
  const message = feedbackMessage(feedbackCode, reason);
  const governanceDefinition = isStaffGovernanceRole(selectedRole)
    ? roleGovernanceDefinition(selectedRole)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="primary">Permissies</Badge>
            <Badge variant="outline">Tenant overrides per rol</Badge>
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Rolpermissies beheren
            </h1>
            <p className="text-sm text-muted-foreground">
              Houd de standaard permission registry als canon en leg alleen tenant-specifieke uitzonderingen vast waar dat operationeel echt nodig is.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/backoffice/organisatie/rollen"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Rollen bekijken
          </Link>
          <Link
            href="/backoffice/medewerkers"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Medewerkers beheren
          </Link>
          <Link
            href="/backoffice/organisatie"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Terug naar organisatiebeheer
          </Link>
        </div>
      </div>

      {message ? (
        <p
          className={cn(
            "rounded-md border px-3 py-2 text-sm",
            feedbackCode === "saved"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
          )}
        >
          {message}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Beheerbare rollen"
          value={String(roles.length)}
          description="Backoffice- en operationele rollen die tenant-specifieke overrides mogen krijgen."
          icon={Users}
        />
        <StatCard
          title="Overrides actief"
          value={String(overrides.length)}
          description="Exacte allow- of deny-regels bovenop de standaard registry."
          icon={SlidersHorizontal}
        />
        <StatCard
          title="Rollen aangepast"
          value={String(rolesWithOverrides)}
          description="Aantal rollen met een custom permissieprofiel in deze organisatie."
          icon={ShieldCheck}
        />
        <StatCard
          title="Geselecteerde rol"
          value={String(roleOverrideCount)}
          description="Custom regels voor de rol die je hieronder nu bewerkt."
          icon={Wrench}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Rollen</CardTitle>
            <p className="text-sm text-muted-foreground">
              Kies eerst welke backoffice-rol je wilt bijsturen. De standaardrol blijft altijd zichtbaar als referentie.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {roles.map((role) => {
              const isActive = role === selectedRole;
              return (
                <Link
                  key={role}
                  href={`/backoffice/organisatie/permissies?role=${role}`}
                  className={cn(
                    "block rounded-xl border px-3 py-3 transition-colors",
                    isActive
                      ? "border-primary/40 bg-primary-soft text-foreground"
                      : "border-border hover:border-primary/30 hover:bg-muted/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{ROLE_LABEL[role]}</p>
                      <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTION[role]}</p>
                    </div>
                    <Badge variant={membershipCounts[role] ? "primary" : "outline"}>
                      {membershipCounts[role] ?? 0}
                    </Badge>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {governanceDefinition ? (
            <Card>
              <CardHeader>
                <CardTitle>Governance eerst</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Controleer eerst of de basisrol logisch is. Overrides zijn pas de tweede laag nadat rol en scope kloppen.
                </p>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border border-border bg-muted/30 px-4 py-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="primary">{governanceDefinition.label}</Badge>
                    <Badge variant="outline">{roleScopeLabel(governanceDefinition.role)}</Badge>
                  </div>
                  <p className="mt-3 text-foreground">{governanceDefinition.description}</p>
                  <p className="mt-2 text-muted-foreground">{governanceDefinition.intended_use}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{governanceDefinition.governance_note}</p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-foreground">{ROLE_LABEL[selectedRole]}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {ROLE_DESCRIPTION[selectedRole]}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{membershipCounts[selectedRole] ?? 0} medewerker(s)</Badge>
                  <Badge variant="outline">{roleOverrideCount} override(s)</Badge>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                Gebruik <strong className="text-foreground">Standaard</strong> waar mogelijk. Zet alleen een expliciete <strong className="text-foreground">Toestaan</strong> of <strong className="text-foreground">Weigeren</strong> als deze organisatie bewust afwijkt van de platformcanon.
              </div>
            </CardHeader>
            <CardContent>
              <form action={saveOrganizationRolePermissionsAction} className="space-y-6">
                <input type="hidden" name="role" value={selectedRole} />

                {groups.map((group) => (
                  <div key={group.resource} className="space-y-3 rounded-2xl border border-border p-4">
                    <div>
                      <h2 className="text-base font-semibold text-foreground">
                        {RESOURCE_LABEL[group.resource] ?? group.resource}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Overrides binnen dit domein gelden alleen voor de rol {ROLE_LABEL[selectedRole].toLowerCase()}.
                      </p>
                    </div>

                    <div className="space-y-3">
                      {group.permissions.map((permission) => {
                        const defaultState = defaultPermissionState(selectedRole, permission);
                        const currentValue = permissionOverrideValue(selectedRole, permission, overrides);
                        return (
                          <div
                            key={permission}
                            className="grid gap-3 rounded-xl border border-border bg-card/70 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_180px] lg:items-start"
                          >
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium text-foreground">{permissionLabel(permission)}</p>
                                <Badge variant={defaultState === "allow" ? "primary" : "outline"}>
                                  Standaard {defaultState === "allow" ? "toegestaan" : "niet toegestaan"}
                                </Badge>
                                {currentValue !== "inherit" ? (
                                  <Badge variant="outline">
                                    Override: {currentValue === "allow" ? "toestaan" : "weigeren"}
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {permissionOverrideExplains(permission)}
                              </p>
                            </div>
                            <label className="space-y-1 text-sm text-muted-foreground">
                              <span>Actie voor deze tenant</span>
                              <select
                                name={`perm:${permission}`}
                                defaultValue={currentValue}
                                className="flex h-10 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                              >
                                <option value="inherit">Standaard volgen</option>
                                <option value="allow">Expliciet toestaan</option>
                                <option value="deny">Expliciet weigeren</option>
                              </select>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    className={buttonVariants({ variant: "primary", size: "sm" })}
                  >
                    Permissieprofiel opslaan
                  </button>
                  <Link
                    href={`/backoffice/organisatie/permissies?role=${selectedRole}`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Terug naar standaardweergave
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
