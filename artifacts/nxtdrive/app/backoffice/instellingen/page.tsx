import type { ReactNode } from "react";
import Link from "next/link";
import {
  BellRing,
  CalendarClock,
  CreditCard,
  Globe,
  Palette,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { PLAN_LABELS } from "@/lib/platform/features";
import { loadTenantEntitlementSnapshot } from "@/lib/platform/entitlements";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getMollieApiKeyStatus } from "@/lib/mollie/secrets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrandingForm } from "@/components/backoffice/branding-form";
import { WhiteLabelFoundationCard } from "@/components/backoffice/white-label-foundation-card";
import {
  getTenantBrandingBundle,
  resolveBrandAppName,
  resolveLogoUrl,
  resolveThemeColorForMode,
} from "@/lib/branding";
import { saveMollieApiKey } from "./actions";
import {
  AssignmentRulesManager,
  type AssignmentRule,
  type RuleDepartment,
} from "./assignment-rules-manager";
import { LeadScorePolicyManager } from "./lead-score-policy-manager";
import { loadLeadScorePolicy } from "@/lib/leads/lead-score-policy";
import { CancellationPolicyManager } from "./cancellation-policy-manager";
import { loadCancellationPolicy } from "@/lib/lessons/cancellation-policy";
import { RefillPolicyManager } from "./refill-policy-manager";
import { loadRefillPolicy } from "@/lib/lesson-refill/policy";
import { StudentSelfBookingManager } from "./student-self-booking-manager";
import { loadStudentSelfBookingPolicy } from "@/lib/student-booking/policy";
import { ParentPortalManager } from "./parent-portal-manager";
import { loadParentPortalVisibility } from "@/lib/parent-portal/visibility";
import { PaymentReminderManager } from "./payment-reminder-manager";
import { loadPaymentReminderPolicy } from "@/lib/invoices/payment-reminder-policy";
import { InstallmentCreditPolicyManager } from "./installment-credit-policy-manager";
import { loadInstallmentCreditPolicy } from "@/lib/invoices/installment-credit";
import { buildFinanceOnboardingPlan } from "@/lib/finance/onboarding";
import { loadFinanceOnboardingFacts } from "@/lib/finance/onboarding-server";
import { FinanceOnboardingPanel } from "@/components/backoffice/finance-onboarding-panel";
import { ReviewMomentsManager } from "./review-moments-manager";
import { getReviewMomentsSettings } from "@/lib/notifications/settings";
import { ContactPhoneManager } from "./contact-phone-manager";
import { loadContactPhone } from "@/lib/tenant/contact-phone";
import { DomainsManager, type DomainView } from "./domains-manager";
import {
  loadTenantDomains,
  trafficRecords,
  verificationRecord,
} from "@/lib/tenant/domains";
import { loadBrandedPwaPublication } from "@/lib/tenant/branded-pwa-publication";
import { BrandedPwaPublicationPanel } from "./branded-pwa-publication-panel";
import { WhiteLabelPortalPreview } from "./white-label-portal-preview";
import {
  AdminPage,
  AdminPageHeader,
} from "@/components/backoffice/admin-primitives";

export const dynamic = "force-dynamic";

function SettingsGroup({
  title,
  description,
  children,
  defaultOpen = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details data-admin-disclosure open={defaultOpen}>
      <summary>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">
            {title}
          </span>
          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
            {description}
          </span>
        </span>
      </summary>
      <div data-disclosure-content className="space-y-4">
        {children}
      </div>
    </details>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, tenant } = await requireActiveTenant(["tenant_admin"]);
  const sp = await searchParams;
  const result = typeof sp.mollie === "string" ? sp.mollie : null;
  const reason = typeof sp.reason === "string" ? sp.reason : null;
  const brandingResult = typeof sp.branding === "string" ? sp.branding : null;
  const pwaResult = typeof sp.pwa === "string" ? sp.pwa : null;

  const service = createServiceRoleClient();
  const status = await getMollieApiKeyStatus(service, tenant.id);
  const brandingBundle = await getTenantBrandingBundle(tenant.id);
  const branding = brandingBundle.branding;
  const themePreset = brandingBundle.preset;

  const [{ data: departmentRows }, { data: ruleRows }] = await Promise.all([
    service
      .from("task_departments")
      .select("id, name")
      .eq("tenant_id", tenant.id)
      .order("name", { ascending: true }),
    service
      .from("task_assignment_rules")
      .select("id, keyword, match_type, department_id, active, sort_order")
      .eq("tenant_id", tenant.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);
  const departments = (departmentRows ?? []) as RuleDepartment[];
  const rules = (ruleRows ?? []) as AssignmentRule[];

  const leadScorePolicy = await loadLeadScorePolicy(service, tenant.id);
  const cancellationPolicy = await loadCancellationPolicy(service, tenant.id);
  const refillPolicy = await loadRefillPolicy(service, tenant.id);
  const studentSelfBookingPolicy = await loadStudentSelfBookingPolicy(
    service,
    tenant.id,
  );
  const parentPortalVisibility = await loadParentPortalVisibility(
    service,
    tenant.id,
  );
  const paymentReminderPolicy = await loadPaymentReminderPolicy(
    service,
    tenant.id,
  );
  const installmentCreditPolicy = await loadInstallmentCreditPolicy(
    service,
    tenant.id,
  );
  const reviewMomentsSettings = await getReviewMomentsSettings(
    service,
    tenant.id,
  );
  const contactPhone = await loadContactPhone(service, tenant.id);
  const brandedPwaPublication = await loadBrandedPwaPublication(
    service,
    tenant.id,
  );
  const financeOnboardingFacts = await loadFinanceOnboardingFacts(service, {
    tenantId: tenant.id,
    tenantName: tenant.name,
    mollie: {
      configured: status.configured,
      mode: status.mode,
    },
    paymentReminderPolicy,
    installmentCreditPolicy,
  });
  const financeOnboardingPlan = buildFinanceOnboardingPlan(
    financeOnboardingFacts,
  );

  const tenantDomains = await loadTenantDomains(service, tenant.id);
  const domainViews: DomainView[] = tenantDomains.map((d) => ({
    ...d,
    verifyRecord: verificationRecord(d),
    trafficRecords: trafficRecords(d.hostname),
  }));
  const entitlementSnapshot = await loadTenantEntitlementSnapshot(
    service,
    tenant.id,
  );
  const currentTenant = entitlementSnapshot.tenant;
  const limitStatuses = entitlementSnapshot.limitStatuses;
  const customDomainLimit = limitStatuses.custom_domains;
  const lockedCount = entitlementSnapshot.entitlements.locked.length;
  const isPlatformAdmin = user.profile?.is_platform_admin === true;

  const whiteLabelAvailable =
    entitlementSnapshot.featureAccess.white_label.allowed;
  const whiteLabelActive =
    whiteLabelAvailable && currentTenant.white_label_enabled;
  const hasExistingWhiteLabelState =
    currentTenant.white_label_enabled ||
    domainViews.length > 0 ||
    Boolean(
      branding?.logo_url ||
      branding?.primary_color ||
      branding?.primary_foreground ||
      branding?.welcome_message ||
      branding?.theme_preset_id ||
      branding?.theme_overrides,
    );
  const primaryHost =
    domainViews.find(
      (domain) => domain.is_primary && domain.status === "active",
    )?.hostname ?? `${currentTenant.slug}.nxtdrive.io`;
  const logoUrl = resolveLogoUrl(currentTenant, branding);
  const themeColor = resolveThemeColorForMode(
    currentTenant,
    "dark",
    brandingBundle,
    "#0c0c15",
  );
  const activeDomainCount = domainViews.filter(
    (domain) => domain.status === "active",
  ).length;
  const settingsSummaryCards = [
    {
      title: "Abonnement",
      value: PLAN_LABELS[currentTenant.plan] ?? currentTenant.plan,
      description:
        lockedCount === 0
          ? "alle commerciële modules van dit plan zijn beschikbaar"
          : `${lockedCount} feature${lockedCount === 1 ? "" : "s"} nog vergrendeld`,
      icon: ShieldCheck,
    },
    {
      title: "Betaalintegratie",
      value: status.configured
        ? status.mode === "live"
          ? "Live"
          : "Test"
        : "Nog leeg",
      description: status.configured
        ? "Mollie-sleutel is versleuteld opgeslagen"
        : "configureer Mollie om betaalflows te activeren",
      icon: CreditCard,
    },
    {
      title: "White-label",
      value: whiteLabelActive
        ? "Actief"
        : whiteLabelAvailable
          ? "Beschikbaar"
          : "Elite",
      description: whiteLabelActive
        ? "branding en app-shells volgen tenantstijl"
        : "branding blijft read-only of platform-default",
      icon: Palette,
    },
    {
      title: "Domeinen",
      value: activeDomainCount.toLocaleString("nl-NL"),
      description:
        activeDomainCount === 0
          ? "nog geen actieve branded hosts"
          : "actieve custom of branded hosts",
      icon: Globe,
    },
  ];

  return (
    <AdminPage>
      <AdminPageHeader
        title="Instellingen"
        description={`Tenant-specifieke configuratie voor ${tenant.name}.`}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {settingsSummaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title}>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle>{card.title}</CardTitle>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                    {card.value}
                  </p>
                </div>
                <span className="rounded-full bg-primary-soft p-2 text-primary">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {card.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Regiecentrum</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Technische status
              </p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {status.configured
                  ? "Mollie klaar voor gebruik"
                  : "Betaalstack nog incompleet"}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {status.configured
                  ? "Sleutel staat versleuteld klaar en kan direct gebruikt worden in checkout- en factuurflows."
                  : "Koppel eerst een Mollie-sleutel zodat facturen, betaallinks en herinneringen live kunnen draaien."}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Brandingstatus
              </p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {whiteLabelActive
                  ? "Tenantstijl draait live"
                  : whiteLabelAvailable
                    ? "Branding staat klaar"
                    : "White-label hangt af van upgrade"}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Primair host:{" "}
                <span className="font-medium text-foreground">
                  {primaryHost}
                </span>
              </p>
              {themePreset ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Preset:{" "}
                  <span className="font-medium text-foreground">
                    {themePreset.name}
                  </span>
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Snelle routes</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <Link
              href="/backoffice/abonnement"
              className="rounded-xl border border-border bg-muted/20 px-4 py-4 transition-colors hover:bg-muted/35"
            >
              <div className="flex items-center gap-2 text-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
                <p className="font-medium">Abonnement beheren</p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Bekijk limieten, gating en upgrade-impact per tenant.
              </p>
            </Link>
            <Link
              href="/backoffice/instellingen/notificaties"
              className="rounded-xl border border-border bg-muted/20 px-4 py-4 transition-colors hover:bg-muted/35"
            >
              <div className="flex items-center gap-2 text-foreground">
                <BellRing className="h-4 w-4 text-primary" aria-hidden />
                <p className="font-medium">Notificaties beheren</p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Stuur e-mail-, push- en in-app triggers centraal bij.
              </p>
            </Link>
            <Link
              href="/backoffice/instellingen/planning/afspraaktypen"
              className="rounded-xl border border-border bg-muted/20 px-4 py-4 transition-colors hover:bg-muted/35"
            >
              <div className="flex items-center gap-2 text-foreground">
                <CalendarClock className="h-4 w-4 text-primary" aria-hidden />
                <p className="font-medium">Planning & afspraaktypen</p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Beheer duur, buffers, leerling-, locatie- en voertuigbeleid.
              </p>
            </Link>
            <Link
              href="/backoffice/instellingen/workflows"
              className="rounded-xl border border-border bg-muted/20 px-4 py-4 transition-colors hover:bg-muted/35"
            >
              <div className="flex items-center gap-2 text-foreground">
                <Workflow className="h-4 w-4 text-primary" aria-hidden />
                <p className="font-medium">Workflow builder</p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Beheer templatecatalogus, eigenaarschap, SLA en kanalen.
              </p>
            </Link>
            <Link
              href="/backoffice/instellingen/vestigingen"
              className="rounded-xl border border-border bg-muted/20 px-4 py-4 transition-colors hover:bg-muted/35"
            >
              <div className="flex items-center gap-2 text-foreground">
                <Workflow className="h-4 w-4 text-primary" aria-hidden />
                <p className="font-medium">Vestigingen</p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Werk branch-structuur, capaciteitsverdeling en scope uit.
              </p>
            </Link>
            <Link
              href="/backoffice/rapportages"
              className="rounded-xl border border-border bg-muted/20 px-4 py-4 transition-colors hover:bg-muted/35"
            >
              <div className="flex items-center gap-2 text-foreground">
                <Globe className="h-4 w-4 text-primary" aria-hidden />
                <p className="font-medium">Rapportages</p>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Verbind deze instellingen direct met omzet, planning en adoptie.
              </p>
            </Link>
          </CardContent>
        </Card>
      </section>

      <SettingsGroup
        title="Financiën & abonnement"
        description="Betaalprovider, abonnementslimieten en de stappen om betalingen live te zetten."
        defaultOpen={Boolean(result)}
      >
        <FinanceOnboardingPanel
          facts={financeOnboardingFacts}
          plan={financeOnboardingPlan}
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Abonnement & entitlements
              <Badge variant="primary">
                {PLAN_LABELS[currentTenant.plan] ?? currentTenant.plan}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Je instellingen, white-label en schaalopties volgen het huidige
              abonnement. Bekijk gebruik, limieten en upgradeblokkades centraal
              in het abonnementsoverzicht.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {Object.values(limitStatuses).map((status) => (
                <div
                  key={status.key}
                  className="rounded-lg border border-border bg-muted/30 px-4 py-3"
                >
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {status.label}
                  </p>
                  <p className="mt-1 text-xl font-semibold text-foreground">
                    {status.isUnlimited
                      ? status.used
                      : `${status.used}/${status.limitLabel}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {status.isUnlimited
                      ? "Onbeperkt op dit plan"
                      : status.isOverLimit
                        ? "Boven limiet, uitbreiding vergrendeld"
                        : status.isAtLimit
                          ? "Limiet bereikt"
                          : `${status.remaining} beschikbaar`}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
              <p className="text-sm text-muted-foreground">
                {lockedCount === 0
                  ? "Alle commerciële features van dit plan zijn beschikbaar."
                  : `${lockedCount} commerciële feature${lockedCount === 1 ? "" : "s"} zijn nog vergrendeld op dit abonnement.`}
              </p>
              <Link
                href="/backoffice/abonnement"
                className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Abonnement bekijken →
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Mollie betaalintegratie
              {status.configured ? (
                <Badge variant={status.mode === "live" ? "success" : "info"}>
                  {status.mode === "live" ? "Live modus" : "Test modus"}
                </Badge>
              ) : (
                <Badge variant="warning">Niet geconfigureerd</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Plak hier de API-sleutel uit je Mollie-dashboard. We slaan hem
              versleuteld op (AES-256-GCM). De sleutel wordt nooit terug
              getoond. Gebruik een{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                test_…
              </code>{" "}
              sleutel zolang je nog test.
            </p>

            {status.configured && status.preview ? (
              <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Huidige sleutel:</span>{" "}
                <code className="font-mono text-foreground">
                  {status.preview}
                </code>
              </div>
            ) : null}

            {result === "saved" ? (
              <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                Mollie API-sleutel opgeslagen.
              </p>
            ) : null}
            {result === "empty" ? (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                Vul een API-sleutel in.
              </p>
            ) : null}
            {result === "error" ? (
              <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                Sleutel niet opgeslagen: {reason ?? "onbekende fout"}.
              </p>
            ) : null}

            <form action={saveMollieApiKey} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="api_key">Mollie API-sleutel</Label>
                <Input
                  id="api_key"
                  name="api_key"
                  type="password"
                  autoComplete="off"
                  placeholder="test_..."
                  required
                />
              </div>
              <Button type="submit" size="sm">
                {status.configured ? "Sleutel vervangen" : "Sleutel opslaan"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </SettingsGroup>

      <SettingsGroup
        title="Huisstijl & portals"
        description="Logo, kleuren en een gecontroleerde preview van de verschillende omgevingen."
        defaultOpen={Boolean(brandingResult)}
      >
        <WhiteLabelFoundationCard
          tenantName={tenant.name}
          logoUrl={logoUrl}
          primaryHost={primaryHost}
          themeColor={themeColor}
          backofficeName={resolveBrandAppName(tenant, "backoffice")}
          studentName={resolveBrandAppName(tenant, "student")}
          instructorName={resolveBrandAppName(tenant, "instructor")}
          parentName={resolveBrandAppName(tenant, "parent")}
          whiteLabelActive={whiteLabelActive}
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Huisstijl
              {whiteLabelActive ? (
                <Badge variant="success">Witlabel actief</Badge>
              ) : whiteLabelAvailable ? (
                <Badge variant="warning">Witlabel niet actief</Badge>
              ) : (
                <Badge variant="outline">Elite-functie</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!whiteLabelAvailable ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                <p className="font-medium">
                  White-label huisstijl vereist het Elite-abonnement.
                </p>
                <p className="mt-1 text-xs opacity-80">
                  {hasExistingWhiteLabelState
                    ? "Er staat al white-label configuratie klaar uit een hoger plan. Die blijft zichtbaar als referentie, maar aanpassen is nu read-only totdat Elite weer actief is."
                    : "Je kunt je logo en kleuren hier instellen. Ze worden pas zichtbaar voor je team en leerlingen zodra je account is opgewaardeerd naar Elite."}
                </p>
                <Link
                  href="/backoffice/abonnement"
                  className="mt-3 inline-flex items-center justify-center rounded-md border border-amber-500/40 bg-transparent px-4 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-500/10 dark:text-amber-200"
                >
                  Abonnement bekijken
                </Link>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Stel je eigen logo en kleuren in voor het backoffice, de
                instructeur- en de leerlingomgeving.
                {currentTenant.white_label_enabled
                  ? " Je huisstijl loopt nu ook door naar metadata, manifests en domeingebonden app-shells."
                  : " Je huisstijl wordt pas getoond zodra witlabel is geactiveerd voor jouw abonnement; tot die tijd blijft het NXTDRIVE-logo zichtbaar."}
              </p>
            )}

            {brandingResult === "saved" ? (
              <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                Huisstijl opgeslagen.
              </p>
            ) : null}
            {brandingResult === "reset" ? (
              <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                Huisstijl teruggezet naar NXTDRIVE standaard.
              </p>
            ) : null}
            {brandingResult === "error" ? (
              <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                Huisstijl niet opgeslagen: {reason ?? "onbekende fout"}.
              </p>
            ) : null}

            <BrandingForm
              initialLogoUrl={branding?.logo_url ?? ""}
              initialPrimaryColor={
                themePreset
                  ? brandingBundle.tokens.dark.primary
                  : (branding?.primary_color ?? "")
              }
              initialPrimaryForeground={
                themePreset
                  ? brandingBundle.tokens.dark.primary_foreground
                  : (branding?.primary_foreground ?? "")
              }
              initialWelcomeMessage={branding?.welcome_message ?? ""}
              hasThemeOverrides={Boolean(branding?.theme_overrides)}
              disabled={!whiteLabelAvailable}
              colorFieldsLocked={Boolean(themePreset)}
              themePresetName={themePreset?.name ?? null}
              themePresetDescription={themePreset?.description ?? null}
            />
          </CardContent>
        </Card>

        <WhiteLabelPortalPreview
          tenant={currentTenant}
          logoUrl={logoUrl}
          lightTokens={brandingBundle.tokens.light}
          darkTokens={brandingBundle.tokens.dark}
          whiteLabelActive={whiteLabelActive}
        />
      </SettingsGroup>

      <SettingsGroup
        title="Processen & beleid"
        description="Toewijzing, leadscore, annuleren, zelf boeken, termijnen en reviewmomenten."
      >
        <div className="grid items-start gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Taken & toewijzing</CardTitle>
            </CardHeader>
            <CardContent>
              <AssignmentRulesManager departments={departments} rules={rules} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Leadscore-regels</CardTitle>
            </CardHeader>
            <CardContent>
              <LeadScorePolicyManager policy={leadScorePolicy} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Annuleringsbeleid</CardTitle>
            </CardHeader>
            <CardContent>
              <CancellationPolicyManager policy={cancellationPolicy} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Herbezet-uitnodigingen</CardTitle>
            </CardHeader>
            <CardContent>
              <RefillPolicyManager policy={refillPolicy} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Leerling zelf boeken</CardTitle>
            </CardHeader>
            <CardContent>
              <StudentSelfBookingManager policy={studentSelfBookingPolicy} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ouderportaal</CardTitle>
            </CardHeader>
            <CardContent>
              <ParentPortalManager visibility={parentPortalVisibility} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Betaalherinneringen</CardTitle>
            </CardHeader>
            <CardContent>
              <PaymentReminderManager policy={paymentReminderPolicy} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Termijn-tegoed</CardTitle>
            </CardHeader>
            <CardContent>
              <InstallmentCreditPolicyManager
                policy={installmentCreditPolicy}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reviewverzoeken</CardTitle>
            </CardHeader>
            <CardContent>
              <ReviewMomentsManager settings={reviewMomentsSettings} />
            </CardContent>
          </Card>
        </div>
      </SettingsGroup>

      <SettingsGroup
        title="Contact & communicatie"
        description="Publieke contactgegevens en instellingen voor e-mail, push en in-app meldingen."
      >
        <div className="grid items-start gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Contactgegevens</CardTitle>
            </CardHeader>
            <CardContent>
              <ContactPhoneManager phone={contactPhone} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notificaties</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Beheer triggers per kanaal voor leerlingen en medewerkers.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/backoffice/instellingen/notificaties"
                  className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  Notificaties beheren
                </Link>
                <Link
                  href="/backoffice/instellingen/notificaties/delivery"
                  className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  Delivery dashboard
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </SettingsGroup>

      <SettingsGroup
        title="Apps & domeinen"
        description="Publicatiestatus, DNS en branded hosts voor de tenantapps."
        defaultOpen={Boolean(pwaResult)}
      >
        <BrandedPwaPublicationPanel
          publication={brandedPwaPublication}
          isPlatformAdmin={isPlatformAdmin}
          whiteLabelAvailable={whiteLabelAvailable}
        />
        {pwaResult === "saved" ? (
          <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            Branded PWA-publicatiestatus opgeslagen.
          </p>
        ) : null}
        {pwaResult === "reset" ? (
          <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            Branded PWA-publicatie teruggezet.
          </p>
        ) : null}
        {pwaResult === "error" ? (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            Branded PWA-publicatie niet aangepast: {reason ?? "onbekende fout"}.
          </p>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Domeinen
              {whiteLabelAvailable ? (
                <Badge variant="success">Beschikbaar</Badge>
              ) : (
                <Badge variant="outline">Elite-functie</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Koppel een eigen domein of subdomein aan jouw rijschool. De flow
              is zichtbaar voor klantadmins, maar toevoegen, verifiëren,
              verwijderen en primair maken blijft uitsluitend beschikbaar voor
              NXTDRIVE platformbeheer.
            </p>
            {!whiteLabelAvailable && domainViews.length > 0 ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                Er zijn nog {domainViews.length} domein
                {domainViews.length === 1 ? "" : "en"} gekoppeld vanuit een
                hoger plan. Ze blijven zichtbaar, maar domeinbeheer is read-only
                totdat Elite opnieuw actief is.
              </div>
            ) : null}
            {whiteLabelAvailable && customDomainLimit.isAtLimit ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                Je gebruikt nu {customDomainLimit.used}/
                {customDomainLimit.limitLabel} eigen domeinen. Nieuwe domeinen
                toevoegen is vergrendeld totdat je een domein verwijdert of je
                plan wijzigt.
              </div>
            ) : null}
            {whiteLabelAvailable && !isPlatformAdmin ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                Eigen domeinen worden door NXTDRIVE platformbeheer geactiveerd
                na technische controle van DNS, SSL, app-shells en manifests.
              </div>
            ) : null}
            <DomainsManager
              domains={domainViews}
              editable={whiteLabelAvailable && isPlatformAdmin}
              canAdd={
                whiteLabelAvailable &&
                isPlatformAdmin &&
                !customDomainLimit.isAtLimit
              }
              lockedReason={
                isPlatformAdmin
                  ? "Eigen domeinen vereisen het Elite-abonnement. Bestaande domeinen blijven zichtbaar, maar beheer is nu read-only."
                  : "Eigen domeinen kunnen alleen door NXTDRIVE platformbeheer worden toegevoegd, geverifieerd of gewijzigd."
              }
            />
          </CardContent>
        </Card>
      </SettingsGroup>
    </AdminPage>
  );
}
