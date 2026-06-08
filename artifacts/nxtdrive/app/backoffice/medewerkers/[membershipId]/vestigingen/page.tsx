import Link from "next/link";
import { notFound } from "next/navigation";
import { GovernanceAlerts } from "@/components/organization/governance-alerts";
import { requireOrganizationPermission } from "@/lib/organization";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  listBranches,
  listMembershipBranches,
} from "@/lib/branches/service";
import { setMembershipBranches } from "@/lib/branches/actions";
import {
  isBranchScopedGovernanceRole,
  isStaffGovernanceRole,
  roleGovernanceAlerts,
  roleGovernanceDefinition,
  roleLabel,
  roleScopeLabel,
} from "@/lib/organization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { MemberRole } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MemberBranchesPage({
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

  const [branches, currentBranchIds] = await Promise.all([
    listBranches(service, organization.id, { activeOnly: true }),
    listMembershipBranches(service, membershipId),
  ]);

  const governanceDefinition = isStaffGovernanceRole(role)
    ? roleGovernanceDefinition(role)
    : null;
  const governanceAlerts = roleGovernanceAlerts(role, {
    selectedBranchCount: currentBranchIds.length,
    availableBranchCount: branches.length,
  });
  const rolePrefersBranchScope = isBranchScopedGovernanceRole(role);

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
              Vestigingen voor {displayName}
            </h1>
            <p className="text-sm text-muted-foreground">
              Hier bepaal je de scope waar branch-gebonden rechten van deze medewerker echt mogen gelden.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="primary">{roleLabel(role)}</Badge>
            {governanceDefinition ? (
              <Badge variant="outline">{roleScopeLabel(governanceDefinition.role)}</Badge>
            ) : null}
            <Badge variant="outline">
              {currentBranchIds.length === 0 ? "Alle vestigingen" : `${currentBranchIds.length} geselecteerd`}
            </Badge>
          </div>
        </div>
        <Link
          href={`/backoffice/medewerkers/${membershipId}/teams`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Teams beheren
        </Link>
      </div>

      {success === "updated" ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          Vestigingstoegang bijgewerkt.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          Opslaan mislukt{reason ? `: ${reason}` : "."}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Governance bij branch-scope</CardTitle>
          <p className="text-sm text-muted-foreground">
            Eerst de juiste basisrol, daarna pas vestigingsbeperking. Zo blijft lokaal werk lokaal en centrale toegang bewust.
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
          ) : null}

          <GovernanceAlerts alerts={governanceAlerts} />

          {!rolePrefersBranchScope ? (
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-4 text-sm text-muted-foreground">
              Deze rol is normaal organisatiebreed. Pas branch-selectie hier alleen toe als je echt bewust wilt afwijken van die standaard.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vestigingen</CardTitle>
          <p className="text-sm text-muted-foreground">
            Geen selectie betekent organisatiebrede toegang over alle vestigingen. Gebruik expliciete selectie wanneer een medewerker alleen lokaal mag werken.
          </p>
        </CardHeader>
        <CardContent>
          {branches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nog geen vestigingen aangemaakt.{" "}
              <Link
                href="/backoffice/instellingen/vestigingen"
                className="text-primary underline-offset-2 hover:underline"
              >
                Vestigingen beheren →
              </Link>
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
