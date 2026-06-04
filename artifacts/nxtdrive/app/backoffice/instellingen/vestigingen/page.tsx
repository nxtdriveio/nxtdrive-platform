import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { listBranches, type Branch } from "@/lib/branches/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BranchForm } from "./branch-form";
import { createBranch, updateBranch } from "./actions";

export const dynamic = "force-dynamic";

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
  return null;
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
  const editId = typeof sp.edit === "string" ? sp.edit : null;

  const service = createServiceRoleClient();
  const branches = await listBranches(service, tenant.id);

  const editBranch = editId
    ? (branches.find((b) => b.id === editId) ?? null)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Vestigingen
        </h1>
        <p className="text-sm text-muted-foreground">
          Beheer de vestigingen van {tenant.name}. Medewerkers kunnen worden
          beperkt tot één of meerdere vestigingen.
        </p>
      </div>

      <Feedback
        success={success}
        error={error}
        name={name}
        slug={slug}
        reason={reason}
      />

      {/* Create form */}
      <Card>
        <CardHeader>
          <CardTitle>Nieuwe vestiging</CardTitle>
        </CardHeader>
        <CardContent>
          <BranchForm action={createBranch} />
        </CardContent>
      </Card>

      {/* Edit form (shown when ?edit=<id> is in URL) */}
      {editBranch ? (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle>Vestiging bewerken: {editBranch.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <BranchForm action={updateBranch} branch={editBranch} />
          </CardContent>
        </Card>
      ) : null}

      {/* Branch list */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Overzicht vestigingen</CardTitle>
        </CardHeader>
        {branches.length === 0 ? (
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Nog geen vestigingen. Maak hierboven een vestiging aan.
            </p>
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
                <BranchRow key={b.id} branch={b} isEditing={editBranch?.id === b.id} />
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function BranchRow({ branch, isEditing }: { branch: Branch; isEditing: boolean }) {
  return (
    <tr className={isEditing ? "bg-primary/5" : "hover:bg-muted/40"}>
      <td className="px-4 py-3 font-medium text-foreground">{branch.name}</td>
      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{branch.slug}</td>
      <td className="px-4 py-3 text-muted-foreground">{branch.city ?? "—"}</td>
      <td className="px-4 py-3">
        {branch.is_active ? (
          <Badge variant="success">Actief</Badge>
        ) : (
          <Badge variant="outline">Inactief</Badge>
        )}
      </td>
      <td className="px-4 py-3">
        <a
          href={`/backoffice/instellingen/vestigingen?edit=${branch.id}`}
          className="text-xs text-primary underline-offset-2 hover:underline"
        >
          Bewerken
        </a>
      </td>
    </tr>
  );
}
