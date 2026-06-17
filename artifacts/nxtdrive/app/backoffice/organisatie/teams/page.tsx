import Link from "next/link";
import { ArrowLeft, MapPin, Users, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { listBranches, type Branch } from "@/lib/branches/service";
import {
  listOrganizationTeamMembers,
  listOrganizationTeams,
  requireOrganizationPermission,
  teamMemberIdsForTeam,
  type OrganizationTeam,
} from "@/lib/organization";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { MemberRole } from "@/lib/types";
import {
  createOrganizationTeamAction,
  updateOrganizationTeamAction,
} from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type MembershipRow = {
  id: string;
  user_id: string;
  role: MemberRole;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string;
};

type StaffOption = {
  membershipId: string;
  label: string;
  role: MemberRole;
};

const STAFF_ROLES: MemberRole[] = [
  "tenant_admin",
  "franchise_admin",
  "branch_manager",
  "planner",
  "admin_staff",
  "marketing",
  "instructor",
];

const ROLE_LABEL: Record<MemberRole, string> = {
  tenant_admin: "Organisatiebeheerder",
  franchise_admin: "Franchisebeheerder",
  branch_manager: "Vestigingsmanager",
  planner: "Planner",
  admin_staff: "Administratie",
  marketing: "Marketing",
  instructor: "Instructeur",
  student: "Leerling",
  parent: "Ouder",
};

function Feedback({
  success,
  error,
  name,
  slug,
  reason,
}: {
  success: string | null;
  error: string | null;
  name: string | null;
  slug: string | null;
  reason: string | null;
}) {
  if (success === "created") {
    return (
      <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
        Team <strong>{name}</strong> aangemaakt.
      </p>
    );
  }
  if (success === "updated") {
    return (
      <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
        Team <strong>{name}</strong> bijgewerkt.
      </p>
    );
  }

  const messages: Record<string, string> = {
    missing_fields: "Vul minimaal naam en slug in.",
    slug_taken: `De slug ${slug ?? ""} is al in gebruik. Kies een andere.`,
    create_failed: "Team aanmaken mislukt.",
    update_failed: "Team bijwerken mislukt.",
    members_failed: "Teamleden opslaan mislukt.",
  };

  if (!error) return null;

  return (
    <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
      {messages[error] ?? "Er is een fout opgetreden."}
      {reason ? ` ${reason}` : null}
    </p>
  );
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

function TeamForm({
  action,
  branches,
  staff,
  team,
  selectedMemberIds,
}: {
  action: (formData: FormData) => Promise<void>;
  branches: Branch[];
  staff: StaffOption[];
  team?: OrganizationTeam | null;
  selectedMemberIds?: string[];
}) {
  const isEdit = !!team;
  const selected = new Set(selectedMemberIds ?? []);

  return (
    <form action={action} className="space-y-5">
      {team ? <input type="hidden" name="team_id" value={team.id} /> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={isEdit ? `name-${team.id}` : "name"}>
            Naam <span className="text-destructive">*</span>
          </Label>
          <Input
            id={isEdit ? `name-${team.id}` : "name"}
            name="name"
            defaultValue={team?.name ?? ""}
            placeholder="Planning"
            required
            autoComplete="off"
          />
        </div>

        {isEdit ? (
          <div className="space-y-1.5">
            <Label>Slug</Label>
            <div className="flex h-10 items-center rounded-md border border-border bg-muted/40 px-3 text-sm font-mono text-muted-foreground">
              {team.slug}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Slug wijzigen komt later via een aparte veilige actie.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="slug">
              Slug <span className="text-destructive">*</span>
            </Label>
            <Input
              id="slug"
              name="slug"
              placeholder="planning"
              pattern="^[a-z0-9][a-z0-9-]*[a-z0-9]$"
              title="Alleen kleine letters, cijfers en koppeltekens; minimaal 2 tekens"
              autoComplete="off"
            />
            <p className="text-[11px] text-muted-foreground">
              Leeg laten mag: dan wordt de slug uit de naam afgeleid.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor={isEdit ? `branch-${team.id}` : "branch_id"}>
            Vestiging
          </Label>
          <select
            id={isEdit ? `branch-${team.id}` : "branch_id"}
            name="branch_id"
            defaultValue={team?.branch_id ?? ""}
            className="flex h-10 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <option value="">Organisatiebreed</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}{branch.city ? ` (${branch.city})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={isEdit ? `color-${team.id}` : "color"}>Kleur</Label>
          <Input
            id={isEdit ? `color-${team.id}` : "color"}
            name="color"
            type="color"
            defaultValue={team?.color ?? "#6d5dfc"}
            className="h-10 p-1"
          />
        </div>

        {isEdit ? (
          <div className="space-y-1.5">
            <Label htmlFor={`status-${team.id}`}>Status</Label>
            <select
              id={`status-${team.id}`}
              name="is_active"
              defaultValue={team.is_active ? "true" : "false"}
              className="flex h-10 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <option value="true">Actief</option>
              <option value="false">Inactief</option>
            </select>
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={isEdit ? `description-${team.id}` : "description"}>
          Beschrijving
        </Label>
        <textarea
          id={isEdit ? `description-${team.id}` : "description"}
          name="description"
          defaultValue={team?.description ?? ""}
          placeholder="Waar is dit team verantwoordelijk voor?"
          rows={3}
          className="flex w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
      </div>

      <div className="space-y-2">
        <Label>Teamleden</Label>
        {staff.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
            Nog geen medewerkers om aan teams te koppelen.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {staff.map((member) => (
              <label
                key={member.membershipId}
                className="flex cursor-pointer items-start gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/40"
              >
                <input
                  type="checkbox"
                  name="membership_ids[]"
                  value={member.membershipId}
                  defaultChecked={selected.has(member.membershipId)}
                  className="mt-1 rounded"
                />
                <span>
                  <span className="block font-medium text-foreground">{member.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {ROLE_LABEL[member.role] ?? member.role}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Dit is teamlidmaatschap, geen permissie. Rollen en scope blijven leidend
          tot Sprint 6.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="submit" className={buttonVariants({ size: "sm" })}>
          {isEdit ? "Team opslaan" : "Team aanmaken"}
        </button>
        {isEdit ? (
          <Link
            href="/backoffice/organisatie/teams"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Annuleren
          </Link>
        ) : null}
      </div>
    </form>
  );
}

export default async function OrganizationTeamsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { organization } = await requireOrganizationPermission("team:manage");
  const sp = await searchParams;
  const success = typeof sp.success === "string" ? sp.success : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const name = typeof sp.name === "string" ? sp.name : null;
  const slug = typeof sp.slug === "string" ? sp.slug : null;
  const reason = typeof sp.reason === "string" ? sp.reason : null;
  const editId = typeof sp.edit === "string" ? sp.edit : null;

  const service = createServiceRoleClient();
  const [branches, teams, teamMembers, membershipsResult] = await Promise.all([
    listBranches(service, organization.id, { activeOnly: true }),
    listOrganizationTeams(service, organization.id),
    listOrganizationTeamMembers(service, organization.id),
    service
      .from("memberships")
      .select("id, user_id, role")
      .eq("tenant_id", organization.id)
      .in("role", STAFF_ROLES)
      .order("role", { ascending: true }),
  ]);

  if (membershipsResult.error) {
    throw new Error(`Kon medewerkers niet laden: ${membershipsResult.error.message}`);
  }

  const memberships = (membershipsResult.data ?? []) as MembershipRow[];
  const userIds = Array.from(new Set(memberships.map((membership) => membership.user_id)));
  const profileRowsResult = userIds.length
    ? await service
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds)
    : { data: [] as ProfileRow[], error: null };

  if (profileRowsResult.error) {
    throw new Error(`Kon medewerkerprofielen niet laden: ${profileRowsResult.error.message}`);
  }

  const profileRows = (profileRowsResult.data ?? []) as ProfileRow[];
  const profileMap = new Map(profileRows.map((profile) => [profile.id, profile]));
  const staff: StaffOption[] = memberships.map((membership) => {
    const profile = profileMap.get(membership.user_id);
    return {
      membershipId: membership.id,
      label: profile?.full_name || profile?.email || membership.user_id,
      role: membership.role,
    };
  });
  const branchMap = new Map(branches.map((branch) => [branch.id, branch]));
  const editTeam = editId ? teams.find((team) => team.id === editId) ?? null : null;
  const activeTeams = teams.filter((team) => team.is_active).length;
  const branchScopedTeams = teams.filter((team) => team.branch_id).length;
  const memberCountByTeam = new Map<string, number>();
  for (const member of teamMembers) {
    memberCountByTeam.set(member.team_id, (memberCountByTeam.get(member.team_id) ?? 0) + 1);
  }
  const assignedMembers = new Set(teamMembers.map((member) => member.membership_id)).size;

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
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Teams
            </h1>
            <p className="text-sm text-muted-foreground">
              Beheer afdelingen binnen {organization.name}. Teams kunnen
              organisatiebreed zijn of optioneel aan een vestiging hangen.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Link
            href="/backoffice/medewerkers"
            className="underline-offset-2 hover:text-foreground hover:underline"
          >
            Medewerkers
          </Link>
          <span>·</span>
          <Link
            href="/backoffice/instellingen/vestigingen"
            className="underline-offset-2 hover:text-foreground hover:underline"
          >
            Vestigingen
          </Link>
        </div>
      </div>

      <Feedback
        success={success}
        error={error}
        name={name}
        slug={slug}
        reason={reason}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Teams"
          value={`${activeTeams}/${teams.length}`}
          description="Actieve teams binnen deze organisatie."
          icon={Workflow}
        />
        <StatCard
          title="Branch-aware"
          value={String(branchScopedTeams)}
          description="Teams die expliciet aan een vestiging zijn gekoppeld."
          icon={MapPin}
        />
        <StatCard
          title="Medewerkers in teams"
          value={String(assignedMembers)}
          description="Unieke medewerkers met minstens één teamlidmaatschap."
          icon={Users}
        />
        <StatCard
          title="Organisatiebreed"
          value={String(teams.length - branchScopedTeams)}
          description="Teams zonder vestigingskoppeling die voor de hele organisatie gelden."
          icon={Workflow}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Nieuw team</CardTitle>
          <p className="text-sm text-muted-foreground">
            Gebruik teams voor afdelingen zoals Planning, Administratie,
            Marketing, Theorie of Management.
          </p>
        </CardHeader>
        <CardContent>
          <TeamForm
            action={createOrganizationTeamAction}
            branches={branches}
            staff={staff}
          />
        </CardContent>
      </Card>

      {editTeam ? (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="text-foreground">
              Team bewerken: {editTeam.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TeamForm
              action={updateOrganizationTeamAction}
              branches={branches}
              staff={staff}
              team={editTeam}
              selectedMemberIds={teamMemberIdsForTeam(teamMembers, editTeam.id)}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-foreground">Overzicht teams</CardTitle>
          <p className="text-sm text-muted-foreground">
            Teams zijn structuur. Permissies blijven voorlopig gekoppeld aan rol
            en vestiging tot Sprint 6.
          </p>
        </CardHeader>
        {teams.length === 0 ? (
          <CardContent>
            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
              <Workflow className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="mt-3 font-medium text-foreground">Nog geen teams</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Maak je eerste team aan om afdelingen binnen de organisatie vast
                te leggen.
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Je kunt meteen medewerkers koppelen of later eerst vestigingen
                aanmaken als je branch-specifieke teams wilt gebruiken.
              </p>
            </div>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Team</th>
                  <th className="px-4 py-3 font-medium">Slug</th>
                  <th className="px-4 py-3 font-medium">Scope</th>
                  <th className="px-4 py-3 font-medium">Leden</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Acties</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {teams.map((team) => {
                  const branch = team.branch_id ? branchMap.get(team.branch_id) : null;
                  const memberCount = memberCountByTeam.get(team.id) ?? 0;
                  return (
                    <tr key={team.id} className="hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: team.color }}
                            aria-hidden
                          />
                          <span className="font-medium text-foreground">{team.name}</span>
                        </div>
                        {team.description ? (
                          <p className="mt-1 max-w-md text-xs text-muted-foreground">
                            {team.description}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {team.slug}
                      </td>
                      <td className="px-4 py-3">
                        {branch ? (
                          <Badge variant="outline">{branch.name}</Badge>
                        ) : (
                          <Badge variant="primary">Organisatiebreed</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-4 w-4" aria-hidden />
                          {memberCount}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {team.is_active ? (
                          <Badge variant="success">Actief</Badge>
                        ) : (
                          <Badge variant="outline">Inactief</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/backoffice/organisatie/teams?edit=${team.id}`}
                          className="text-xs text-primary underline-offset-2 hover:underline"
                        >
                          Bewerken
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
