import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightLeft, MapPin, ShieldCheck, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listBranches, listMembershipBranches } from "@/lib/branches/service";
import {
  isStaffGovernanceRole,
  listMembershipOrganizationTeamIds,
  listOrganizationTeams,
  requireOrganizationPermission,
  roleGovernanceDefinition,
  roleLabel,
  roleScopeLabel,
} from "@/lib/organization";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { MemberRole } from "@/lib/types";
import { RoleManagementForm } from "./role-form";

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

function feedbackMessage(code: string | null): string | null {
  if (code === "role_changed") return "Rol bijgewerkt.";
  if (code === "missing_fields") return "Kies een geldige rol om op te slaan.";
  if (code === "role_conflict") return "Deze medewerker heeft deze rol al.";
  if (code === "cannot_change_own_role") return "Je kunt je eigen rol niet wijzigen.";
  if (code === "update_failed") return "Rolwijziging mislukt. Probeer het opnieuw.";
  if (code === "not_found") return "Deze medewerker bestaat niet meer binnen de organisatie.";
  return null;
}

export default async function MembershipRolePage({
  params,
  searchParams,
}: {
  params: Promise<{ membershipId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organization } = await requireOrganizationPermission("user:manage");
  const { membershipId } = await params;
  const sp = await searchParams;
  const success = typeof sp.success === "string" ? sp.success : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const service = createServiceRoleClient();

  const { data: membershipRow } = await service
    .from("memberships")
    .select("id, user_id, role")
    .eq("id", membershipId)
    .eq("tenant_id", organization.id)
    .maybeSingle();

  if (!membershipRow) notFound();

  const role = membershipRow.role as MemberRole;
  if (!isStaffGovernanceRole(role)) notFound();

  const { data: profileRow } = await service
    .from("profiles")
    .select("full_name, email")
    .eq("id", membershipRow.user_id as string)
    .maybeSingle();

  const displayName =
    (profileRow?.full_name as string | null) ??
    (profileRow?.email as string | null) ??
    "Onbekend";

  const [branches, selectedBranchIds, teams, selectedTeamIds] = await Promise.all([
    listBranches(service, organization.id, { activeOnly: true }),
    listMembershipBranches(service, membershipId),
    listOrganizationTeams(service, organization.id, { activeOnly: true }),
    listMembershipOrganizationTeamIds(service, organization.id, membershipId),
  ]);

  const currentDefinition = roleGovernanceDefinition(role);
  const currentTeamNames = teams
    .filter((team) => selectedTeamIds.includes(team.id))
    .map((team) => team.name);
  const message = feedbackMessage(success ?? error);
  const isError = Boolean(error);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <Link
            href={`/backoffice/medewerkers/${membershipId}/toegang`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Terug naar toegangsoverzicht
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Rol beheren voor {displayName}
            </h1>
            <p className="text-sm text-muted-foreground">
              Pas de basisrol eerst hier aan. Branch-scope, teams en permissie-overrides blijven daarna aparte lagen.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="primary">{currentDefinition.label}</Badge>
            <Badge variant="outline">{roleScopeLabel(role)}</Badge>
            <Badge variant="outline">{selectedBranchIds.length === 0 ? "Alle vestigingen" : `${selectedBranchIds.length} vestiging(en)`}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/backoffice/medewerkers/${membershipId}/vestigingen`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Vestigingen beheren
          </Link>
          <Link
            href={`/backoffice/medewerkers/${membershipId}/teams`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Teams beheren
          </Link>
          <Link
            href={`/backoffice/organisatie/permissies?role=${role}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Rolpermissies
          </Link>
        </div>
      </div>

      {message ? (
        <p className={`rounded-md border px-3 py-2 text-sm ${isError ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}>
          {message}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Huidige rol"
          value={roleLabel(role)}
          description="De basisrol blijft leidend voor de standaardrechten van deze medewerker."
          icon={ShieldCheck}
        />
        <StatCard
          title="Vestigingsscope"
          value={selectedBranchIds.length === 0 ? "Alle vestigingen" : `${selectedBranchIds.length}`}
          description="Gebruik branch-scope om lokale rollen te begrenzen nadat de basisrol klopt."
          icon={MapPin}
        />
        <StatCard
          title="Teams"
          value={String(currentTeamNames.length)}
          description="Teams blijven operationeel en veranderen de basisrechten van de rol niet."
          icon={Workflow}
        />
        <StatCard
          title="Rolwissel"
          value="Bewust"
          description="Een rolwijziging is een governance-keuze en hoort niet verstopt te zitten in een losse lijstweergave."
          icon={ArrowRightLeft}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Nieuwe basisrol kiezen</CardTitle>
            <p className="text-sm text-muted-foreground">
              Kies eerst de juiste rolcanon. Gebruik daarna alleen scope en permissies om te verfijnen, niet om een verkeerde basisrol te compenseren.
            </p>
          </CardHeader>
          <CardContent>
            <RoleManagementForm
              membershipId={membershipId}
              currentRole={role}
              selectedBranchCount={selectedBranchIds.length}
              availableBranchCount={branches.length}
              selectedTeamCount={currentTeamNames.length}
            />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Huidige governance-context</CardTitle>
              <p className="text-sm text-muted-foreground">
                Dit is de rol waar deze medewerker nu op draait. Gebruik dit als referentie vóór je iets wijzigt.
              </p>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border border-border bg-muted/30 px-4 py-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="primary">{currentDefinition.label}</Badge>
                  <Badge variant="outline">{roleScopeLabel(currentDefinition.role)}</Badge>
                </div>
                <p className="mt-3 text-foreground">{currentDefinition.description}</p>
                <p className="mt-2 text-muted-foreground">{currentDefinition.intended_use}</p>
                <p className="mt-2 text-xs text-muted-foreground">{currentDefinition.governance_note}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Wat blijft apart?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="rounded-lg border border-border px-3 py-3">
                Branch-scope bepaalt waar een branch-scoped rol mag gelden. Een nieuwe rol zet die selectie niet automatisch recht.
              </div>
              <div className="rounded-lg border border-border px-3 py-3">
                Teams blijven voor samenwerking, routing en organisatie. Ze vervangen geen rol of permissie.
              </div>
              <div className="rounded-lg border border-border px-3 py-3">
                Tenant-overrides op permissies zijn voor uitzonderingen. Controleer eerst of de nieuwe basisrol al genoeg oplost.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
