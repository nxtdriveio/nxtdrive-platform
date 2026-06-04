import { requirePlatformAdmin } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { enterTenantBackoffice, createTenant } from "./actions";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PLAN_LABELS: Record<string, string> = {
  start: "Start",
  pro: "Pro",
  elite: "Elite",
};

const PLAN_VARIANTS: Record<string, "primary" | "default" | "outline"> = {
  start: "outline",
  pro: "primary",
  elite: "default",
};

export default async function PlatformAdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const [user, params] = await Promise.all([
    requirePlatformAdmin(),
    searchParams,
  ]);

  const service = createServiceRoleClient();

  const [
    { data: tenants },
    { count: studentCount },
    { count: instructorCount },
    { count: leadCount },
    { data: studentsByTenant },
    { data: instructorsByTenant },
    { data: leadsByTenant },
  ] = await Promise.all([
    service
      .from("tenants")
      .select("id, slug, name, plan, white_label_enabled, created_at")
      .order("created_at", { ascending: false }),
    service.from("students").select("*", { count: "exact", head: true }),
    service
      .from("memberships")
      .select("*", { count: "exact", head: true })
      .eq("role", "instructor"),
    service.from("leads").select("*", { count: "exact", head: true }),
    service.from("students").select("tenant_id"),
    service.from("memberships").select("tenant_id, role").eq("role", "instructor"),
    service.from("leads").select("tenant_id"),
  ]);

  function countByTenant(rows: { tenant_id: string }[] | null, id: string) {
    return rows?.filter((r) => r.tenant_id === id).length ?? 0;
  }

  const errorMessages: Record<string, string> = {
    missing_fields: "Naam en slug zijn verplicht.",
    slug_exists: "Deze slug is al in gebruik.",
    unknown: "Er is een onbekende fout opgetreden.",
  };

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-8 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <NxtdriveLogo className="text-lg" />
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{user.profile?.full_name ?? user.email}</span>
            <Badge variant="primary">platform admin</Badge>
            <Link
              href="/select-tenant"
              className="text-muted-foreground hover:text-foreground"
            >
              Naar rijschool →
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-8 px-8 py-8">
        {params.created && (
          <div className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
            Rijschool <strong>{params.created}</strong> is aangemaakt.
          </div>
        )}
        {params.error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {errorMessages[params.error] ?? "Er is een fout opgetreden."}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Rijscholen
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">
                {tenants?.length ?? 0}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Leerlingen
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">
                {studentCount ?? 0}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Instructeurs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">
                {instructorCount ?? 0}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Leads
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-foreground">
                {leadCount ?? 0}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              Rijscholen
            </h2>
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Naam</th>
                    <th className="px-4 py-3 font-medium">Slug</th>
                    <th className="px-4 py-3 font-medium">Plan</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Leerlingen
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      Instructeurs
                    </th>
                    <th className="px-4 py-3 text-right font-medium">Leads</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tenants?.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          {t.name}
                          {t.white_label_enabled && (
                            <Badge variant="outline" className="text-xs">
                              WL
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {t.slug}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={PLAN_VARIANTS[t.plan] ?? "outline"}>
                          {PLAN_LABELS[t.plan] ?? t.plan}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {countByTenant(studentsByTenant, t.id)}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {countByTenant(
                          instructorsByTenant as { tenant_id: string }[],
                          t.id,
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {countByTenant(
                          leadsByTenant as { tenant_id: string }[],
                          t.id,
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <form action={enterTenantBackoffice}>
                          <input type="hidden" name="tenant_id" value={t.id} />
                          <Button size="sm" variant="outline" type="submit">
                            Backoffice →
                          </Button>
                        </form>
                      </td>
                    </tr>
                  )) ?? null}
                  {(tenants?.length ?? 0) === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-8 text-center text-muted-foreground"
                      >
                        Nog geen rijscholen aangemaakt.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
          </div>

          <div>
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              Nieuwe rijschool
            </h2>
            <Card>
              <CardContent className="pt-6">
                <form action={createTenant} className="space-y-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="name"
                      className="text-sm font-medium text-foreground"
                    >
                      Naam
                    </label>
                    <Input
                      id="name"
                      name="name"
                      placeholder="Van Dijk Rijschool"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="slug"
                      className="text-sm font-medium text-foreground"
                    >
                      Slug
                    </label>
                    <Input
                      id="slug"
                      name="slug"
                      placeholder="van-dijk"
                      pattern="[a-z0-9-]+"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Alleen kleine letters, cijfers en koppeltekens. Wordt de
                      subdomeinnaam.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="plan"
                      className="text-sm font-medium text-foreground"
                    >
                      Plan
                    </label>
                    <Select id="plan" name="plan" defaultValue="start">
                      <option value="start">Start</option>
                      <option value="pro">Pro</option>
                      <option value="elite">Elite</option>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full">
                    Rijschool aanmaken
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
