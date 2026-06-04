import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { inviteInstructor, changeRole } from "./actions";
import { RemoveMemberButton } from "./remove-button";
import type { MemberRole } from "@/lib/types";

export const dynamic = "force-dynamic";

type MemberRow = {
  id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
  full_name: string | null;
  email: string;
};

const ROLE_LABEL: Record<string, string> = {
  tenant_admin: "Beheerder",
  instructor: "Instructeur",
};

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
  if (success === "invited") {
    return (
      <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
        Uitnodiging verstuurd naar <strong>{email}</strong>.
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

  const errorMessages: Record<string, string> = {
    missing_fields: "Vul alle verplichte velden in.",
    already_member: `${email ? `${email} heeft` : "Dit account heeft"} al deze rol in jouw school.`,
    invite_failed: `Uitnodiging mislukt${reason ? `: ${reason}` : "."}`,
    membership_failed: "Lidmaatschap kon niet worden aangemaakt.",
    remove_failed: "Verwijderen mislukt. Probeer het opnieuw.",
    cannot_remove_self: "Je kunt jezelf niet verwijderen.",
    cannot_change_own_role: "Je kunt je eigen rol niet wijzigen.",
    role_conflict: "Deze medewerker heeft deze rol al.",
    update_failed: "Rolwijziging mislukt. Probeer het opnieuw.",
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
  const sp = await searchParams;

  const error = typeof sp.error === "string" ? sp.error : null;
  const success = typeof sp.success === "string" ? sp.success : null;
  const emailFeedback = typeof sp.email === "string" ? sp.email : null;
  const reason = typeof sp.reason === "string" ? sp.reason : null;

  const service = createServiceRoleClient();

  const { data: membershipRows } = await service
    .from("memberships")
    .select("id, user_id, role, created_at")
    .eq("tenant_id", tenant.id)
    .in("role", ["tenant_admin", "instructor"])
    .order("created_at", { ascending: true });

  const userIds = (membershipRows ?? []).map((m) => m.user_id as string);

  const { data: profileRows } =
    userIds.length > 0
      ? await service
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds)
      : { data: [] };

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

  const members: MemberRow[] = (membershipRows ?? []).map((m) => {
    const profile = profileMap.get(m.user_id as string);
    return {
      id: m.id as string,
      user_id: m.user_id as string,
      role: m.role as MemberRole,
      created_at: m.created_at as string,
      full_name: profile?.full_name ?? null,
      email: profile?.email ?? "—",
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Team
        </h1>
        <p className="text-sm text-muted-foreground">
          Beheer de instructeurs en beheerders van {tenant.name}.
        </p>
      </div>

      <Feedback
        error={error}
        success={success}
        email={emailFeedback}
        reason={reason}
      />

      <Card>
        <CardHeader>
          <CardTitle>Medewerker uitnodigen</CardTitle>
          <p className="text-sm text-muted-foreground">
            De uitgenodigde persoon ontvangt een e-mail om een wachtwoord in te
            stellen en krijgt direct toegang tot de geselecteerde omgeving.
          </p>
        </CardHeader>
        <CardContent>
          <form action={inviteInstructor} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="full_name">Naam</Label>
                <Input
                  id="full_name"
                  name="full_name"
                  type="text"
                  placeholder="Jan de Vries"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">
                  E-mailadres <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="jan@rijschool.nl"
                  autoComplete="off"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role">
                  Rol <span className="text-destructive">*</span>
                </Label>
                <select
                  id="role"
                  name="role"
                  required
                  defaultValue="instructor"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="instructor">Instructeur</option>
                  <option value="tenant_admin">Beheerder</option>
                </select>
              </div>
            </div>
            <Button type="submit" size="sm">
              Uitnodiging versturen
            </Button>
          </form>
        </CardContent>
      </Card>

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
              Nog geen medewerkers. Nodig iemand uit via het formulier
              hierboven.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Naam</th>
                    <th className="pb-2 pr-4 font-medium">E-mail</th>
                    <th className="pb-2 pr-4 font-medium">Rol</th>
                    <th className="pb-2 pr-4 font-medium">Lid sinds</th>
                    <th className="pb-2 font-medium">Acties</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {members.map((member) => {
                    const isSelf = member.user_id === user.id;
                    const displayName =
                      member.full_name ?? member.email;
                    return (
                      <tr key={member.id}>
                        <td className="py-3 pr-4">
                          <span className="font-medium text-foreground">
                            {member.full_name ?? (
                              <span className="italic text-muted-foreground">
                                Uitnodiging in behandeling
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
                            <Badge variant="outline">
                              {ROLE_LABEL[member.role] ?? member.role}
                            </Badge>
                          ) : (
                            <form action={changeRole} className="flex items-center gap-2">
                              <input
                                type="hidden"
                                name="membership_id"
                                value={member.id}
                              />
                              <input
                                type="hidden"
                                name="user_id"
                                value={member.user_id}
                              />
                              <select
                                name="role"
                                defaultValue={member.role}
                                className="h-7 rounded border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              >
                                <option value="instructor">Instructeur</option>
                                <option value="tenant_admin">Beheerder</option>
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
                        <td className="py-3 pr-4 text-muted-foreground">
                          {DATE_FMT.format(new Date(member.created_at))}
                        </td>
                        <td className="py-3">
                          {isSelf ? (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          ) : (
                            <RemoveMemberButton
                              membershipId={member.id}
                              userId={member.user_id}
                              displayName={displayName}
                            />
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
