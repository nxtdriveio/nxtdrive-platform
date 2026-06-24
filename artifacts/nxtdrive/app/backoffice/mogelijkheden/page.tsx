import { CheckCircle2, Gauge, Lock, ShieldCheck, Sparkles } from "lucide-react";

import {
  AdminGrid,
  AdminMetricStrip,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from "@/components/backoffice/admin-primitives";
import { Badge } from "@/components/ui/badge";
import { requireActiveTenant } from "@/lib/auth/require-role";
import {
  ENTITLEMENT_LIMIT_ORDER,
  FEATURE_LABELS,
  FEATURE_PLAN,
  PLAN_LABELS,
  type FeatureKey,
} from "@/lib/platform/features";
import { loadTenantEntitlementSnapshot } from "@/lib/platform/entitlements";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const FEATURE_GROUPS: Array<{
  title: string;
  description: string;
  items: FeatureKey[];
}> = [
  {
    title: "Dagelijkse operatie",
    description: "De kernmodules waarmee de rijschool dagelijks werkt.",
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
    title: "Apps en portalen",
    description: "Toegang voor instructeurs, leerlingen en ouders.",
    items: ["instructor_pwa", "student_pwa", "parent_portal"],
  },
  {
    title: "Schaal, franchise en AI",
    description:
      "Modules voor groei, white-label, netwerksturing en slimme assistentie.",
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

function accessLabel(allowed: boolean) {
  return allowed ? "Actief" : "Locked";
}

export default async function TenantCapabilitiesPage() {
  const { tenant } = await requireActiveTenant([
    "tenant_admin",
    "branch_manager",
    "planner",
    "admin_staff",
    "franchise_admin",
  ]);
  const service = createServiceRoleClient();
  const snapshot = await loadTenantEntitlementSnapshot(service, tenant.id);
  const enabledFeatures = Object.values(snapshot.featureAccess).filter(
    (access) => access.allowed,
  ).length;
  const totalFeatures = Object.values(snapshot.featureAccess).length;
  const limitAlerts = Object.values(snapshot.limitStatuses).filter(
    (status) => status.isAtLimit || status.isOverLimit,
  ).length;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Producttoegang"
        title="Wat kan deze tenant wel en niet?"
        description="Een centraal overzicht van abonnement, modules, limieten en tenant-specifieke activatie. Dit scherm gebruikt dezelfde entitlement-regels als de rest van NXTDRIVE."
      />

      <AdminMetricStrip
        items={[
          {
            label: "Plan",
            value: PLAN_LABELS[snapshot.entitlements.plan],
            hint: snapshot.tenant.name,
          },
          {
            label: "Modules actief",
            value: `${enabledFeatures}/${totalFeatures}`,
            hint: "Binnen huidig abonnement",
          },
          {
            label: "White-label",
            value: snapshot.entitlements.whiteLabelEligible
              ? "Actief"
              : "Niet actief",
            hint: snapshot.tenant.white_label_enabled
              ? "Tenantflag staat aan"
              : "Tenantflag staat uit",
          },
          {
            label: "Limiet alerts",
            value: limitAlerts,
            hint:
              limitAlerts > 0 ? "Actie of upgrade nodig" : "Binnen limieten",
          },
        ]}
      />

      <AdminGrid columns="3">
        {ENTITLEMENT_LIMIT_ORDER.map((key) => {
          const status = snapshot.limitStatuses[key];
          const percentage =
            status.limit === null || status.limit === 0
              ? status.used > 0
                ? 100
                : 0
              : Math.min(100, Math.round((status.used / status.limit) * 100));
          const tone = status.isOverLimit
            ? "bg-danger"
            : status.isAtLimit
              ? "bg-warning"
              : "bg-primary";

          return (
            <AdminPanel
              key={key}
              title={status.label}
              description="Gebruik en planlimiet"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-3xl font-black text-foreground">
                    {status.used}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    van {status.limitLabel}
                  </p>
                </div>
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <Gauge className="h-5 w-5" aria-hidden />
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--surface-3)]">
                <div
                  className={`h-full rounded-full ${tone}`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                {status.isUnlimited
                  ? "Geen numerieke limiet op dit plan."
                  : status.isOverLimit
                    ? "Deze tenant zit boven de planlimiet."
                    : status.isAtLimit
                      ? "De planlimiet is bereikt."
                      : `${status.remaining} beschikbaar binnen het huidige plan.`}
              </p>
            </AdminPanel>
          );
        })}
      </AdminGrid>

      <AdminGrid columns="3" className="items-start">
        {FEATURE_GROUPS.map((group) => (
          <AdminPanel
            key={group.title}
            title={group.title}
            description={group.description}
            contentClassName="space-y-3"
          >
            {group.items.map((feature) => {
              const access = snapshot.featureAccess[feature];
              return (
                <div
                  key={feature}
                  className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-[var(--surface-2)] p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-black text-foreground">
                      {FEATURE_LABELS[feature]}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Vereist {PLAN_LABELS[FEATURE_PLAN[feature]]}
                      {access.requiresEnabledFlag ? " en tenant-activatie" : ""}
                    </p>
                  </div>
                  <Badge
                    variant={access.allowed ? "success" : "outline"}
                    className="shrink-0"
                  >
                    {access.allowed ? (
                      <CheckCircle2 className="h-3 w-3" aria-hidden />
                    ) : (
                      <Lock className="h-3 w-3" aria-hidden />
                    )}
                    {accessLabel(access.allowed)}
                  </Badge>
                </div>
              );
            })}
          </AdminPanel>
        ))}
      </AdminGrid>

      <AdminPanel
        title="Interpretatie"
        description="Snel zien waarom een module wel of niet beschikbaar is."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-[var(--surface-2)] p-4">
            <ShieldCheck className="h-5 w-5 text-success" aria-hidden />
            <p className="mt-3 text-sm font-black text-foreground">
              Plan is leidend
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Moduletoegang wordt centraal bepaald door het tenantplan, zodat
              UI, rapportage en backend dezelfde waarheid gebruiken.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-[var(--surface-2)] p-4">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden />
            <p className="mt-3 text-sm font-black text-foreground">
              Activatie blijft expliciet
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Premium mogelijkheden zoals white-label kunnen planmatig
              beschikbaar zijn, maar vragen nog steeds tenant-specifieke
              activatie.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-[var(--surface-2)] p-4">
            <Gauge className="h-5 w-5 text-warning" aria-hidden />
            <p className="mt-3 text-sm font-black text-foreground">
              Limieten blokkeren uitbreiding
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Bestaande data blijft zichtbaar, maar nieuwe uitbreiding wordt
              beperkt zodra een planlimiet bereikt of overschreden is.
            </p>
          </div>
        </div>
      </AdminPanel>
    </AdminPage>
  );
}
