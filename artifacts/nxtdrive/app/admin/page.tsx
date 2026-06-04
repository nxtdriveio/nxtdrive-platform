import { requirePlatformAdmin } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { enterTenantBackoffice, createTenant } from "./actions";
import { computeMrr } from "@/lib/platform/mrr-config";
import { getPlatformGrowthData } from "@/lib/platform/growth-data";
import { TenantGrowthChart } from "@/components/charts/TenantGrowthChart";
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
  const [user, params] = await Promise.all([requirePlatformAdmin(), searchParams]);
  const service = createServiceRoleClient();
  const activeTab = params.tab ?? "tenants";

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

  // Load growth data only when the Groei tab is active
  const growthData = activeTab === "groei" ? await getPlatformGrowthData(service) : null;

  // MRR is restricted to tenants with activity in the last 30 days.
  // Inactive / churn-risk tenants are excluded so the metric reflects
  // the revenue at risk of being lost, not a theoretical maximum.
  const activeTenantPlan =
    growthData !== null
      ? (tenants ?? []).filter((t) => growthData.activeTenantIds.has(t.id))
      : [];
  const mrr = computeMrr(activeTenantPlan);

  function countByTenant(rows: { tenant_id: string }[] | null, id: string): number {
    return rows?.filter((r) => r.tenant_id === id).length ?? 0;
  }

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
        {/* Platform KPI strip */}
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
            { id: "groei", label: "Groei & MRR" },
            { id: "tenant", label: "Nieuwe rijschool" },
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
                        <Link
                          href={`/admin/tenants/${t.id}`}
                          className="flex items-center gap-2 hover:underline underline-offset-2"
                        >
                          {t.name}
                          {t.white_label_enabled && (
                            <Badge variant="outline" className="text-xs">WL</Badge>
                          )}
                        </Link>
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
                        {countByTenant(instructorsByTenant as { tenant_id: string }[], t.id)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {countByTenant(leadsByTenant as { tenant_id: string }[], t.id)}
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

        {/* Tab: Groei & MRR */}
        {activeTab === "groei" && growthData && (
          <div className="space-y-6">
            {/* MRR + ARR cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Geschatte MRR</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-foreground">
                    €{mrr.totalMonthly.toLocaleString("nl-NL")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    maandelijkse omzetschatting
                  </p>

                  {/* MRR stacked bar */}
                  {mrr.totalMonthly > 0 && (
                    <div className="mt-4">
                      <div className="flex h-3 w-full overflow-hidden rounded-full">
                        {mrr.byTier
                          .filter((t) => t.total > 0)
                          .map((t, i) => {
                            const pct = Math.round((t.total / mrr.totalMonthly) * 100);
                            const colors = ["bg-amber-500", "bg-primary", "bg-purple-500"];
                            return (
                              <div
                                key={t.plan}
                                className={colors[i % colors.length]}
                                style={{ width: `${pct}%` }}
                                title={`${t.label}: €${t.total} (${pct}%)`}
                              />
                            );
                          })}
                      </div>
                      <ul className="mt-2 space-y-1">
                        {mrr.byTier.map((t, i) => {
                          const colors = [
                            "bg-amber-500",
                            "bg-primary",
                            "bg-purple-500",
                          ];
                          const pct =
                            mrr.totalMonthly > 0
                              ? Math.round((t.total / mrr.totalMonthly) * 100)
                              : 0;
                          return (
                            <li
                              key={t.plan}
                              className="flex items-center justify-between text-xs"
                            >
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <span
                                  className={`h-2 w-2 shrink-0 rounded-full ${colors[i % colors.length]}`}
                                />
                                <Badge
                                  variant={PLAN_BADGE[t.plan] ?? "outline"}
                                  className="text-[10px]"
                                >
                                  {t.label}
                                </Badge>
                                {t.count}× ({pct}%)
                              </span>
                              <span className="font-medium text-foreground">
                                €{t.total.toLocaleString("nl-NL")}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  {mrr.totalMonthly === 0 && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Nog geen rijscholen op een betaald plan.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Geschatte ARR</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-foreground">
                    €{mrr.annualised.toLocaleString("nl-NL")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    MRR × 12 — geannualiseerde omzet
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Actieve rijscholen</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-foreground">
                    {growthData.totalTenantsAllTime}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    totaal aangemaakt
                  </p>
                  {growthData.inactiveTenants.length > 0 && (
                    <p className="mt-2 text-xs text-warning">
                      {growthData.inactiveTenants.length} mogelijk inactief
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Tenant growth chart */}
            <Card>
              <CardHeader>
                <CardTitle>Tenant-groei (laatste 12 maanden)</CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <TenantGrowthChart
                  data={growthData.tenantGrowth.map((p) => ({
                    label: p.label,
                    newTenants: p.newTenants,
                    cumulative: p.cumulative,
                  }))}
                  height={240}
                />
              </CardContent>
            </Card>

            {/* Active tenants + Inactive */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="overflow-hidden">
                <CardHeader>
                  <CardTitle>Actiefste rijscholen</CardTitle>
                </CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Rijschool</th>
                        <th className="px-4 py-2.5 text-right font-medium">Leerlingen</th>
                        <th className="px-4 py-2.5 text-right font-medium">Lessen (mnd)</th>
                        <th className="px-4 py-2.5 text-right font-medium">Leads</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {growthData.activeTenants.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                            Nog geen activiteit.
                          </td>
                        </tr>
                      ) : (
                        growthData.activeTenants.map((t, i) => (
                          <tr key={t.id} className="hover:bg-muted/20">
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="w-5 text-xs tabular-nums text-muted-foreground">
                                  {i + 1}.
                                </span>
                                <div>
                                  <Link
                                    href={`/admin/tenants/${t.id}`}
                                    className="font-medium text-foreground hover:underline underline-offset-2"
                                  >
                                    {t.name}
                                  </Link>
                                  <p className="text-xs text-muted-foreground">{t.slug}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                              {t.studentCount}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                              {t.lessonsThisMonth}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                              {t.leadCount}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>
                    Mogelijk inactief
                    {growthData.inactiveTenants.length > 0 && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                        {growthData.inactiveTenants.length}
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {growthData.inactiveTenants.length === 0 ? (
                    <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-border">
                      <p className="text-sm text-muted-foreground">
                        Alle rijscholen zijn actief.
                      </p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-border">
                      {growthData.inactiveTenants.slice(0, 8).map((t) => (
                        <li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                          <div>
                            <Link
                              href={`/admin/tenants/${t.id}`}
                              className="font-medium text-foreground hover:underline underline-offset-2"
                            >
                              {t.name}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {t.daysSinceCreation} dagen geleden aangemaakt
                            </p>
                          </div>
                          <Badge variant={PLAN_BADGE[t.plan] ?? "outline"}>
                            {PLAN_LABELS[t.plan] ?? t.plan}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-3 text-xs text-muted-foreground">
                    Geen leerling of les in de afgelopen 30 dagen.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
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
                      <option value="start">Start — €49/mnd</option>
                      <option value="pro">Pro — €99/mnd</option>
                      <option value="elite">Elite — €199/mnd</option>
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
      </div>
    </main>
  );
}
