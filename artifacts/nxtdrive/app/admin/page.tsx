import { requirePlatformAdmin } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { enterTenantBackoffice, savePlatformEmailConfig, savePlatformAiConfig } from "./actions";
import { NewTenantForm } from "./new-tenant-form";
import { computeMrr } from "@/lib/platform/mrr-config";
import { getPlatformGrowthData } from "@/lib/platform/growth-data";
import { getPlatformEmailConfigStatus } from "@/lib/email/platform-config";
import { getAiConfigStatus } from "@/lib/ai/platform-config";
import { listThemePresets } from "@/lib/branding";
import {
  PLAN_DESCRIPTIONS,
  isWhiteLabelEligible,
} from "@/lib/platform/features";
import {
  ENTITLEMENT_STAFF_ROLES,
  getTenantLimitStatuses,
} from "@/lib/platform/entitlements";
import { TenantGrowthChart } from "@/components/charts/TenantGrowthChart";
import { ThemePresetForm } from "@/components/admin/theme-preset-form";
import type { ThemePreset } from "@/lib/types";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Building2,
  CircleAlert,
  CreditCard,
  Palette,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import { upsertThemePresetAction } from "./actions";

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

const ORG_TYPE_LABELS: Record<string, string> = {
  zzp: "ZZP",
  rijschool: "Rijschool",
  groot: "Groot",
  multi_vestiging: "Multi-vestiging",
  franchise: "Franchise",
};

const LIFECYCLE_LABELS: Record<string, string> = {
  prospect: "Prospect",
  onboarding: "Onboarding",
  active: "Actief",
  paused: "Gepauzeerd",
  churned: "Gestopt",
};

const ONBOARDING_LABELS: Record<string, string> = {
  not_started: "Niet gestart",
  in_progress: "In uitvoering",
  ready: "Klaar",
  blocked: "Geblokkeerd",
};

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: "Vul alle verplichte velden in.",
  slug_exists: "Deze slug is al in gebruik.",
  invite_failed: "Uitnodiging kon niet worden verstuurd.",
  membership_failed: "Lidmaatschap aanmaken mislukt.",
  invalid_plan: "Ongeldig abonnement gekozen.",
  invalid_org_type: "Ongeldig organisatietype gekozen.",
  invalid_lifecycle_status: "Ongeldige lifecycle-status gekozen.",
  invalid_onboarding_status: "Ongeldige onboarding-status gekozen.",
  invalid_franchise_parent: "Franchisegever bestaat niet of is ongeldig.",
  owner_not_found: "Eigenaar e-mail bestaat nog niet als auth user.",
  unknown: "Er is een onbekende fout opgetreden.",
};

const MRR_SEGMENT_COLORS = ["var(--warning)", "var(--info)", "var(--primary)"] as const;

export default async function PlatformAdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const [user, params] = await Promise.all([requirePlatformAdmin(), searchParams]);
  const service = createServiceRoleClient();
  const activeTab = params.tab ?? "overview";
  const query = (params.q ?? "").trim().toLowerCase();

  const [
    { data: tenants },
    { count: studentCount },
    { count: instructorCount },
    { count: leadCount },
    { data: studentsByTenant },
    { data: instructorsByTenant },
    { data: leadsByTenant },
    { data: organizationProfiles },
    { data: activeBranchesByTenant },
    { data: staffMembershipsByTenant },
    { data: customDomainsByTenant },
  ] = await Promise.all([
    service
      .from("tenants")
      .select("id, slug, name, plan, white_label_enabled, org_type, created_at, parent_tenant_id")
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
    service
      .from("organization_profiles")
      .select("tenant_id, lifecycle_status, onboarding_status"),
    service
      .from("branches")
      .select("tenant_id, is_active")
      .eq("is_active", true),
    service
      .from("memberships")
      .select("tenant_id, role")
      .in("role", ENTITLEMENT_STAFF_ROLES),
    service
      .from("tenant_domains")
      .select("tenant_id, type")
      .eq("type", "custom"),
  ]);

  // Load growth data only when the Groei tab is active
  const growthData = activeTab === "groei" ? await getPlatformGrowthData(service) : null;

  const platformEmailStatus = activeTab === "email"
    ? await getPlatformEmailConfigStatus(service)
    : null;

  const aiConfigStatus = activeTab === "ai"
    ? await getAiConfigStatus(service)
    : null;
  const themeTabData: {
    presets: ThemePreset[];
    assignments: Array<{ tenant_id: string; theme_preset_id: string | null }>;
  } =
    activeTab === "themes"
      ? {
          presets: await listThemePresets(),
          assignments:
            (
              await service
                .from("tenant_branding")
                .select("tenant_id, theme_preset_id")
                .not("theme_preset_id", "is", null)
            ).data ?? [],
        }
      : {
          presets: [],
          assignments: [],
        };
  const { presets: themePresets, assignments: themeAssignments } = themeTabData;

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

  const organizationProfileMap = new Map(
    (organizationProfiles ?? []).map((profile) => [profile.tenant_id, profile]),
  );

  const tenantRows = (tenants ?? []).map((tenant) => {
    const profile = organizationProfileMap.get(tenant.id);
    const usage = {
      branches: countByTenant(activeBranchesByTenant as { tenant_id: string }[], tenant.id),
      staff_memberships: countByTenant(
        staffMembershipsByTenant as { tenant_id: string }[],
        tenant.id,
      ),
      custom_domains: countByTenant(
        customDomainsByTenant as { tenant_id: string }[],
        tenant.id,
      ),
    };
    const limitStatuses = getTenantLimitStatuses(tenant, usage);
    const limitAlertCount = Object.values(limitStatuses).filter(
      (status) => status.isAtLimit || status.isOverLimit,
    ).length;
    const whiteLabelDowngraded =
      !!tenant.white_label_enabled && !isWhiteLabelEligible(tenant);
    return {
      ...tenant,
      lifecycle_status: profile?.lifecycle_status ?? "onboarding",
      onboarding_status: profile?.onboarding_status ?? "not_started",
      student_count: countByTenant(studentsByTenant as { tenant_id: string }[], tenant.id),
      instructor_count: countByTenant(
        instructorsByTenant as { tenant_id: string }[],
        tenant.id,
      ),
      lead_count: countByTenant(leadsByTenant as { tenant_id: string }[], tenant.id),
      usage,
      limitStatuses,
      whiteLabelDowngraded,
      alertCount: limitAlertCount + (whiteLabelDowngraded ? 1 : 0),
    };
  });

  const filteredTenants = tenantRows.filter((tenant) => {
    if (!query) return true;
    return (
      tenant.name.toLowerCase().includes(query) ||
      tenant.slug.toLowerCase().includes(query) ||
      LIFECYCLE_LABELS[tenant.lifecycle_status]?.toLowerCase().includes(query) ||
      ONBOARDING_LABELS[tenant.onboarding_status]?.toLowerCase().includes(query)
    );
  });

  const planCounts = {
    start: tenantRows.filter((tenant) => tenant.plan === "start").length,
    pro: tenantRows.filter((tenant) => tenant.plan === "pro").length,
    elite: tenantRows.filter((tenant) => tenant.plan === "elite").length,
  };
  const lifecycleCounts = {
    active: tenantRows.filter((tenant) => tenant.lifecycle_status === "active").length,
    onboarding: tenantRows.filter((tenant) => tenant.lifecycle_status === "onboarding").length,
    paused: tenantRows.filter((tenant) => tenant.lifecycle_status === "paused").length,
    churned: tenantRows.filter((tenant) => tenant.lifecycle_status === "churned").length,
  };
  const onboardingCounts = {
    not_started: tenantRows.filter((tenant) => tenant.onboarding_status === "not_started").length,
    in_progress: tenantRows.filter((tenant) => tenant.onboarding_status === "in_progress").length,
    ready: tenantRows.filter((tenant) => tenant.onboarding_status === "ready").length,
    blocked: tenantRows.filter((tenant) => tenant.onboarding_status === "blocked").length,
  };
  const whiteLabelActiveCount = tenantRows.filter((tenant) =>
    isWhiteLabelEligible(tenant),
  ).length;
  const franchiseNetworkCount = tenantRows.filter(
    (tenant) =>
      tenantRows.some((candidate) => candidate.parent_tenant_id === tenant.id),
  ).length;
  const attentionTenants = [...tenantRows]
    .filter(
      (tenant) =>
        tenant.alertCount > 0 ||
        tenant.onboarding_status === "blocked" ||
        tenant.lifecycle_status === "paused",
    )
    .sort((left, right) => right.alertCount - left.alertCount)
    .slice(0, 8);
  const recentTenants = [...tenantRows].slice(0, 6);
  const paidTenants = tenantRows.filter((tenant) => tenant.plan !== "start").length;

  const hasError = !!params.error;
  const errorMsg = params.error ? ERROR_MESSAGES[params.error] : null;
  const themeUsageMap = new Map<string, string[]>();

  if (activeTab === "themes") {
    for (const row of themeAssignments) {
      if (!row.theme_preset_id) continue;
      const tenantName =
        tenantRows.find((tenant) => tenant.id === row.tenant_id)?.name ??
        row.tenant_id;
      const tenantsForPreset = themeUsageMap.get(row.theme_preset_id) ?? [];
      tenantsForPreset.push(tenantName);
      themeUsageMap.set(row.theme_preset_id, tenantsForPreset);
    }
  }

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
            <form method="post" action="/auth/logout">
              <button
                type="submit"
                aria-label="Uitloggen"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                Uitloggen
              </button>
            </form>
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
        <div className="flex flex-wrap gap-1 rounded-lg bg-muted/50 p-1 sm:w-fit">
          {[
            { id: "overview", label: "Overzicht" },
            { id: "tenants", label: "Rijscholen" },
            { id: "groei", label: "Groei & MRR" },
            { id: "tenant", label: "Nieuwe rijschool" },
            { id: "email", label: "E-mail" },
            { id: "ai", label: "AI-model" },
            { id: "themes", label: "Thema's" },
          ].map((tab) => (
            <Link key={tab.id} href={`/admin?tab=${tab.id}`} className={tabClass(tab.id)}>
              {tab.label}
            </Link>
          ))}
          <Link
            href="/admin/notifications"
            className="px-4 py-2 text-sm font-medium rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            Notificaties ↗
          </Link>
        </div>

        {activeTab === "overview" && (
          <div className="space-y-6">
            <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(145deg,color-mix(in_srgb,var(--card)_92%,transparent),color-mix(in_srgb,var(--primary)_10%,transparent))] p-5 shadow-[0_24px_80px_rgba(6,12,24,0.22)] sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-primary/90">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                    Platform cockpit
                  </div>
                  <div className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                      Centrale regie over NXTDRIVE
                    </h1>
                    <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                      Beheer tenantgroei, abonnementen, onboarding en platformconfiguratie vanuit een echt operationeel dashboard in plaats van losse adminformulieren.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href="/admin?tab=tenant"
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    + Nieuwe rijschool
                  </Link>
                  <Link
                    href="/admin?tab=tenants"
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    Tenantlijst openen
                  </Link>
                </div>
              </div>
            </section>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "Betaalde tenants",
                  value: paidTenants,
                  description: "Pro en Elite samen",
                  icon: CreditCard,
                },
                {
                  label: "White-label actief",
                  value: whiteLabelActiveCount,
                  description: "Elite + tenant toggle actief",
                  icon: Palette,
                },
                {
                  label: "Franchise netwerken",
                  value: franchiseNetworkCount,
                  description: "Tenants met gekoppelde franchisees",
                  icon: Building2,
                },
                {
                  label: "Aandacht nodig",
                  value: attentionTenants.length,
                  description: "Alert, blocked of paused",
                  icon: CircleAlert,
                },
              ].map((stat) => {
                const Icon = stat.icon;
                return (
                  <Card key={stat.label}>
                    <CardHeader className="flex-row items-center justify-between gap-3">
                      <div>
                        <CardTitle>{stat.label}</CardTitle>
                        <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                          {stat.value}
                        </p>
                      </div>
                      <span className="rounded-full bg-primary-soft p-2 text-primary">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{stat.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
              <Card>
                <CardHeader>
                  <CardTitle className="text-foreground">Tenant-aandacht</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {attentionTenants.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                      Geen directe platformalerts. Tenantportfolio staat momenteel rustig.
                    </div>
                  ) : (
                    attentionTenants.map((tenant) => (
                      <div
                        key={tenant.id}
                        className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-muted/20 px-4 py-4"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/admin/tenants/${tenant.id}`}
                              className="font-medium text-foreground underline-offset-2 hover:underline"
                            >
                              {tenant.name}
                            </Link>
                            <Badge variant={PLAN_BADGE[tenant.plan] ?? "outline"}>
                              {PLAN_LABELS[tenant.plan] ?? tenant.plan}
                            </Badge>
                            {tenant.alertCount > 0 ? (
                              <Badge variant="warning">
                                {tenant.alertCount} alert{tenant.alertCount === 1 ? "" : "s"}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {LIFECYCLE_LABELS[tenant.lifecycle_status] ?? tenant.lifecycle_status} -{" "}
                            {ONBOARDING_LABELS[tenant.onboarding_status] ?? tenant.onboarding_status}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {tenant.whiteLabelDowngraded
                              ? "White-label configuratie staat boven huidige plan."
                              : tenant.alertCount > 0
                                ? "Minstens een entitlementlimiet vraagt opvolging."
                                : "Operationele opvolging nodig vanuit lifecycle of onboarding."}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/admin/tenants/${tenant.id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                          >
                            Details
                          </Link>
                          <form action={enterTenantBackoffice}>
                            <input type="hidden" name="tenant_id" value={tenant.id} />
                            <Button size="sm" variant="outline" type="submit">
                              Backoffice
                            </Button>
                          </form>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-foreground">Planverdeling</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(["start", "pro", "elite"] as const).map((plan) => (
                      <div
                        key={plan}
                        className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-3"
                      >
                        <div>
                          <p className="font-medium text-foreground">{PLAN_LABELS[plan]}</p>
                          <p className="text-xs text-muted-foreground">
                            {PLAN_DESCRIPTIONS[plan]}
                          </p>
                        </div>
                        <Badge variant={PLAN_BADGE[plan] ?? "outline"}>
                          {planCounts[plan]}
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-foreground">Onboarding & lifecycle</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2">
                    {[
                      {
                        label: "Actief",
                        value: lifecycleCounts.active,
                        tone: "success",
                      },
                      {
                        label: "Onboarding",
                        value: lifecycleCounts.onboarding,
                        tone: "info",
                      },
                      {
                        label: "Blocked",
                        value: onboardingCounts.blocked,
                        tone: "warning",
                      },
                      {
                        label: "Paused",
                        value: lifecycleCounts.paused,
                        tone: "danger",
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="rounded-xl border border-border bg-muted/20 px-4 py-3"
                      >
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          {item.label}
                        </p>
                        <p className="mt-1 text-2xl font-semibold text-foreground">
                          {item.value}
                        </p>
                      </div>
                    ))}
                    <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 sm:col-span-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Klaar voor uitrol
                      </p>
                      <p className="mt-1 text-2xl font-semibold text-foreground">
                        {onboardingCounts.ready}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Tenants die functioneel onboarded zijn en vooral operationele groei of activatie vragen.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
              <Card>
                <CardHeader>
                  <CardTitle className="text-foreground">Recent aangemaakt</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {recentTenants.map((tenant) => (
                    <div
                      key={tenant.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-4 py-4"
                    >
                      <div>
                        <Link
                          href={`/admin/tenants/${tenant.id}`}
                          className="font-medium text-foreground underline-offset-2 hover:underline"
                        >
                          {tenant.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {tenant.slug}.nxtdrive.io
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={PLAN_BADGE[tenant.plan] ?? "outline"}>
                          {PLAN_LABELS[tenant.plan] ?? tenant.plan}
                        </Badge>
                        <Badge variant="outline">
                          {ORG_TYPE_LABELS[tenant.org_type ?? ""] ?? "Onbekend"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-foreground">Snelle platformroutes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    {
                      href: "/admin?tab=tenant",
                      label: "Nieuwe tenant aanmaken",
                      description: "Commerciele intake, plan en organisatieprofiel.",
                      icon: Rocket,
                    },
                    {
                      href: "/admin?tab=groei",
                      label: "Groei & MRR",
                      description: "MRR, actieve tenants en inactiviteitsrisico.",
                      icon: Activity,
                    },
                    {
                      href: "/admin?tab=email",
                      label: "Platform e-mail",
                      description: "SendGrid sleutel en from-address beheren.",
                      icon: CreditCard,
                    },
                    {
                      href: "/admin?tab=ai",
                      label: "Platform AI",
                      description: "OpenAI configuratie voor tenantfeatures.",
                      icon: Palette,
                    },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="block rounded-xl border border-border bg-muted/20 px-4 py-4 transition-colors hover:bg-muted/40"
                      >
                        <div className="flex items-center gap-2 text-foreground">
                          <Icon className="h-4 w-4 text-primary" aria-hidden />
                          <span className="font-medium">{item.label}</span>
                          <ArrowUpRight className="ml-auto h-4 w-4 text-muted-foreground" aria-hidden />
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {item.description}
                        </p>
                      </Link>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Feedback banners */}
        {params.created && (
          <Alert variant="success">
            <div>
              <AlertTitle>Rijschool aangemaakt</AlertTitle>
              <AlertDescription>
                Rijschool <strong>{params.created}</strong> is toegevoegd aan het platform.
              </AlertDescription>
            </div>
          </Alert>
        )}
        {hasError && errorMsg && (
          <Alert variant="danger">
            <div>
              <AlertTitle>Actie mislukt</AlertTitle>
              <AlertDescription>{errorMsg}</AlertDescription>
            </div>
          </Alert>
        )}
        {params.themeSaved && (
          <Alert variant="success">
            <div>
              <AlertTitle>Theme preset opgeslagen</AlertTitle>
              <AlertDescription>
                Het light/dark presetpakket staat nu centraal klaar voor tenantkoppeling.
              </AlertDescription>
            </div>
          </Alert>
        )}
        {params.themeError && (
          <Alert variant="danger">
            <div>
              <AlertTitle>Theme preset kon niet worden opgeslagen</AlertTitle>
              <AlertDescription>{decodeURIComponent(params.themeError)}</AlertDescription>
            </div>
          </Alert>
        )}

        {/* Tab: Thema's */}
        {activeTab === "themes" && (
          <div className="space-y-6">
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "Actieve presets",
                  value: themePresets.filter((preset) => preset.is_active).length,
                  description: "Beschikbaar voor tenantkoppeling",
                },
                {
                  label: "Systeempresets",
                  value: themePresets.filter((preset) => preset.is_system).length,
                  description: "Platform-beheerde basispaletten",
                },
                {
                  label: "Custom presets",
                  value: themePresets.filter((preset) => !preset.is_system).length,
                  description: "Tenant-specifieke of handgemaakte varianten",
                },
                {
                  label: "Toewijzingen",
                  value: Array.from(themeUsageMap.values()).reduce(
                    (total, tenants) => total + tenants.length,
                    0,
                  ),
                  description: "Actieve tenant → preset koppelingen",
                },
              ].map((stat) => (
                <Card key={stat.label}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {stat.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-semibold tracking-tight text-foreground">
                      {stat.value}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {stat.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <ThemePresetForm
                heading="Nieuw theme preset"
                submitLabel="Preset opslaan"
                action={upsertThemePresetAction}
              />

              <Card>
                <CardHeader>
                  <CardTitle className="text-foreground">Presetmatrix</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Koppel deze presets daarna op tenantniveau. Systeempresets blijven read-only; maak daarvan een custom variant als je wilt afwijken.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {themePresets.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                      Nog geen presets beschikbaar.
                    </div>
                  ) : (
                    themePresets.map((preset) => {
                      const assignedTenants = themeUsageMap.get(preset.id) ?? [];
                      return (
                        <div
                          key={preset.id}
                          className="rounded-2xl border border-border bg-muted/15 p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-semibold text-foreground">
                                  {preset.name}
                                </h3>
                                <Badge variant={preset.is_active ? "success" : "outline"}>
                                  {preset.is_active ? "Actief" : "Inactief"}
                                </Badge>
                                {preset.is_system ? (
                                  <Badge variant="outline">Systeem</Badge>
                                ) : (
                                  <Badge variant="primary">Custom</Badge>
                                )}
                              </div>
                              <p className="font-mono text-xs text-muted-foreground">
                                {preset.slug}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {preset.description?.trim()
                                  ? preset.description
                                  : "Geen beschrijving opgegeven."}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className="h-8 w-8 rounded-full border border-white/10"
                                style={{ backgroundColor: preset.tokens_dark.primary }}
                                title="Dark primary"
                              />
                              <span
                                className="h-8 w-8 rounded-full border border-border"
                                style={{ backgroundColor: preset.tokens_light.primary }}
                                title="Light primary"
                              />
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span className="rounded-full border border-border bg-background px-3 py-1">
                              {assignedTenants.length} tenant{assignedTenants.length === 1 ? "" : "s"}
                            </span>
                            <span className="rounded-full border border-border bg-background px-3 py-1">
                              bijgewerkt {new Date(preset.updated_at).toLocaleDateString("nl-NL")}
                            </span>
                          </div>

                          <div className="mt-4">
                            <ThemePresetForm
                              heading={`Preset bewerken: ${preset.name}`}
                              submitLabel="Wijzigingen opslaan"
                              action={upsertThemePresetAction}
                              preset={preset}
                              usageCount={assignedTenants.length}
                              assignedTenantNames={assignedTenants}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </section>
          </div>
        )}

        {/* Tab: Rijscholen */}
        {activeTab === "tenants" && (
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="text-foreground">Tenantbeheer</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Doorzoek rijscholen, open hun detailcockpit en zie direct waar abonnementen of onboarding aandacht vragen.
                  </p>
                </div>
                <form action="/admin" className="flex w-full max-w-md gap-2">
                  <input type="hidden" name="tab" value="tenants" />
                  <Input
                    name="q"
                    defaultValue={params.q ?? ""}
                    placeholder="Zoek op naam, slug of status"
                  />
                  <Button type="submit" variant="outline">
                    Zoeken
                  </Button>
                </form>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Naam</th>
                    <th className="px-4 py-3 font-medium">Slug</th>
                    <th className="px-4 py-3 font-medium">Plan</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Alerts</th>
                    <th className="px-4 py-3 text-right font-medium">Leerlingen</th>
                    <th className="px-4 py-3 text-right font-medium">Instructeurs</th>
                    <th className="px-4 py-3 text-right font-medium">Leads</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredTenants.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium text-foreground">
                        <Link
                          href={`/admin/tenants/${t.id}`}
                          className="flex items-center gap-2 hover:underline underline-offset-2"
                        >
                          {t.name}
                          {isWhiteLabelEligible(t) && (
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
                      <td className="px-4 py-3">
                        <div className="space-y-1 text-xs">
                          <p className="text-foreground">
                            {LIFECYCLE_LABELS[t.lifecycle_status] ?? t.lifecycle_status}
                          </p>
                          <p className="text-muted-foreground">
                            {ONBOARDING_LABELS[t.onboarding_status] ?? t.onboarding_status}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {t.alertCount > 0 ? (
                            <Badge variant="warning">{t.alertCount} alert{t.alertCount === 1 ? "" : "s"}</Badge>
                          ) : (
                            <Badge variant="success">Gezond</Badge>
                          )}
                          {t.whiteLabelDowngraded ? (
                            <Badge variant="outline">WL downgrade</Badge>
                          ) : null}
                          {t.parent_tenant_id ? (
                            <Badge variant="outline">Franchisee</Badge>
                          ) : null}
                          {ORG_TYPE_LABELS[t.org_type ?? ""] ? (
                            <Badge variant="outline">
                              {ORG_TYPE_LABELS[t.org_type ?? ""]}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t.usage.branches} vestigingen · {t.usage.staff_memberships} medewerkers · {t.usage.custom_domains} domeinen
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {t.student_count}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {t.instructor_count}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {t.lead_count}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/admin/tenants/${t.id}`}
                            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                          >
                            Details
                          </Link>
                          <form action={enterTenantBackoffice}>
                            <input type="hidden" name="tenant_id" value={t.id} />
                            <Button size="sm" variant="outline" type="submit">
                              Backoffice →
                            </Button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredTenants.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                        {query ? (
                          <>Geen rijscholen gevonden voor deze zoekopdracht.</>
                        ) : (
                          <>
                            Nog geen rijscholen.{" "}
                            <Link href="/admin?tab=tenant" className="text-primary underline underline-offset-2">
                              Maak er een aan.
                            </Link>
                          </>
                        )}
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
                            return (
                              <div
                                key={t.plan}
                                className="h-full"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor:
                                    MRR_SEGMENT_COLORS[i % MRR_SEGMENT_COLORS.length],
                                }}
                                title={`${t.label}: €${t.total} (${pct}%)`}
                              />
                            );
                          })}
                      </div>
                      <ul className="mt-2 space-y-1">
                        {mrr.byTier.map((t, i) => {
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
                                  className="h-2 w-2 shrink-0 rounded-full"
                                  style={{
                                    backgroundColor:
                                      MRR_SEGMENT_COLORS[i % MRR_SEGMENT_COLORS.length],
                                  }}
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

        {/* Tab: E-mailinstellingen */}
        {activeTab === "email" && platformEmailStatus && (
          <div className="max-w-lg space-y-4">
            {params.emailSaved && (
              <Alert variant="success">
                <div>
                  <AlertTitle>E-mailinstellingen opgeslagen</AlertTitle>
                  <AlertDescription>De platform mailconfiguratie is bijgewerkt.</AlertDescription>
                </div>
              </Alert>
            )}
            {params.emailError && (
              <Alert variant="danger">
                <div>
                  <AlertTitle>E-mailinstellingen konden niet worden opgeslagen</AlertTitle>
                  <AlertDescription>{params.emailError}</AlertDescription>
                </div>
              </Alert>
            )}

            {/* Status overzicht */}
            <div className="flex gap-3">
              <div className="flex-1 flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">API-sleutel</p>
                  <p className="mt-0.5 font-mono text-xs text-foreground">
                    {platformEmailStatus.keyPreview ?? "Niet ingesteld"}
                  </p>
                </div>
                {platformEmailStatus.keyPreview ? (
                  <Badge variant="success">✓</Badge>
                ) : (
                  <Badge variant="warning">Ontbreekt</Badge>
                )}
              </div>
              <div className="flex-1 flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Afzender</p>
                  <p className="mt-0.5 font-mono text-xs text-foreground">
                    {platformEmailStatus.fromEmail ?? "Niet ingesteld"}
                  </p>
                </div>
                {platformEmailStatus.fromEmail ? (
                  <Badge variant="success">✓</Badge>
                ) : (
                  <Badge variant="warning">Ontbreekt</Badge>
                )}
              </div>
            </div>

            {/* Bewerkbaar formulier */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  E-mailinstellingen aanpassen
                  {platformEmailStatus.configured ? (
                    <Badge variant="success" className="ml-2 text-xs">Geconfigureerd</Badge>
                  ) : (
                    <Badge variant="warning" className="ml-2 text-xs">Niet compleet</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form action={savePlatformEmailConfig} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="sg_api_key" className="text-sm font-medium text-foreground">
                      SendGrid API-sleutel
                      {platformEmailStatus.keyPreview && (
                        <span className="ml-2 font-normal text-muted-foreground">
                          (huidig: <span className="font-mono">{platformEmailStatus.keyPreview}</span>)
                        </span>
                      )}
                    </label>
                    <Input
                      id="sg_api_key"
                      name="sg_api_key"
                      type="password"
                      placeholder={platformEmailStatus.keyPreview ? "Laat leeg om ongewijzigd te laten" : "SG.xxxxxxxx..."}
                      autoComplete="off"
                    />
                    <p className="text-xs text-muted-foreground">
                      Begint met <code className="rounded bg-muted px-1">SG.</code> — te vinden in je SendGrid-dashboard onder API Keys.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="from_email" className="text-sm font-medium text-foreground">
                      Afzenderadres <span className="text-red-400">*</span>
                    </label>
                    <Input
                      id="from_email"
                      name="from_email"
                      type="email"
                      placeholder="noreply@nxtdrive.io"
                      defaultValue={platformEmailStatus.fromEmail ?? ""}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Moet een geverifieerd afzenderadres zijn in SendGrid.
                    </p>
                  </div>

                  <Button type="submit" className="w-full">
                    Opslaan
                  </Button>
                </form>
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground px-1">
              De API-sleutel wordt versleuteld opgeslagen (AES-256-GCM). Rijscholen kunnen geen eigen e-mailaccount instellen.
            </p>
          </div>
        )}

        {/* Tab: AI-model */}
        {activeTab === "ai" && aiConfigStatus && (
          <div className="max-w-lg space-y-4">
            {params.aiSaved && (
              <Alert variant="success">
                <div>
                  <AlertTitle>AI-instellingen opgeslagen</AlertTitle>
                  <AlertDescription>De platform AI-configuratie is bijgewerkt.</AlertDescription>
                </div>
              </Alert>
            )}
            {params.aiError && (
              <Alert variant="danger">
                <div>
                  <AlertTitle>AI-instellingen konden niet worden opgeslagen</AlertTitle>
                  <AlertDescription>{params.aiError}</AlertDescription>
                </div>
              </Alert>
            )}

            {/* Status */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">OpenAI API-sleutel</p>
                <p className="mt-0.5 font-mono text-xs text-foreground">
                  {aiConfigStatus.keyPreview ?? "Niet ingesteld"}
                </p>
              </div>
              {aiConfigStatus.keyPreview ? (
                <Badge variant="success">✓ Geconfigureerd</Badge>
              ) : (
                <Badge variant="warning">Ontbreekt</Badge>
              )}
            </div>

            {/* Formulier */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  OpenAI API-sleutel instellen
                  {aiConfigStatus.configured ? (
                    <Badge variant="success" className="ml-2 text-xs">Geconfigureerd</Badge>
                  ) : (
                    <Badge variant="warning" className="ml-2 text-xs">Niet geconfigureerd</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form action={savePlatformAiConfig} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="openai_api_key" className="text-sm font-medium text-foreground">
                      API-sleutel
                      {aiConfigStatus.keyPreview && (
                        <span className="ml-2 font-normal text-muted-foreground">
                          (huidig: <span className="font-mono">{aiConfigStatus.keyPreview}</span>)
                        </span>
                      )}
                    </label>
                    <Input
                      id="openai_api_key"
                      name="openai_api_key"
                      type="password"
                      placeholder={aiConfigStatus.keyPreview ? "Laat leeg om ongewijzigd te laten" : "sk-..."}
                      autoComplete="off"
                      required={!aiConfigStatus.configured}
                    />
                    <p className="text-xs text-muted-foreground">
                      Begint met <code className="rounded bg-muted px-1">sk-</code> — te vinden in je{" "}
                      <a
                        href="https://platform.openai.com/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        OpenAI-dashboard
                      </a>{" "}
                      onder API keys.
                    </p>
                  </div>

                  <Button type="submit" className="w-full">
                    Opslaan
                  </Button>
                </form>
              </CardContent>
            </Card>

            <p className="px-1 text-xs text-muted-foreground">
              De API-sleutel wordt versleuteld opgeslagen (AES-256-GCM). Rijscholen kunnen geen eigen AI-sleutel instellen. Alle AI-functies gebruiken het GPT-4o-mini-model en zijn adviserend: niet bindend, nooit automatisch opgeslagen.
            </p>
          </div>
        )}

        {/* Tab: Nieuwe rijschool */}
        {activeTab === "tenant" && (
          <NewTenantForm
            tenants={(tenants ?? []).map((t) => ({
              id: t.id,
              name: t.name,
              slug: t.slug,
              org_type: (t as unknown as { org_type?: string | null }).org_type ?? null,
            }))}
          />
        )}
      </div>
    </main>
  );
}
