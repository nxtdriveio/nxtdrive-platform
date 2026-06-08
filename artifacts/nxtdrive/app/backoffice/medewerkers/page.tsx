import { redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { changeRole } from "./actions";
import { RemoveMemberButton } from "./remove-button";
import { InviteForm } from "./invite-form";
import { listBranches, listMembershipBranches } from "@/lib/branches/service";
import {
  listOrganizationTeamMembers,
  listOrganizationTeams,
  teamIdsForMembership,
} from "@/lib/organization";
import type { MemberRole } from "@/lib/types";

export const dynamic = "force-dynamic";

type MemberRow = {
  id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
  full_name: string | null;
  email: string;
  confirmed: boolean;
  branch_names: string[];
  team_names: string[];
};

const ROLE_LABEL: Record<string, string> = {
  tenant_admin: "Beheerder",
  instructor: "Instructeur",
  branch_manager: "Vestigingsmanager",
  planner: "Planner",
  admin_staff: "Administratie",
  marketing: "Marketing",
};

const ALL_STAFF_ROLES: MemberRole[] = [
  "tenant_admin",
  "instructor",
  "branch_manager",
  "planner",
  "admin_staff",
  "marketing",
];

const BRANCH_SCOPED_ROLES = new Set<MemberRole>([
  "instructor",
  "branch_manager",
  "planner",
  "admin_staff",
  "marketing",
]);

const DATE_FMT = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function Feedback({
  error,
  success,
  email,
  reason,
}: {
  error: string | null;
  success: string | null;
  email: string | null;
  reason: string | null;
}) {
  if (success === "credentials_sent" || success === "invited") {
    return (
      <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
        Medewerker aangemaakt en tijdelijke inloggegevens verstuurd naar{" "}
        <strong>{email}</strong>.
      </p>
    );
  }
  if (success === "added") {
    return (
      <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
        Bestaand account toegevoegd aan dit team: <strong>{email}</strong>.
      </p>
    );
  }
  if (success === "removed") {
    return (
      <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
        Medewerker verwijderd.
      </p>
    );
  }
  if (success === "role_changed") {
    return (
      <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
        Rol bijgewerkt.
      </p>
    );
  }
  if (success === "branches_updated") {
    return (
      <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
        Vestigingstoegang bijgewerkt.
      </p>
    );
  }
  if (success === "teams_updated") {
    return (
      <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
        Teamindeling bijgewerkt.
      </p>
    );
  }

  const errorMessages: Record<string, string> = {
    missing_fields: "Vul alle verplichte velden in.",
    already_member: `${email ? `${email} heeft` : "Dit account heeft"} al toegang tot jouw school.`,
    invite_failed: `Medewerker toevoegen mislukt${reason ? `: ${reason}` : "."}`,
    membership_failed: "Lidmaatschap kon niet worden aangemaakt.",
    remove_failed: "Verwijderen mislukt. Probeer het opnieuw.",
    cannot_remove_self: "Je kunt jezelf niet verwijderen.",
    cannot_change_own_role: "Je kunt je eigen rol niet wijzigen.",
    role_conflict: "Deze medewerker heeft deze rol al.",
    update_failed: "Rolwijziging mislukt. Probeer het opnieuw.",
    forbidden: "Je hebt geen toegang tot deze pagina.",
    branches_failed: `Vestigingstoegang instellen mislukt${reason ? `: ${reason}` : "."}`,
    teams_failed: `Teamindeling instellen mislukt${reason ? `: ${reason}` : "."}`,
  };

  if (error) {
    return (
      <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
        {errorMessages[error] ?? "Er is een fout opgetreden."}
      </p>
    );
  }

  return null;
}

export default async function MedewerkersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);

  if (user.profile?.is_platform_admin) redirect("/admin");

  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const success = typeof sp.success === "string" ? sp.success : null;
  const emailFeedback = typeof sp.email === "string" ? sp.email : null;
  const reason = typeof sp.reason === "string" ? sp.reason : null;

  const service = createServiceRoleClient();

  const [{ data: membershipRows }, branches, teams, teamMembers] = await Promise.all([
    service
      .from("memberships")
      .select("id, user_id, role, created_at")
      .eq("tenant_id", tenant.id)
      .in("role", ALL_STAFF_ROLES)
      .order("created_at", { ascending: true }),
    listBranches(service, tenant.id, { activeOnly: true }),
    listOrganizationTeams(service, tenant.id, { activeOnly: true }),
    listOrganizationTeamMembers(service, tenant.id),
  ]);

  const userIds = (membershipRows ?? []).map((m) => m.user_id as string);

  const [{ data: profileRows }, authResult] = await Promise.all([
    userIds.length > 0
      ? service
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds)
      : Promise.resolve({ data: [] }),
    service.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  const profileMap = new Map<
    string,
    { full_name: string | null; email: string }
  >();
  for (const p of profileRows ?? []) {
    profileMap.set(p.id as string, {
      full_name: p.full_name as string | null,
      email: p.email as string,
    });
  }

  const confirmedMap = new Map<string, boolean>();
  for (const authUser of authResult.data?.users ?? []) {
    if (userIds.includes(authUser.id)) {
      confirmedMap.set(authUser.id, authUser.email_confirmed_at != null);
    }
  }

  const branchMap = new Map<string, string>(
    branches.map((b) => [b.id, b.name]),
  );
  const teamMap = new Map<string, string>(
    teams.map((team) => [team.id, team.name]),
  );

  const memberBranchPromises = (membershipRows ?? []).map(async (m) => {
    const branchIds = await listMembershipBranches(
      service,
      m.id as string,
    );
    return { id: m.id as string, branchIds };
  });
  const memberBranchResults = await Promise.all(memberBranchPromises);
  const memberBranchMap = new Map(
    memberBranchResults.map((r) => [r.id, r.branchIds]),
  );

  const members: MemberRow[] = (membershipRows ?? []).map((m) => {
    const profile = profileMap.get(m.user_id as string);
    const branchIds = memberBranchMap.get(m.id as string) ?? [];
    const memberTeamIds = teamIdsForMembership(teamMembers, m.id as string);
    return {
      id: m.id as string,
      user_id: m.user_id as string,
      role: m.role as MemberRole,
      created_at: m.created_at as string,
      full_name: profile?.full_name ?? null,
      email: profile?.email ?? "—",
      confirmed: confirmedMap.get(m.user_id as string) ?? false,
      branch_names: branchIds
        .map((id) => branchMap.get(id))
        .filter((n): n is string => !!n),
      team_names: memberTeamIds
        .map((id) => teamMap.get(id))
        .filter((n): n is string => !!n),
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Team
          </h1>
          <p className="text-sm text-muted-foreground">
            Beheer de medewerkers van {tenant.name}.
          </p>
        </div>
        <InviteForm branches={branches} teams={teams} />
      </div>

      <Feedback
        error={error}
        success={success}
        email={emailFeedback}
        reason={reason}
      />

      <Card>
        <CardHeader>
          <CardTitle>Huidige medewerkers</CardTitle>
          <p className="text-sm text-muted-foreground">
            {members.length} medewerker{members.length !== 1 ? "s" : ""} in
            totaal
          </p>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nog geen medewerkers. Gebruik de knop rechtsboven om iemand toe
              te voegen en tijdelijke inloggegevens te versturen.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Naam</th>
                    <th className="pb-2 pr-4 font-medium">E-mail</th>
                    <th className="pb-2 pr-4 font-medium">Rol</th>
                    <th className="pb-2 pr-4 font-medium">Vestigingen</th>
                    <th className="pb-2 pr-4 font-medium">Teams</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Lid sinds</th>
                    <th className="pb-2 font-medium">Acties</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {members.map((member) => {
                    const isSelf = member.user_id === user.id;
                    const displayName = member.full_name ?? member.email;
                    const canScopeBranches =
                      BRANCH_SCOPED_ROLES.has(member.role) &&
                      branches.length > 0;
                    return (
                      <tr key={member.id}>
                        <td className="py-3 pr-4">
                          <span className="font-medium text-foreground">
                            {member.full_name ?? (
                              <span className="italic text-muted-foreground">
                                Geen naam
                              </span>
                            )}
                          </span>
                          {isSelf && (
                            <Badge
                              variant="outline"
                              className="ml-2 text-[10px]"
                            >
                              Jij
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {member.email}
                        </td>
                        <td className="py-3 pr-4">
                          {isSelf ? (
                            <Badge variant="primary">
                              {ROLE_LABEL[member.role] ?? member.role}
                            </Badge>
                          ) : (
                            <form
                              action={changeRole}
                              className="flex items-center gap-2"
                            >
                              <input
                                type="hidden"
                                name="membership_id"
                                value={member.id}
                              />
                              <select
                                name="role"
                                defaultValue={member.role}
                                className="h-7 rounded border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              >
                                {ALL_STAFF_ROLES.map((r) => (
                                  <option key={r} value={r}>
                                    {ROLE_LABEL[r] ?? r}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="submit"
                                className="text-xs text-primary hover:underline"
                              >
                                Opslaan
                              </button>
                            </form>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          {member.branch_names.length > 0 ? (
                            <span className="text-xs text-muted-foreground">
                              {member.branch_names.join(", ")}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/60 italic">
                              Alle vestigingen
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          {member.team_names.length > 0 ? (
                            <span className="text-xs text-muted-foreground">
                              {member.team_names.join(", ")}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/60 italic">
                              Geen team
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          {member.confirmed ? (
                            <Badge variant="success">Actief</Badge>
                          ) : (
                            <Badge variant="info">Uitgenodigd</Badge>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {DATE_FMT.format(new Date(member.created_at))}
                        </td>
                        <td className="py-3">
                          {isSelf ? (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <RemoveMemberButton
                                membershipId={member.id}
                                displayName={displayName}
                              />
                              {canScopeBranches ? (
                                <a
                                  href={`/backoffice/medewerkers/${member.id}/vestigingen`}
                                  className="text-xs text-primary underline-offset-2 hover:underline"
                                >
                                  Vestigingen
                                </a>
                              ) : null}
                              {teams.length > 0 ? (
                                <a
                                  href={`/backoffice/medewerkers/${member.id}/teams`}
                                  className="text-xs text-primary underline-offset-2 hover:underline"
                                >
                                  Teams
                                </a>
                              ) : null}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
