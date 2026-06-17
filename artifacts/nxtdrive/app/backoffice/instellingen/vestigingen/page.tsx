import Link from "next/link";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { listBranches, type Branch } from "@/lib/branches/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { BranchForm } from "./branch-form";
import { createBranch, updateBranch } from "@/lib/branches/actions";
import { PLAN_LABELS } from "@/lib/platform/features";
import {
  canManageExistingBranches,
  loadTenantEntitlementSnapshot,
} from "@/lib/platform/entitlements";
import { ArrowLeft, MapPin, Users, Workflow } from "lucide-react";

export const dynamic = "force-dynamic";

function Feedback({
  success,
  error,
  name,
  slug,
  reason,
  limit,
}: {
  success: string | null;
  error: string | null;
  name: string | null;
  slug: string | null;
  reason: string | null;
  limit: string | null;
}) {
  if (success === "created") {
    return (
      <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
        Vestiging <strong>{name}</strong> aangemaakt.
      </p>
    );
  }
  if (success === "updated") {
    return (
      <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
        Vestiging <strong>{name}</strong> bijgewerkt.
      </p>
    );
  }
  if (error === "missing_fields") {
    return (
      <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
        Vul alle verplichte velden in (naam en slug).
      </p>
    );
  }
  if (error === "slug_taken") {
    return (
      <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
        De slug <strong>{slug}</strong> is al in gebruik. Kies een andere.
      </p>
    );
  }
  if (error === "create_failed" || error === "update_failed") {
    return (
      <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
        Opslaan mislukt{reason ? `: ${reason}` : "."} Probeer het opnieuw.
      </p>
    );
  }
  if (error === "branch_limit_reached") {
    return (
      <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
        Je hebt het maximum aantal vestigingen voor dit abonnement bereikt
        {limit ? ` (${limit})` : ""}. Upgrade naar een hoger plan om extra
        locaties toe te voegen.
      </p>
    );
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

export default async function VestigingenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);
  const sp = await searchParams;

  const success = typeof sp.success === "string" ? sp.success : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const name = typeof sp.name === "string" ? sp.name : null;
  const slug = typeof sp.slug === "string" ? sp.slug : null;
  const reason = typeof sp.reason === "string" ? sp.reason : null;
  const limit = typeof sp.limit === "string" ? sp.limit : null;
  const editId = typeof sp.edit === "string" ? sp.edit : null;

  const service = createServiceRoleClient();
  const branches = await listBranches(service, tenant.id);
  const snapshot = await loadTenantEntitlementSnapshot(service, tenant.id);

  const editBranch = editId
    ? (branches.find((b) => b.id === editId) ?? null)
    : null;
  const hasMultiBranch = snapshot.featureAccess.multi_branch.allowed;
  const branchLimit = snapshot.limitStatuses.branches;
  const canCreateBranches = hasMultiBranch && !branchLimit.isAtLimit;
  const canManageExisting = canManageExistingBranches(snapshot);

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
              Vestigingen
            </h1>
            <p className="text-sm text-muted-foreground">
              Beheer locaties binnen {tenant.name}. Deze vestigingen worden later
              gebruikt voor scope in medewerkers, teams, planning, voertuigen en
              rapportage.
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
            href="/backoffice/organisatie/teams"
            className="underline-offset-2 hover:text-foreground hover:underline"
          >
            Teams
          </Link>
        </div>
      </div>

      {!hasMultiBranch && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <p className="font-medium">Multi-vestiging vereist het Pro-abonnement of hoger.</p>
          <p className="mt-1 text-xs opacity-80">
            {branches.length > 0
              ? "Bestaande vestigingen blijven zichtbaar. Je kunt ze nog corrigeren of afschalen om terug binnen je plan te komen, maar nieuwe locaties toevoegen blijft vergrendeld."
              : "Je kunt vestigingen bekijken, maar aanmaken en bewerken is niet mogelijk op het huidige plan."}{" "}
            Upgrade naar {PLAN_LABELS.pro} of hoger om deze beheerlaag weer volledig te openen.
          </p>
          <Link
            href="/backoffice/abonnement"
            className={`${buttonVariants({ variant: "outline", size: "sm" })} mt-3`}
          >
            Abonnement bekijken
          </Link>
        </div>
      )}

      {error === "plan_required" && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          Multi-vestiging is niet beschikbaar op jouw huidige abonnement.
        </div>
      )}

      {hasMultiBranch && (branchLimit.isAtLimit || branchLimit.isOverLimit) && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <p className="font-medium">
            {branchLimit.isOverLimit
              ? `Vestigingslimiet overschreden: ${branchLimit.used}/${branchLimit.limitLabel}`
              : `Vestigingslimiet bereikt: ${branchLimit.used}/${branchLimit.limitLabel}`}
          </p>
          <p className="mt-1 text-xs opacity-80">
            {branchLimit.isOverLimit
              ? "Deze organisatie gebruikt meer actieve vestigingen dan binnen het huidige plan past. Alles blijft zichtbaar en je kunt vestigingen nog afschalen of corrigeren, maar uitbreiding blijft vergrendeld totdat het plan wordt verhoogd."
              : "Deze organisatie kan geen extra vestigingen meer aanmaken op het huidige abonnement. Bestaande vestigingen blijven werken, maar uitbreiden vereist een upgrade."}
          </p>
          <Link
            href="/backoffice/abonnement"
            className={`${buttonVariants({ variant: "outline", size: "sm" })} mt-3`}
          >
            Upgrade-opties bekijken
          </Link>
        </div>
      )}

      <Feedback
        success={success}
        error={error === "plan_required" ? null : error}
        name={name}
        slug={slug}
        reason={reason}
        limit={limit}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Actieve vestigingen"
          value={
            branchLimit.isUnlimited
              ? String(branchLimit.used)
              : `${branchLimit.used}/${branchLimit.limitLabel}`
          }
          description="Actieve locaties binnen deze organisatiecontainer en planlimiet."
          icon={MapPin}
        />
        <StatCard
          title="Scope"
          value={hasMultiBranch ? "Pro+" : "Start"}
          description="Beschikbaarheid van multi-vestiging binnen het huidige abonnement."
          icon={Workflow}
        />
        <StatCard
          title="Medewerkers"
          value={branches.length === 0 ? "0" : "Scope klaar"}
          description="Vestigingen kunnen gebruikt worden om medewerkers per locatie te beperken."
          icon={Users}
        />
        <StatCard
          title="Teams"
          value={branches.length === 0 ? "Optioneel" : "Branch-aware"}
          description="Teams kunnen organisatiebreed blijven of aan een vestiging gekoppeld worden."
          icon={Workflow}
        />
      </div>

      {canCreateBranches && (
        <Card>
          <CardHeader>
            <CardTitle>Nieuwe vestiging</CardTitle>
            <p className="text-sm text-muted-foreground">
              Maak een operationele locatie aan. De slug is later niet meer
              wijzigbaar en vormt de stabiele branch-identiteit in de code en
              data-laag.
            </p>
          </CardHeader>
          <CardContent>
            <BranchForm action={createBranch} />
          </CardContent>
        </Card>
      )}

      {canManageExisting && editBranch ? (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle>
              {!hasMultiBranch ? "Bestaande vestiging beheren" : "Vestiging bewerken"}:{" "}
              {editBranch.name}
            </CardTitle>
            {!hasMultiBranch ? (
              <p className="text-sm text-muted-foreground">
                Downgrade-modus: je kunt deze vestiging nog corrigeren of
                inactief zetten, maar geen nieuwe locaties meer toevoegen
                totdat het plan weer {PLAN_LABELS.pro} of hoger is.
              </p>
            ) : null}
          </CardHeader>
          <CardContent>
            <BranchForm action={updateBranch} branch={editBranch} />
          </CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Overzicht vestigingen</CardTitle>
          <p className="text-sm text-muted-foreground">
            Vestigingen zijn optioneel. Geen vestigingen betekent niet dat de
            organisatie fout staat; dan blijft de scope gewoon organisatiebreed.
          </p>
        </CardHeader>
        {branches.length === 0 ? (
          <CardContent>
            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
              <MapPin className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="mt-3 font-medium text-foreground">Nog geen vestigingen</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Voeg pas vestigingen toe als je ze operationeel nodig hebt. Voor
                een enkele instructeur of kleine school mag dit scherm rustig leeg blijven.
              </p>
              {hasMultiBranch ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Zodra je meerdere locaties wilt scheiden voor planning of
                  medewerkers, kun je hierboven beginnen.
                </p>
              ) : null}
            </div>
          </CardContent>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Naam</th>
                <th className="px-4 py-3 font-medium">Slug</th>
                <th className="px-4 py-3 font-medium">Stad</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {branches.map((b) => (
                <BranchRow
                  key={b.id}
                  branch={b}
                  isEditing={editBranch?.id === b.id}
                  canEdit={canManageExisting}
                />
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function BranchRow({
  branch,
  isEditing,
  canEdit,
}: {
  branch: Branch;
  isEditing: boolean;
  canEdit: boolean;
}) {
  return (
    <tr className={isEditing ? "bg-primary/5" : "hover:bg-muted/40"}>
      <td className="px-4 py-3 font-medium text-foreground">{branch.name}</td>
      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{branch.slug}</td>
      <td className="px-4 py-3 text-muted-foreground">{branch.city ?? "—"}</td>
      <td className="px-4 py-3">
        {branch.is_active ? (
          <Badge variant="success">Actief</Badge>
        ) : (
          <Badge variant="outline">Inactief</Badge>
        )}
      </td>
      <td className="px-4 py-3">
        {canEdit ? (
          <a
            href={`/backoffice/instellingen/vestigingen?edit=${branch.id}`}
            className="text-xs text-primary underline-offset-2 hover:underline"
          >
            Bewerken
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">Read-only</span>
        )}
      </td>
    </tr>
  );
}
