import Link from "next/link";
import { Fragment } from "react";
import {
  CheckCircle2,
  Eye,
  GitBranch,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ACCESS_SURFACES,
  DELEGATION_WIZARD_SUGGESTIONS,
  ROLE_TEMPLATES,
  defaultPermissionState,
  effectiveRolePermission,
  effectiveRolePermissions,
  isStaffGovernanceRole,
  listOrganizationRolePermissionOverrides,
  manageablePermissions,
  manageableRoles,
  permissionLabel,
  permissionOverrideExplains,
  permissionOverrideValue,
  PERMISSION_RESOURCE_LABELS,
  requireOrganizationPermission,
  roleAuditExplanation,
  roleDisplayLabel,
  roleGovernanceDefinition,
  roleScopeLabel,
  surfaceVisibleWithPermissions,
  type ManageablePermissionRole,
  type OrganizationRolePermissionOverride,
} from "@/lib/organization";
import {
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

function resourceLabel(resource: string): string {
  return PERMISSION_RESOURCE_LABELS[resource] ?? resource;
}

function PermissionMatrix({
  roles,
  groups,
  overrides,
  selectedRole,
}: {
  roles: readonly ManageablePermissionRole[];
  groups: Array<{ resource: string; permissions: Permission[] }>;
  overrides: readonly OrganizationRolePermissionOverride[];
  selectedRole: ManageablePermissionRole;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Visuele permissiematrix
          <Badge variant="outline">Effectieve rechten</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Per rol zie je direct wat standaard of via tenant-override toegestaan
          is. Klik op een rol om daaronder de uitzonderingen te beheren.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="min-w-[980px] w-full border-collapse text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="sticky left-0 z-10 min-w-[240px] border-b border-border bg-muted px-4 py-3 font-semibold text-foreground">
                  Permissie
                </th>
                {roles.map((role) => (
                  <th
                    key={role}
                    className="border-b border-border px-3 py-3 text-center font-semibold text-foreground"
                  >
                    <Link
                      href={`/backoffice/organisatie/permissies?role=${role}`}
                      className={cn(
                        "inline-flex rounded-full px-3 py-1",
                        selectedRole === role
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-foreground",
                      )}
                    >
                      {roleDisplayLabel(role)}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <Fragment key={group.resource}>
                  <tr key={`${group.resource}:heading`}>
                    <td
                      colSpan={roles.length + 1}
                      className="border-b border-border bg-muted/25 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
                    >
                      {resourceLabel(group.resource)}
                    </td>
                  </tr>
                  {group.permissions.map((permission) => (
                    <tr key={permission} className="border-b border-border/70">
                      <td className="sticky left-0 z-10 bg-card px-4 py-3">
                        <p className="font-medium text-foreground">
                          {permissionLabel(permission)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {permissionOverrideExplains(permission)}
                        </p>
                      </td>
                      {roles.map((role) => {
                        const roleOverrides = overrides.filter(
                          (override) => override.role === role,
                        );
                        const allowed = effectiveRolePermission(
                          role,
                          permission,
                          roleOverrides,
                        );
                        const overrideValue = permissionOverrideValue(
                          role,
                          permission,
                          overrides,
                        );
                        const isExplicit =
                          overrideValue !== "inherit" &&
                          roleOverrides.some(
                            (override) => override.permission === permission,
                          );
                        return (
                          <td key={role} className="px-3 py-3 text-center">
                            <span
                              className={cn(
                                "inline-flex min-w-[92px] items-center justify-center rounded-full px-3 py-1 text-xs font-medium",
                                allowed
                                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              {allowed ? "Toegang" : "Geen toegang"}
                            </span>
                            {isExplicit ? (
                              <div className="mt-1 text-[11px] font-medium text-primary">
                                Override
                              </div>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function RoleTemplatePanel({
  orgType,
}: {
  orgType: string | null | undefined;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Roltemplates per rijschooltype
          <Badge variant="outline">Advies</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Gebruik deze templates als klantvriendelijke startinrichting. Ze
          wijzigen niets automatisch; ze maken duidelijk welke rollen logisch
          zijn per organisatievorm.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        {ROLE_TEMPLATES.map((template) => {
          const active = orgType === template.orgType;
          return (
            <div
              key={template.orgType}
              className={cn(
                "rounded-2xl border p-4",
                active
                  ? "border-primary/40 bg-primary-soft"
                  : "border-border bg-muted/20",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">
                    {template.label}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {template.bestFor}
                  </p>
                </div>
                {active ? <Badge variant="primary">Huidig type</Badge> : null}
              </div>
              <div className="mt-4 space-y-3">
                {template.recommendedRoles.map((role) => (
                  <div
                    key={`${template.orgType}:${role.role}`}
                    className="rounded-xl border border-border bg-background px-3 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-foreground">
                        {roleDisplayLabel(role.role)}
                      </p>
                      <Badge variant="outline">{role.countLabel}</Badge>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {role.note}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function AccessSimulator({
  selectedRole,
  simulatedRole,
  simulatedPermissions,
}: {
  selectedRole: ManageablePermissionRole;
  simulatedRole: MemberRole;
  simulatedPermissions: Permission[];
}) {
  const visible = ACCESS_SURFACES.filter((surface) =>
    surfaceVisibleWithPermissions(surface, simulatedPermissions),
  );
  const hidden = ACCESS_SURFACES.filter(
    (surface) => !surfaceVisibleWithPermissions(surface, simulatedPermissions),
  );
  const simulatorRoles: MemberRole[] = [
    ...manageableRoles(),
    "student",
    "parent",
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Rechten-simulator
          <Badge variant="outline">Wat ziet deze gebruiker?</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Simuleer per rol welke portalen, menu's en workflowgebieden nu
          zichtbaar zijn. Bij medewerkers worden tenant-overrides meegenomen.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="role" value={selectedRole} />
          <label className="space-y-1 text-sm text-muted-foreground">
            <span>Rol simuleren</span>
            <select
              name="sim_role"
              defaultValue={simulatedRole}
              className="h-10 min-w-[220px] rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground"
            >
              {simulatorRoles.map((role) => (
                <option key={role} value={role}>
                  {roleDisplayLabel(role)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Simuleren
          </button>
        </form>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4">
            <p className="flex items-center gap-2 font-medium text-foreground">
              <Eye className="h-4 w-4 text-emerald-600" aria-hidden />
              Zichtbaar
            </p>
            <div className="mt-3 space-y-2">
              {visible.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Geen productiegebieden zichtbaar.
                </p>
              ) : (
                visible.map((surface) => (
                  <div
                    key={surface.key}
                    className="rounded-xl border border-border bg-background px-3 py-3"
                  >
                    <p className="font-medium text-foreground">{surface.title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {surface.description}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-muted/20 p-4">
            <p className="font-medium text-foreground">Niet zichtbaar</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {hidden.map((surface) => (
                <Badge key={surface.key} variant="outline">
                  {surface.title}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DelegationWizardPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Delegatie-wizard
          <Badge variant="outline">Signaal naar bevoegdheid</Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Vanuit elk operationeel signaal hoort het systeem meteen een passende
          scope, eigenaar en auditreden voor te stellen.
        </p>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {DELEGATION_WIZARD_SUGGESTIONS.map((suggestion) => (
          <Link
            key={suggestion.signal}
            href={suggestion.href}
            className="rounded-2xl border border-border bg-muted/20 p-4 transition-colors hover:border-primary/40 hover:bg-primary-soft"
          >
            <div className="flex items-start gap-3">
              <span className="rounded-full bg-primary-soft p-2 text-primary">
                <GitBranch className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="font-medium text-foreground">{suggestion.signal}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {suggestion.suggestedPermission} · {suggestion.scope}
                </p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Eigenaar: {suggestion.owner}. Auditreden:{" "}
                  {suggestion.auditReason}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
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
  const requestedSimulatorRole =
    typeof sp.sim_role === "string" ? (sp.sim_role as MemberRole) : null;
  const simulatorRoles: MemberRole[] = [...roles, "student", "parent"];
  const simulatedRole = simulatorRoles.includes(requestedSimulatorRole as MemberRole)
    ? (requestedSimulatorRole as MemberRole)
    : selectedRole;

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
  const simulatedPermissions = effectiveRolePermissions(simulatedRole, overrides);
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

      <PermissionMatrix
        roles={roles}
        groups={groups}
        overrides={overrides}
        selectedRole={selectedRole}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <RoleTemplatePanel orgType={organization.org_type} />
          <DelegationWizardPanel />
        </div>
        <div className="space-y-6">
          <AccessSimulator
            selectedRole={selectedRole}
            simulatedRole={simulatedRole}
            simulatedPermissions={simulatedPermissions}
          />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Audit-uitleg geselecteerde rol
                <Badge variant="outline">{roleDisplayLabel(selectedRole)}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-2xl border border-border bg-muted/25 p-4">
                <p className="flex items-center gap-2 font-medium text-foreground">
                  <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
                  Waarom deze rol bestaat
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {roleAuditExplanation(selectedRole)}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-muted/25 p-4">
                <p className="flex items-center gap-2 font-medium text-foreground">
                  <Sparkles className="h-4 w-4 text-primary" aria-hidden />
                  Auditvriendelijk gebruik
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Leg afwijkingen vast als expliciete overrides en gebruik
                  delegaties met scope, geldigheid, eigenaar en reden wanneer
                  toegang tijdelijk of vestigingsoverstijgend is.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
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
                        {resourceLabel(group.resource)}
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
