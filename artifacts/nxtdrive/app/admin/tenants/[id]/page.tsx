import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth/require-role";
import { loadOrganizationProfile } from "@/lib/organization";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { enterTenantBackoffice } from "../../actions";
import {
  createTenantAdminAccount,
  assignTenantThemePresetAction,
  resetTenantThemeOverridesAction,
  saveTenantThemeOverridesAction,
  setFranchiseeParentAction,
  updateTenantIdentityAction,
  updateTenantPlanAction,
  toggleWhiteLabelAction,
} from "./actions";
import { OrganizationProfileForm } from "./organization-profile-form";
import {
  FEATURE_PLAN,
  FEATURE_LABELS,
  PLAN_DESCRIPTIONS,
  PLAN_LABELS,
  PLAN_ORDER,
  isWhiteLabelEligible,
  tenantHasFeature,
  type FeatureKey,
} from "@/lib/platform/features";
import { getTenantLimitStatuses, loadTenantEntitlementUsage } from "@/lib/platform/entitlements";
import type { TenantPlan } from "@/lib/types";
import { getTenantBrandingBundle, listThemePresets } from "@/lib/branding";
import Link from "next/link";
import { TenantThemeOverridesForm } from "@/components/admin/tenant-theme-overrides-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const dynamic = "force-dynamic";

const PLAN_BADGE: Record<string, "outline" | "primary" | "default"> = {
  start: "outline",
  pro: "primary",
  elite: "default",
};

const ORG_TYPE_LABELS: Record<string, string> = {
  zzp: "ZZP",
  rijschool: "Rijschool",
  groot: "Grote rijschool",
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
  missing_fields: "Vul naam, e-mailadres en een wachtwoord van minimaal 8 tekens in.",
  create_failed: "Account aanmaken mislukt. Controleer het e-mailadres.",
  membership_failed: "Account aangemaakt maar lidmaatschap toevoegen mislukt. Neem contact op.",
};

const PROFILE_ERROR_MESSAGES: Record<string, string> = {
  invalid_org_type: "Ongeldig organisatietype geselecteerd.",
  invalid_lifecycle_status: "Ongeldige lifecycle-status geselecteerd.",
  invalid_onboarding_status: "Ongeldige onboarding-status geselecteerd.",
  owner_not_found: "Eigenaar-account niet gevonden in Supabase Auth.",
};

export default async function TenantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  await requirePlatformAdmin();

  const service = createServiceRoleClient();

  const [
    { data: tenant },
    { data: admins },
    { count: studentCount },
    { count: instructorCount },
    { count: leadCount },
    { data: allTenants },
    { data: franchisees },
  ] = await Promise.all([
    service.from("tenants").select("*").eq("id", id).single(),
    service
      .from("memberships")
      .select("user_id, role, created_at")
      .eq("tenant_id", id)
      .eq("role", "tenant_admin")
      .order("created_at", { ascending: true }),
    service
      .from("students")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", id),
    service
      .from("memberships")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", id)
      .eq("role", "instructor"),
    service
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", id),
    // All tenants for the franchisegever dropdown (excluding current tenant)
    service
      .from("tenants")
      .select("id, name, slug")
      .neq("id", id)
      .order("name"),
    // Tenants that are already franchisees of this tenant
    service
      .from("tenants")
      .select("id, name, slug")
      .eq("parent_tenant_id", id)
      .order("name"),
  ]);

  if (!tenant) notFound();

  const tenantRecord = tenant as Record<string, unknown>;
  const organizationProfile = await loadOrganizationProfile(service, id);
  const shouldLoadUsers =
    (admins?.length ?? 0) > 0 || !!organizationProfile?.owner_user_id;

  let allUsers: Array<{
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  }> = [];

  if (shouldLoadUsers) {
    const listResult = await service.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    allUsers = (listResult.data?.users ?? []) as Array<{
      id: string;
      email?: string;
      user_metadata?: Record<string, unknown>;
    }>;
  }

  const adminProfiles = (admins ?? []).map((m) => {
    const u = allUsers.find((u) => u.id === m.user_id);
    return {
      user_id: m.user_id,
      email: u?.email ?? "—",
      full_name: (u?.user_metadata?.full_name as string | undefined) ?? "—",
    };
  });

  const ownerEmail = organizationProfile?.owner_user_id
    ? (allUsers.find((u) => u.id === organizationProfile.owner_user_id)?.email ?? "")
    : "";
  const tenantOrgType =
    typeof tenantRecord.org_type === "string" ? tenantRecord.org_type : null;
  const isFranchisee = !!tenantRecord.parent_tenant_id;
  const franchisegeverTenantId = tenantRecord.parent_tenant_id as string | null | undefined;
  const franchisegeverName = franchisegeverTenantId
    ? ((allTenants ?? []).find((t) => t.id === franchisegeverTenantId)?.name ?? franchisegeverTenantId)
    : null;

  const createAction = createTenantAdminAccount.bind(null, id);

  const tenantPlan = (tenant.plan as TenantPlan) ?? "start";
  const tenantObj = { plan: tenantPlan, white_label_enabled: !!tenantRecord.white_label_enabled };
  const whiteLabelActive = isWhiteLabelEligible(tenantObj);
  const entitlementUsage = await loadTenantEntitlementUsage(service, id);
  const [themePresets, brandingBundle] = await Promise.all([
    listThemePresets(),
    getTenantBrandingBundle(id),
  ]);
  const currentThemePreset = brandingBundle.preset;
  const limitStatuses = getTenantLimitStatuses(
    tenantObj,
    entitlementUsage,
  );
  const attentionItems = [
    ...Object.values(limitStatuses)
      .filter((status) => status.isAtLimit || status.isOverLimit)
      .map((status) => ({
        key: status.key,
        title: status.label,
        body: status.isOverLimit
          ? "Gebruikt meer dan het huidige plan toelaat. Nieuwe uitbreiding moet nu via upgrade of opschoning lopen."
          : "Limiet bereikt. Nieuwe uitbreiding is geblokkeerd totdat het plan wordt aangepast.",
      })),
    ...(!whiteLabelActive && tenantRecord.white_label_enabled
      ? [
          {
            key: "white-label",
            title: "White-label downgrade",
            body:
              "White-label staat nog aan, maar het huidige plan ondersteunt deze tenantinstelling niet volledig.",
          },
        ]
      : []),
  ];

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-8">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Admin
            </Link>
            <span className="text-muted-foreground">/</span>
            <NxtdriveLogo className="text-base" />
          </div>
          <Badge variant="primary" className="text-xs">
            platform admin
          </Badge>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
        {/* Tenant header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">
                {tenant.name}
              </h1>
              <Badge variant={PLAN_BADGE[tenantPlan] ?? "outline"}>
                {PLAN_LABELS[tenantPlan] ?? tenantPlan}
              </Badge>
              {tenantOrgType && (
                <Badge variant="outline">
                  {ORG_TYPE_LABELS[tenantOrgType] ?? tenantOrgType}
                </Badge>
              )}
              {whiteLabelActive && (
                <Badge variant="outline">White-label</Badge>
              )}
              {isFranchisee && (
                <Badge variant="outline" className="text-xs">
                  Franchisee
                </Badge>
              )}
              {(franchisees?.length ?? 0) > 0 && (
                <Badge variant="outline" className="text-xs">
                  Franchisegever ({franchisees?.length})
                </Badge>
              )}
            </div>
            <p className="mt-0.5 font-mono text-sm text-muted-foreground">
              {tenant.slug}.nxtdrive.io
            </p>
            {franchisegeverName && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Franchisee van:{" "}
                <Link
                  href={`/admin/tenants/${franchisegeverTenantId}`}
                  className="text-primary underline"
                >
                  {franchisegeverName}
                </Link>
              </p>
            )}
          </div>
          <form action={enterTenantBackoffice}>
            <input type="hidden" name="tenant_id" value={id} />
            <Button variant="outline" type="submit">
              Naar backoffice →
            </Button>
          </form>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {[
            { label: "Leerlingen", value: studentCount ?? 0 },
            { label: "Instructeurs", value: instructorCount ?? 0 },
            { label: "Leads", value: leadCount ?? 0 },
          ].map((s) => (
            <Card key={s.label}>
              <CardHeader className="pb-1 pt-4">
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {s.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <p className="text-2xl font-bold text-foreground">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {sp.identity_saved && (
          <Alert variant="success">
            <div>
              <AlertTitle>Tenantgegevens opgeslagen</AlertTitle>
              <AlertDescription>De basisidentiteit van deze tenant is bijgewerkt.</AlertDescription>
            </div>
          </Alert>
        )}
        {sp.identity_error && (
          <Alert variant="danger">
            <div>
              <AlertTitle>Tenantgegevens konden niet worden opgeslagen</AlertTitle>
              <AlertDescription>
                {sp.identity_error === "missing_fields"
                  ? "Vul minimaal een tenantnaam in."
                  : decodeURIComponent(sp.identity_error)}
              </AlertDescription>
            </div>
          </Alert>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tenant basisgegevens</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form action={updateTenantIdentityAction} className="space-y-4">
                <input type="hidden" name="tenant_id" value={id} />
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="name" className="text-sm font-medium text-foreground">
                      Tenantnaam
                    </label>
                    <Input
                      id="name"
                      name="name"
                      defaultValue={tenant.name}
                      placeholder="Rijschoolnaam"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="slug" className="text-sm font-medium text-foreground">
                      Slug
                    </label>
                    <Input
                      id="slug"
                      value={tenant.slug}
                      readOnly
                      disabled
                    />
                    <p className="text-xs text-muted-foreground">
                      De slug is de stabiele tenantidentiteit voor routing en domeinkoppeling en blijft daarom read-only.
                    </p>
                  </div>
                </div>
                <Button type="submit" variant="outline">
                  Basisgegevens opslaan
                </Button>
              </form>

              <div className="rounded-xl border border-border bg-muted/20 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Commercieel profiel
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {PLAN_DESCRIPTIONS[tenantPlan]}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant={PLAN_BADGE[tenantPlan] ?? "outline"}>
                    {PLAN_LABELS[tenantPlan] ?? tenantPlan}
                  </Badge>
                  <Badge variant="outline">
                    {ORG_TYPE_LABELS[tenantOrgType ?? ""] ?? "Type onbekend"}
                  </Badge>
                  <Badge variant="outline">
                    {LIFECYCLE_LABELS[organizationProfile?.lifecycle_status ?? "onboarding"] ??
                      (organizationProfile?.lifecycle_status ?? "Onboarding")}
                  </Badge>
                  <Badge variant="outline">
                    {ONBOARDING_LABELS[organizationProfile?.onboarding_status ?? "not_started"] ??
                      (organizationProfile?.onboarding_status ?? "Niet gestart")}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Commerciele gezondheid</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.values(limitStatuses).map((status) => (
                  <div
                    key={status.key}
                    className="rounded-xl border border-border bg-muted/20 px-4 py-3"
                  >
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {status.label}
                    </p>
                    <p className="mt-1 text-xl font-semibold text-foreground">
                      {status.isUnlimited ? status.used : `${status.used}/${status.limitLabel}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {status.isUnlimited
                        ? "Onbeperkt"
                        : status.isOverLimit
                          ? "Boven limiet"
                          : status.isAtLimit
                            ? "Limiet bereikt"
                            : `${status.remaining} beschikbaar`}
                    </p>
                  </div>
                ))}
              </div>

              {attentionItems.length > 0 ? (
                <div className="space-y-2">
                  {attentionItems.map((item) => (
                    <Alert key={item.key} variant="warning">
                      <div>
                        <AlertTitle>{item.title}</AlertTitle>
                        <AlertDescription>{item.body}</AlertDescription>
                      </div>
                    </Alert>
                  ))}
                </div>
              ) : (
                <Alert variant="success">
                  <div>
                    <AlertTitle>Binnen planlimieten</AlertTitle>
                    <AlertDescription>
                      Deze tenant heeft momenteel geen downgrade-waarschuwingen of commerciële blokkades actief.
                    </AlertDescription>
                  </div>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>

        {sp.profile_saved && (
          <Alert variant="success">
            <div>
              <AlertTitle>Organisatieprofiel opgeslagen</AlertTitle>
              <AlertDescription>Lifecycle, onboarding en eigenaar zijn bijgewerkt.</AlertDescription>
            </div>
          </Alert>
        )}
        {sp.profile_error && (
          <Alert variant="danger">
            <div>
              <AlertTitle>Organisatieprofiel kon niet worden opgeslagen</AlertTitle>
              <AlertDescription>
                {PROFILE_ERROR_MESSAGES[sp.profile_error] ?? decodeURIComponent(sp.profile_error)}
              </AlertDescription>
            </div>
          </Alert>
        )}

        <OrganizationProfileForm
          tenantId={id}
          tenantOrgType={tenantOrgType}
          profile={organizationProfile}
          ownerEmail={ownerEmail}
        />

        {/* Plan & feature management */}
        {sp.plan_saved && (
          <Alert variant="success">
            <div>
              <AlertTitle>Abonnement bijgewerkt</AlertTitle>
              <AlertDescription>Plan, limieten en feature-gating zijn opnieuw toegepast.</AlertDescription>
            </div>
          </Alert>
        )}
        {sp.plan_error && (
          <Alert variant="danger">
            <div>
              <AlertTitle>Abonnement kon niet worden bijgewerkt</AlertTitle>
              <AlertDescription>
                {sp.plan_error === "invalid"
                  ? "Ongeldig plan geselecteerd."
                  : decodeURIComponent(sp.plan_error)}
              </AlertDescription>
            </div>
          </Alert>
        )}
        {sp.theme_saved && (
          <Alert variant="success">
            <div>
              <AlertTitle>Theme preset bijgewerkt</AlertTitle>
              <AlertDescription>De tenant volgt nu het nieuwe centrale palette.</AlertDescription>
            </div>
          </Alert>
        )}
        {sp.theme_error && (
          <Alert variant="danger">
            <div>
              <AlertTitle>Theme preset kon niet worden opgeslagen</AlertTitle>
              <AlertDescription>{decodeURIComponent(sp.theme_error)}</AlertDescription>
            </div>
          </Alert>
        )}
        {sp.theme_overrides_saved && (
          <Alert variant="success">
            <div>
              <AlertTitle>Tenant-overrides opgeslagen</AlertTitle>
              <AlertDescription>De tenant heeft nu een eigen light/dark verfijning bovenop de preset.</AlertDescription>
            </div>
          </Alert>
        )}
        {sp.theme_overrides_reset && (
          <Alert variant="info">
            <div>
              <AlertTitle>Tenant-overrides gewist</AlertTitle>
              <AlertDescription>De tenant erft weer volledig van de gekoppelde preset of platformdefaults.</AlertDescription>
            </div>
          </Alert>
        )}
        {sp.theme_overrides_error && (
          <Alert variant="danger">
            <div>
              <AlertTitle>Tenant-overrides konden niet worden opgeslagen</AlertTitle>
              <AlertDescription>{decodeURIComponent(sp.theme_overrides_error)}</AlertDescription>
            </div>
          </Alert>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Plan selector */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Abonnement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form action={updateTenantPlanAction} className="flex gap-2">
                <input type="hidden" name="tenant_id" value={id} />
                <select
                  name="plan"
                  defaultValue={tenantPlan}
                  className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {PLAN_ORDER.map((p) => (
                    <option key={p} value={p}>
                      NXTDRIVE {PLAN_LABELS[p] ?? p}
                    </option>
                  ))}
                </select>
                <Button type="submit" size="sm" variant="outline" className="shrink-0">
                  Opslaan
                </Button>
              </form>

              <div className="grid gap-2 sm:grid-cols-2">
                {Object.values(limitStatuses).map((status) => (
                  <div
                    key={status.key}
                    className="rounded-md border border-border bg-muted/30 px-3 py-2.5"
                  >
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {status.label}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-foreground">
                      {status.isUnlimited
                        ? status.used
                        : `${status.used}/${status.limitLabel}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {status.isUnlimited
                        ? "Onbeperkt op dit plan"
                        : status.isOverLimit
                          ? "Boven planlimiet"
                          : status.isAtLimit
                            ? "Planlimiet bereikt"
                            : `${status.remaining} beschikbaar`}
                    </p>
                  </div>
                ))}
              </div>

              {/* White-label toggle — only meaningful for Elite */}
              <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-foreground">White-label</p>
                  <p className="text-xs text-muted-foreground">
                    {tenantHasFeature(tenantObj, "white_label")
                      ? "Eigen logo & kleuren activeren"
                      : "Vereist Elite-abonnement"}
                  </p>
                </div>
                {tenantHasFeature(tenantObj, "white_label") ? (
                  <form action={toggleWhiteLabelAction}>
                    <input type="hidden" name="tenant_id" value={id} />
                    <input
                      type="hidden"
                      name="white_label_enabled"
                      value={tenantObj.white_label_enabled ? "false" : "true"}
                    />
                    <Button type="submit" size="sm" variant={tenantObj.white_label_enabled ? "outline" : "primary"}>
                      {tenantObj.white_label_enabled ? "Uitschakelen" : "Inschakelen"}
                    </Button>
                  </form>
                ) : (
                  <Badge variant="outline" className="text-xs">Vergrendeld</Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Feature flags grid */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Functies voor dit abonnement</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {(Object.keys(FEATURE_PLAN) as FeatureKey[]).map((feature) => {
                  const unlocked = tenantHasFeature(tenantObj, feature);
                  const requiredPlan = FEATURE_PLAN[feature] as TenantPlan;
                  return (
                    <li
                      key={feature}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <span className={unlocked ? "text-foreground" : "text-muted-foreground"}>
                        {FEATURE_LABELS[feature]}
                      </span>
                      {unlocked ? (
                        <span className="text-xs text-success">✓</span>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          {PLAN_LABELS[requiredPlan] ?? requiredPlan}+
                        </Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Theme preset koppeling</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <div className="rounded-xl border border-border bg-muted/20 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Huidige preset
                </p>
                <p className="mt-2 text-lg font-semibold text-foreground">
                  {currentThemePreset?.name ?? "Geen preset gekoppeld"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {currentThemePreset?.description?.trim()
                    ? currentThemePreset.description
                    : currentThemePreset
                      ? "Tenant volgt dit centrale light/dark palet."
                      : "Deze tenant draait nog op platformdefaults of legacy primaire kleuren."}
                </p>
                <div className="mt-4 flex items-center gap-3">
                  <span
                    className="h-10 w-10 rounded-full border border-white/10"
                    style={{
                      backgroundColor: currentThemePreset
                        ? currentThemePreset.tokens_dark.primary
                        : brandingBundle.tokens.dark.primary,
                    }}
                    title="Dark primary"
                  />
                  <span
                    className="h-10 w-10 rounded-full border border-border"
                    style={{
                      backgroundColor: currentThemePreset
                        ? currentThemePreset.tokens_light.primary
                        : brandingBundle.tokens.light.primary,
                    }}
                    title="Light primary"
                  />
                  <div className="text-xs text-muted-foreground">
                    <p>Dark primary</p>
                    <p>Light primary</p>
                  </div>
                </div>
              </div>

              <form action={assignTenantThemePresetAction} className="space-y-4 rounded-xl border border-border bg-muted/15 px-4 py-4">
                <input type="hidden" name="tenant_id" value={id} />
                <div className="space-y-1.5">
                  <label
                    htmlFor="theme_preset_id"
                    className="text-sm font-medium text-foreground"
                  >
                    Platform preset
                  </label>
                  <select
                    id="theme_preset_id"
                    name="theme_preset_id"
                    defaultValue={currentThemePreset?.id ?? ""}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">Geen preset</option>
                    {themePresets
                      .filter(
                        (preset) =>
                          preset.is_active || preset.id === currentThemePreset?.id,
                      )
                      .map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.name}
                          {preset.is_system ? " · systeem" : " · custom"}
                          {!preset.is_active ? " · inactief" : ""}
                        </option>
                      ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Zodra een preset is gekoppeld, volgen instructeur-, student- en backoffice-shells het centrale light/dark palet.
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background px-3 py-3 text-sm text-muted-foreground">
                  Legacy primaire kleuren uit tenant-branding worden niet meer leidend zodra een preset actief is. Zo blijft white-label visueel consistent.
                </div>
                <Button type="submit" variant="outline">
                  Theme preset opslaan
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>

        <TenantThemeOverridesForm
          action={saveTenantThemeOverridesAction}
          resetAction={resetTenantThemeOverridesAction}
          tenantId={id}
          baseTokens={brandingBundle.baseTokens}
          initialOverrides={brandingBundle.branding?.theme_overrides ?? null}
          presetName={currentThemePreset?.name ?? null}
        />

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Existing admins */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Tenant admins ({adminProfiles.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {adminProfiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nog geen admins. Maak er een aan via het formulier.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {adminProfiles.map((a) => (
                    <li
                      key={a.user_id}
                      className="flex items-center justify-between py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {a.full_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {a.email}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        tenant admin
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Create admin form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Admin toevoegen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {sp.created && (
                <Alert variant="success">
                  <div>
                    <AlertTitle>Adminaccount aangemaakt</AlertTitle>
                    <AlertDescription>
                      Account aangemaakt voor <strong>{decodeURIComponent(sp.created)}</strong>.
                    </AlertDescription>
                  </div>
                </Alert>
              )}
              {sp.error && (
                <Alert variant="danger">
                  <div>
                    <AlertTitle>Adminaccount kon niet worden aangemaakt</AlertTitle>
                    <AlertDescription>{ERROR_MESSAGES[sp.error] ?? "Er is een fout opgetreden."}</AlertDescription>
                  </div>
                </Alert>
              )}

              <form action={createAction} className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="full_name"
                    className="text-sm font-medium text-foreground"
                  >
                    Volledige naam <span className="text-red-400">*</span>
                  </label>
                  <Input
                    id="full_name"
                    name="full_name"
                    placeholder="Jan de Wit"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="email"
                    className="text-sm font-medium text-foreground"
                  >
                    E-mailadres <span className="text-red-400">*</span>
                  </label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="eigenaar@rijschool.nl"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Bestaat dit account al? Dan wordt het wachtwoord bijgewerkt
                    en het lidmaatschap toegevoegd.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="password"
                    className="text-sm font-medium text-foreground"
                  >
                    Wachtwoord <span className="text-red-400">*</span>
                  </label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="Minimaal 8 tekens"
                    minLength={8}
                    required
                  />
                </div>
                <Button type="submit" className="w-full">
                  Admin aanmaken
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* ── Franchise linking ───────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Franchise-koppeling</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {sp.franchise_saved && (
              <Alert variant="success">
                <div>
                  <AlertTitle>Franchise-koppeling opgeslagen</AlertTitle>
                  <AlertDescription>De netwerkrelatie van deze tenant is bijgewerkt.</AlertDescription>
                </div>
              </Alert>
            )}
            {sp.franchise_error && (
              <Alert variant="danger">
                <div>
                  <AlertTitle>Franchise-koppeling mislukt</AlertTitle>
                  <AlertDescription>{decodeURIComponent(sp.franchise_error)}</AlertDescription>
                </div>
              </Alert>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Link this tenant as franchisee of a franchisegever */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">
                  Koppel als franchisee
                </p>
                <p className="text-xs text-muted-foreground">
                  Kies een franchisegever-tenant. Leeg laten = ontkoppelen.
                  {isFranchisee && franchisegeverName && (
                    <span className="ml-1 text-warning">
                      Huidig: {franchisegeverName}
                    </span>
                  )}
                </p>
                <form action={setFranchiseeParentAction} className="flex gap-2">
                  <input type="hidden" name="franchisee_id" value={id} />
                  <select
                    name="franchisegever_id"
                    defaultValue={franchisegeverTenantId ?? ""}
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">— Geen franchisegever —</option>
                    {(allTenants ?? []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.slug})
                      </option>
                    ))}
                  </select>
                  <Button type="submit" size="sm" variant="outline" className="shrink-0">
                    Opslaan
                  </Button>
                </form>
              </div>

              {/* Current franchisees of this tenant */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">
                  Franchisees van dit netwerk ({franchisees?.length ?? 0})
                </p>
                {(franchisees?.length ?? 0) === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nog geen franchisees. Koppel via de detailpagina van een franchisee-tenant.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {(franchisees ?? []).map((f) => (
                      <li key={f.id} className="flex items-center justify-between py-2">
                        <Link
                          href={`/admin/tenants/${f.id}`}
                          className="text-sm text-primary hover:underline"
                        >
                          {f.name}
                        </Link>
                        <span className="text-xs text-muted-foreground font-mono">
                          {f.slug}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
