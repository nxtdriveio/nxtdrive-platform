import { notFound, redirect } from "next/navigation";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  listBranches,
  listMembershipBranches,
} from "@/lib/branches/service";
import { setMembershipBranches } from "@/lib/branches/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

export default async function MemberBranchesPage({
  params,
  searchParams,
}: {
  params: Promise<{ membershipId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);
  const { membershipId } = await params;
  const sp = await searchParams;
  const success = typeof sp.success === "string" ? sp.success : null;
  const error = typeof sp.error === "string" ? sp.error : null;

  const service = createServiceRoleClient();

  // Resolve the membership — must belong to this tenant.
  const { data: membershipRow } = await service
    .from("memberships")
    .select("id, user_id, role")
    .eq("id", membershipId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (!membershipRow) notFound();

  const userId = membershipRow.user_id as string;
  const role = membershipRow.role as MemberRole;

  // Resolve member name.
  const { data: profileRow } = await service
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();

  const displayName =
    (profileRow?.full_name as string | null) ??
    (profileRow?.email as string | null) ??
    "Onbekend";

  // Load all active branches + current assignments.
  const [branches, currentBranchIds] = await Promise.all([
    listBranches(service, tenant.id, { activeOnly: true }),
    listMembershipBranches(service, membershipId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <a
          href="/backoffice/medewerkers"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Terug naar team
        </a>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Vestigingen voor {displayName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Rol: {ROLE_LABEL[role] ?? role} · Selecteer de vestigingen waartoe
          deze medewerker toegang heeft. Geen selectie = toegang tot alle
          vestigingen.
        </p>
      </div>

      {success === "updated" ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          Vestigingstoegang bijgewerkt.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          Opslaan mislukt. Probeer het opnieuw.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Vestigingen</CardTitle>
        </CardHeader>
        <CardContent>
          {branches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nog geen vestigingen aangemaakt.{" "}
              <a
                href="/backoffice/instellingen/vestigingen"
                className="text-primary underline-offset-2 hover:underline"
              >
                Vestigingen beheren →
              </a>
            </p>
          ) : (
            <form action={setMembershipBranches} className="space-y-4">
              <input
                type="hidden"
                name="membership_id"
                value={membershipId}
              />

              <div className="space-y-2">
                {branches.map((b) => {
                  const checked = currentBranchIds.includes(b.id);
                  return (
                    <label
                      key={b.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md border border-input px-3 py-2.5 text-sm transition-colors hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        name="branch_ids[]"
                        value={b.id}
                        defaultChecked={checked}
                        className="rounded"
                      />
                      <span className="font-medium text-foreground">
                        {b.name}
                      </span>
                      {b.city ? (
                        <span className="text-muted-foreground text-xs">
                          ({b.city})
                        </span>
                      ) : null}
                      {b.address ? (
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          {b.address}
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>

              <p className="text-[11px] text-muted-foreground">
                Geen vakje geselecteerd = toegang tot alle vestigingen.
              </p>

              <div className="flex gap-2">
                <Button type="submit" size="sm">
                  Opslaan
                </Button>
                <a
                  href="/backoffice/medewerkers"
                  className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
                >
                  Annuleren
                </a>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
