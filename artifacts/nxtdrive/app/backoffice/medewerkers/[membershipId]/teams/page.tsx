import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganizationPermission } from "@/lib/organization";
import { listBranches } from "@/lib/branches/service";
import {
  listMembershipOrganizationTeamIds,
  listOrganizationTeams,
} from "@/lib/organization";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { setMembershipTeams } from "../../actions";
import type { MemberRole } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  tenant_admin: "Beheerder",
  instructor: "Instructeur",
  branch_manager: "Vestigingsmanager",
  planner: "Planner",
  admin_staff: "Administratie",
  marketing: "Marketing",
};

export default async function MemberTeamsPage({
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
  const reason = typeof sp.reason === "string" ? sp.reason : null;

  const service = createServiceRoleClient();

  const { data: membershipRow } = await service
    .from("memberships")
    .select("id, user_id, role")
    .eq("id", membershipId)
    .eq("tenant_id", organization.id)
    .maybeSingle();

  if (!membershipRow) notFound();

  const userId = membershipRow.user_id as string;
  const role = membershipRow.role as MemberRole;

  const { data: profileRow } = await service
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();

  const displayName =
    (profileRow?.full_name as string | null) ??
    (profileRow?.email as string | null) ??
    "Onbekend";

  const [branches, teams, currentTeamIds] = await Promise.all([
    listBranches(service, organization.id, { activeOnly: true }),
    listOrganizationTeams(service, organization.id, { activeOnly: true }),
    listMembershipOrganizationTeamIds(service, organization.id, membershipId),
  ]);

  const branchNameById = new Map(branches.map((branch) => [branch.id, branch.name]));

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
              Teams voor {displayName}
            </h1>
            <p className="text-sm text-muted-foreground">
              Rol: {ROLE_LABEL[role] ?? role}. Teams sturen de operationele samenwerking, maar vervangen het rol- en scope-model niet.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="primary">{ROLE_LABEL[role] ?? role}</Badge>
            <Badge variant="outline">{currentTeamIds.length} team(s)</Badge>
          </div>
        </div>
        <Link
          href={`/backoffice/medewerkers/${membershipId}/vestigingen`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Vestigingen beheren
        </Link>
      </div>

      {success === "updated" ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          Teamindeling bijgewerkt.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          Teamindeling opslaan mislukt{reason ? `: ${reason}` : "."}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Teams</CardTitle>
          <p className="text-sm text-muted-foreground">
            Gebruik teams om planners, administratie of marketing operationeel te organiseren zonder nieuwe rechtenmodellen te introduceren.
          </p>
        </CardHeader>
        <CardContent>
          {teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nog geen teams aangemaakt.{" "}
              <Link
                href="/backoffice/organisatie/teams"
                className="text-primary underline-offset-2 hover:underline"
              >
                Teams beheren →
              </Link>
            </p>
          ) : (
            <form action={setMembershipTeams} className="space-y-4">
              <input
                type="hidden"
                name="membership_id"
                value={membershipId}
              />

              <div className="space-y-2">
                {teams.map((team) => {
                  const checked = currentTeamIds.includes(team.id);
                  const branchLabel = team.branch_id
                    ? branchNameById.get(team.branch_id) ?? "Vestiging onbekend"
                    : "Organisatiebreed";
                  return (
                    <label
                      key={team.id}
                      className="flex cursor-pointer items-start gap-3 rounded-md border border-input px-3 py-2.5 text-sm transition-colors hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        name="team_ids[]"
                        value={team.id}
                        defaultChecked={checked}
                        className="mt-0.5 rounded"
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex items-center gap-2 font-medium text-foreground">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: team.color }}
                            aria-hidden
                          />
                          {team.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {branchLabel}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>

              <p className="text-[11px] text-muted-foreground">
                Kies nul of meer teams. Leeg laten is toegestaan.
              </p>

              <div className="flex gap-2">
                <Button type="submit" size="sm">
                  Opslaan
                </Button>
                <Link
                  href={`/backoffice/medewerkers/${membershipId}/toegang`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Annuleren
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
