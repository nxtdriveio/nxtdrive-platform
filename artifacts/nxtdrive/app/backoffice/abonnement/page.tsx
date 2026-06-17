import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Lock,
  MapPin,
  Palette,
  ShieldAlert,
  Users,
  Wallet,
} from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FEATURE_LABELS,
  FEATURE_PLAN,
  PLAN_DESCRIPTIONS,
  PLAN_HIGHLIGHTS,
  PLAN_LABELS,
  PLAN_ORDER,
  type FeatureKey,
} from "@/lib/platform/features";
import {
  loadTenantEntitlementSnapshot,
  type TenantLimitStatus,
} from "@/lib/platform/entitlements";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { TenantPlan } from "@/lib/types";

export const dynamic = "force-dynamic";

const FEATURE_GROUPS: Array<{ title: string; items: FeatureKey[] }> = [
  {
    title: "Kernoperatie",
    items: [
      "crm_leads",
      "student_management",
      "scheduling",
      "packages_credits",
      "invoicing",
      "tasks_workflow",
      "basic_reports",
    ],
  },
  {
    title: "Apps & portalen",
    items: [
      "instructor_pwa",
      "student_pwa",
      "parent_portal",
    ],
  },
  {
    title: "Schaal & premium",
    items: [
      "multi_branch",
      "advanced_reports",
      "franchise_as_franchisee",
      "white_label",
      "franchise_as_franchisegever",
      "ai_features",
    ],
  },
];

const QUICK_LINKS = [
  {
    href: "/backoffice/instellingen/vestigingen",
    label: "Vestigingen",
    description: "Capaciteit en branch-scope beheren",
    icon: MapPin,
  },
  {
    href: "/backoffice/medewerkers",
    label: "Medewerkers",
    description: "Invites, rollen en staffing-limieten",
    icon: Users,
  },
  {
    href: "/backoffice/rapportages",
    label: "Rapportages",
    description: "Bekijk welke managementlagen actief zijn",
    icon: BarChart3,
  },
  {
    href: "/backoffice/instellingen",
    label: "White-label",
    description: "Branding, domeinen en shell-instellingen",
    icon: Palette,
  },
];

function statusVariant(status: TenantLimitStatus) {
  if (status.isOverLimit) return "danger" as const;
  if (status.isAtLimit) return "warning" as const;
  if (status.isUnlimited) return "info" as const;
  return "success" as const;
}

function statusCopy(status: TenantLimitStatus): string {
  if (status.isOverLimit) {
    return "Boven limiet. Nieuwe uitbreiding blijft vergrendeld totdat het plan wordt verhoogd.";
  }
  if (status.isAtLimit) {
    return "Limiet bereikt. Nieuwe uitbreiding is nu geblokkeerd.";
  }
  if (status.isUnlimited) {
    return "Geen numerieke limiet op dit plan.";
  }
  return `${status.remaining} beschikbaar binnen dit plan.`;
}

function nextPlan(plan: TenantPlan): TenantPlan | null {
  if (plan === "start") return "pro";
  if (plan === "pro") return "elite";
  return null;
}

function requiredPlanBadge(feature: FeatureKey) {
  return PLAN_LABELS[FEATURE_PLAN[feature]];
}

export default async function AbonnementPage() {
  const { tenant } = await requireActiveTenant(["tenant_admin"]);
  const service = createServiceRoleClient();
  const snapshot = await loadTenantEntitlementSnapshot(service, tenant.id);
  const currentTenant = snapshot.tenant;
  const usage = snapshot.usage;
  const limitStatuses = snapshot.limitStatuses;
  const entitlements = snapshot.entitlements;
  const alertStatuses = Object.values(limitStatuses).filter(
    (status) => status.isAtLimit || status.isOverLimit,
  );
  const planUpgrade = nextPlan(entitlements.plan);
  const whiteLabelDowngraded =
    !entitlements.whiteLabelEligible &&
    (currentTenant.white_label_enabled || usage.custom_domains > 0);

  const operationalAlerts = [
    ...alertStatuses.map((status) => {
      if (status.key === "branches") {
        return {
          key: status.key,
          title: "Vestigingen",
          body:
            status.isOverLimit
              ? "Bestaande vestigingen blijven zichtbaar en je kunt ze nog corrigeren of afschalen, maar branch-uitbreiding blijft vergrendeld totdat het plan wordt verhoogd."
              : "Extra vestigingen aanmaken is nu geblokkeerd totdat het plan wordt verhoogd.",
        };
      }
      if (status.key === "staff_memberships") {
        return {
          key: status.key,
          title: "Medewerkers",
          body:
            status.isOverLimit
              ? "Bestaande medewerkers blijven behouden, maar nieuwe uitnodigingen blijven vergrendeld totdat de organisatie weer binnen plan past of wordt opgewaardeerd."
              : "Nieuwe medewerker-uitnodigingen zijn nu vergrendeld op het huidige plan.",
        };
      }
      return {
        key: status.key,
        title: "Eigen domeinen",
        body:
          "Custom domains blijven live zichtbaar, maar uitbreiding van extra domeinen is nu vergrendeld op dit abonnement.",
      };
    }),
    ...(whiteLabelDowngraded
      ? [
          {
            key: "white-label",
            title: "White-label read-only",
            body:
              "Branding en domeinen stammen uit een hoger plan. Ze blijven zichtbaar, maar beheer is read-only totdat Elite opnieuw actief is.",
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(145deg,color-mix(in_srgb,var(--card)_92%,transparent),color-mix(in_srgb,var(--primary)_10%,transparent))] p-5 shadow-[0_24px_80px_rgba(6,12,24,0.22)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-primary/90">
              <Wallet className="h-3.5 w-3.5" aria-hidden />
              Abonnement & entitlements
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {PLAN_LABELS[entitlements.plan]}
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                {PLAN_DESCRIPTIONS[entitlements.plan]}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Badge variant="primary">{currentTenant.name}</Badge>
              {alertStatuses.length > 0 || whiteLabelDowngraded ? (
                <Badge variant="warning">
                  <ShieldAlert className="h-3 w-3" aria-hidden />
                  Actie vereist
                </Badge>
              ) : (
                <Badge variant="success">
                  <CheckCircle2 className="h-3 w-3" aria-hidden />
                  Binnen plan
                </Badge>
              )}
              {planUpgrade ? (
                <Badge variant="outline">
                  Volgende stap: {PLAN_LABELS[planUpgrade]}
                </Badge>
              ) : (
                <Badge variant="outline">Hoogste plan actief</Badge>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/backoffice/instellingen"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Instellingen openen
            </Link>
            <a
              href="mailto:ops@nxtdrive.io?subject=NXTDRIVE%20abonnement%20upgrade"
              className={buttonVariants({ variant: "primary", size: "sm" })}
            >
              Upgrade bespreken
            </a>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        {Object.values(limitStatuses).map((status) => (
          <Card key={status.key}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3 text-foreground">
                <span>{status.label}</span>
                <Badge variant={statusVariant(status)}>
                  {status.isUnlimited
                    ? "Onbeperkt"
                    : `${status.used}/${status.limitLabel}`}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-2xl font-semibold tracking-tight text-foreground">
                {status.used}
              </p>
              <p className="text-sm text-muted-foreground">{statusCopy(status)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {operationalAlerts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Acties en downgrade-impact</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 lg:grid-cols-2">
            {operationalAlerts.map((alert) => (
              <Alert key={alert.key} variant="warning">
                <div>
                  <AlertTitle>{alert.title}</AlertTitle>
                  <AlertDescription>{alert.body}</AlertDescription>
                </div>
              </Alert>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Commerciele status</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="success">
              <div>
                <AlertTitle>Binnen planlimieten</AlertTitle>
                <AlertDescription>
                  Deze tenant zit momenteel netjes binnen planlimieten en heeft geen read-only downgradeblokkades actief.
                </AlertDescription>
              </div>
            </Alert>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Planvergelijking</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-3">
            {PLAN_ORDER.map((plan) => {
              const current = plan === entitlements.plan;
              return (
                <div
                  key={plan}
                  className={`rounded-xl border px-4 py-4 ${current ? "border-primary bg-primary/5" : "border-border bg-muted/20"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-base font-semibold text-foreground">
                      {PLAN_LABELS[plan]}
                    </p>
                    {current ? <Badge variant="primary">Huidig</Badge> : null}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {PLAN_DESCRIPTIONS[plan]}
                  </p>
                  <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                    {PLAN_HIGHLIGHTS[plan].map((highlight) => (
                      <li key={highlight} className="flex gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                        <span>{highlight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Volgende stappen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {planUpgrade ? (
              <div className="rounded-xl border border-border bg-muted/20 px-4 py-4">
                <p className="text-sm font-semibold text-foreground">
                  Groei naar {PLAN_LABELS[planUpgrade]}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Gebruik dit scherm om te zien wanneer branch-capaciteit, staffing,
                  rapportages of white-label structureel tegen je huidige plan aanlopen.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-muted/20 px-4 py-4">
                <p className="text-sm font-semibold text-foreground">
                  Elite volledig actief
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Deze tenant heeft het hoogste commerciële fundament. Focus nu vooral op governance, white-label activatie en operationele uitrol.
                </p>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {QUICK_LINKS.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-xl border border-border bg-muted/20 px-4 py-4 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-2 text-foreground">
                      <Icon className="h-4 w-4 text-primary" aria-hidden />
                      <span className="font-medium">{item.label}</span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {item.description}
                    </p>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {FEATURE_GROUPS.map((group) => (
          <Card key={group.title}>
            <CardHeader>
              <CardTitle className="text-foreground">{group.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {group.items.map((feature) => {
                const unlocked = entitlements.unlocked.includes(feature);
                return (
                  <div
                    key={feature}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        {FEATURE_LABELS[feature]}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Minimaal {requiredPlanBadge(feature)}
                      </p>
                    </div>
                    {unlocked ? (
                      <Badge variant="success">
                        <CheckCircle2 className="h-3 w-3" aria-hidden />
                        Actief
                      </Badge>
                    ) : (
                      <Badge variant="outline">
                        <Lock className="h-3 w-3" aria-hidden />
                        Vergrendeld
                      </Badge>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Locked feature samenvatting</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="space-y-2">
            {entitlements.locked.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Alle features van dit plan zijn vrijgegeven. Alleen tenant-specifieke activatie, zoals white-label enablement, kan nog extra toggles vragen.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {entitlements.locked.map((feature) => (
                  <span
                    key={feature}
                    className="rounded-full border border-border bg-muted/30 px-3 py-1 text-xs text-muted-foreground"
                  >
                    {FEATURE_LABELS[feature]} - {requiredPlanBadge(feature)}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/backoffice"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Terug naar dashboard
            </Link>
            <a
              href="mailto:ops@nxtdrive.io?subject=NXTDRIVE%20commercial%20review"
              className={buttonVariants({ variant: "primary", size: "sm" })}
            >
              NXTDRIVE contacteren
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
