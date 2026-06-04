import { requirePlatformAdmin } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { enterTenantBackoffice, createTenant, createTenantAdmin } from "./actions";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PLAN_LABELS: Record<string, string> = {
  start: "Start",
  pro: "Pro",
  elite: "Elite",
};

const PLAN_BADGE: Record<string, "outline" | "primary" | "default"> = {
  start: "outline",
  pro: "primary",
  elite: "default",
};

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: "Vul alle verplichte velden in.",
  slug_exists: "Deze slug is al in gebruik.",
  invite_failed: "Uitnodiging kon niet worden verstuurd.",
  membership_failed: "Lidmaatschap aanmaken mislukt.",
  unknown: "Er is een onbekende fout opgetreden.",
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
    service
      .from("memberships")
      .select("tenant_id, role")
      .eq("role", "instructor"),
    service.from("leads").select("tenant_id"),
  ]);

  function countByTenant(
    rows: { tenant_id: string }[] | null,
    id: string,
  ): number {
    return rows?.filter((r) => r.tenant_id === id).length ?? 0;
  }

  const activeTab = params.tab ?? "tenants";
  const hasError = !!params.error;
  const errorMsg = params.error ? ERROR_MESSAGES[params.error] : null;

  const tabClass = (tab: string) =>
    `px-4 py-2 text-sm font-medium rounded-md transition-colors ${
      activeTab === tab
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:text-foreground hover:bg-muted"
    }`;

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-8">
          <NxtdriveLogo className="text-base sm:text-lg" />
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="hidden text-sm text-muted-foreground sm:block">
              {user.profile?.full_name ?? user.email}
            </span>
            <Badge variant="primary" className="text-xs">
              platform admin
            </Badge>
            <Link
              href="/select-tenant"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Rijschool →
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {[
            { label: "Rijscholen", value: tenants?.length ?? 0 },
            { label: "Leerlingen", value: studentCount ?? 0 },
            { label: "Instructeurs", value: instructorCount ?? 0 },
            { label: "Leads", value: leadCount ?? 0 },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardHeader className="pb-1 pt-4 sm:pb-2">
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {stat.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <p className="text-2xl font-bold text-foreground sm:text-3xl">
                  {stat.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg bg-muted/50 p-1 sm:w-fit">
          {[
            { id: "tenants", label: "Rijscholen" },
            { id: "tenant", label: "Nieuwe rijschool" },
            { id: "admin", label: "Admin aanmaken" },
          ].map((tab) => (
            <Link key={tab.id} href={`/admin?tab=${tab.id}`} className={tabClass(tab.id)}>
              {tab.label}
            </Link>
          ))}
        </div>

        {/* Feedback banners */}
        {params.created && (
          <div className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
            Rijschool <strong>{params.created}</strong> aangemaakt.
          </div>
        )}
        {params.invited && (
          <div className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
            Uitnodiging verstuurd naar <strong>{decodeURIComponent(params.invited)}</strong>.
          </div>
        )}
        {hasError && errorMsg && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {errorMsg}
          </div>
        )}

        {/* Tab: Rijscholen */}
        {activeTab === "tenants" && (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Naam</th>
                    <th className="px-4 py-3 font-medium">Slug</th>
                    <th className="px-4 py-3 font-medium">Plan</th>
                    <th className="px-4 py-3 text-right font-medium">Leerlingen</th>
                    <th className="px-4 py-3 text-right font-medium">Instructeurs</th>
                    <th className="px-4 py-3 text-right font-medium">Leads</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(tenants ?? []).map((t) => (
                    <tr key={t.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          {t.name}
                          {t.white_label_enabled && (
                            <Badge variant="outline" className="text-xs">WL</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {t.slug}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={PLAN_BADGE[t.plan] ?? "outline"}>
                          {PLAN_LABELS[t.plan] ?? t.plan}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {countByTenant(studentsByTenant, t.id)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {countByTenant(
                          instructorsByTenant as { tenant_id: string }[],
                          t.id,
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
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
                  ))}
                  {(tenants?.length ?? 0) === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                        Nog geen rijscholen.{" "}
                        <Link href="/admin?tab=tenant" className="text-primary underline underline-offset-2">
                          Maak er een aan.
                        </Link>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Tab: Nieuwe rijschool */}
        {activeTab === "tenant" && (
          <div className="max-w-md">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Nieuwe rijschool</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={createTenant} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="name" className="text-sm font-medium text-foreground">
                      Naam <span className="text-red-400">*</span>
                    </label>
                    <Input id="name" name="name" placeholder="Rijschool De Wit" required />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="slug" className="text-sm font-medium text-foreground">
                      Slug <span className="text-red-400">*</span>
                    </label>
                    <Input
                      id="slug"
                      name="slug"
                      placeholder="de-wit"
                      pattern="[a-z0-9-]+"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Alleen kleine letters, cijfers en koppeltekens. Wordt{" "}
                      <span className="font-mono">slug.nxtdrive.io</span>.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="plan" className="text-sm font-medium text-foreground">
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
        )}

        {/* Tab: Admin aanmaken */}
        {activeTab === "admin" && (
          <div className="max-w-md">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tenant admin aanmaken</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-sm text-muted-foreground">
                  Bestaat het e-mailadres al? Dan wordt alleen het lidmaatschap
                  toegevoegd. Anders ontvangt de gebruiker een uitnodigingsmail.
                </p>
                <form action={createTenantAdmin} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="email" className="text-sm font-medium text-foreground">
                      E-mailadres <span className="text-red-400">*</span>
                    </label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="eigenaar@rijschool.nl"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="full_name" className="text-sm font-medium text-foreground">
                      Volledige naam
                    </label>
                    <Input
                      id="full_name"
                      name="full_name"
                      placeholder="Jan de Wit"
                    />
                    <p className="text-xs text-muted-foreground">
                      Alleen gebruikt bij nieuwe gebruikers.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="tenant_id" className="text-sm font-medium text-foreground">
                      Rijschool <span className="text-red-400">*</span>
                    </label>
                    <Select id="tenant_id" name="tenant_id" required>
                      <option value="">— kies een rijschool —</option>
                      {(tenants ?? []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.slug})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button type="submit" className="w-full">
                    Admin aanmaken / uitnodigen
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}
