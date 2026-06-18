import { FileLock2, Gauge, ShieldCheck, Wallet } from "lucide-react";

import {
  FranchiseActionLink,
  FranchiseKpiCard,
  FranchiseModeBadge,
  FranchisePage,
  FranchisePageHeader,
  FranchisePanel,
  FranchiseProgressBar,
  FranchiseSectionTabs,
  FranchiseStatusBadge,
  FranchiseTableCell,
  FranchiseMiniTable,
} from "@/components/backoffice/franchise/franchise-primitives";
import {
  FEATURE_LABELS,
  PLAN_LABELS,
  type FeatureKey,
} from "@/lib/platform/features";
import { requireFranchiseOperator } from "@/lib/franchise/access";

export const dynamic = "force-dynamic";

export default async function FranchiseEntitlementsPage() {
  const { entitlementSnapshot, readOnlyDowngrade } = await requireFranchiseOperator();
  const featureRows = Object.entries(entitlementSnapshot.featureAccess) as Array<
    [FeatureKey, (typeof entitlementSnapshot.featureAccess)[FeatureKey]]
  >;
  const locked = featureRows.filter(([, access]) => !access.allowed).length;
  const limitAlerts = Object.values(entitlementSnapshot.limitStatuses).filter(
    (status) => status.isAtLimit || status.isOverLimit,
  ).length;

  return (
    <FranchisePage>
      <FranchisePageHeader
        eyebrow="Entitlements"
        title="Entitlements"
        description="Plan, feature gates en gebruikslimieten voor de franchisegever. Downgrade zorgt voor read-only zichtbaarheid in plaats van stille functieverlies."
        badges={
          <>
            <FranchiseModeBadge />
            <FranchiseStatusBadge tone={readOnlyDowngrade ? "warning" : "success"}>
              {readOnlyDowngrade ? "Downgrade read-only" : "Plan actief"}
            </FranchiseStatusBadge>
          </>
        }
        actions={
          <>
            <FranchiseActionLink href="/backoffice/abonnement">
              Abonnement
            </FranchiseActionLink>
            <FranchiseActionLink href="/backoffice/franchise/governance" variant="primary">
              Governance
            </FranchiseActionLink>
          </>
        }
      />

      <FranchiseSectionTabs />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FranchiseKpiCard
          label="Plan"
          value={PLAN_LABELS[entitlementSnapshot.tenant.plan]}
          hint="huidige tenant"
          icon={Wallet}
          tone="primary"
        />
        <FranchiseKpiCard
          label="Features locked"
          value={locked}
          hint="hogere planlaag nodig"
          icon={FileLock2}
          tone={locked > 0 ? "warning" : "success"}
        />
        <FranchiseKpiCard
          label="Limiet alerts"
          value={limitAlerts}
          hint="gebruik tegen grens"
          icon={Gauge}
          tone={limitAlerts > 0 ? "danger" : "success"}
        />
        <FranchiseKpiCard
          label="Franchise"
          value={
            entitlementSnapshot.featureAccess.franchise_as_franchisegever.allowed
              ? "Actief"
              : "Read-only"
          }
          hint="franchisegever"
          icon={ShieldCheck}
          tone={
            entitlementSnapshot.featureAccess.franchise_as_franchisegever.allowed
              ? "success"
              : "readonly"
          }
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.48fr_1fr]">
        <FranchisePanel title="Limieten" description="Gebruik per commerciele grens.">
          <div className="space-y-4">
            {Object.values(entitlementSnapshot.limitStatuses).map((status) => {
              const value =
                status.limit === null || status.limit === 0
                  ? status.used > 0
                    ? 100
                    : 0
                  : Math.round((status.used / status.limit) * 100);
              return (
                <div key={status.key}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span className="font-black text-foreground">{status.label}</span>
                    <span className="text-xs font-bold text-muted-foreground">
                      {status.used}/{status.limitLabel}
                    </span>
                  </div>
                  <FranchiseProgressBar
                    value={value}
                    tone={status.isOverLimit ? "danger" : status.isAtLimit ? "warning" : "success"}
                    label={status.limitLabel}
                  />
                </div>
              );
            })}
          </div>
        </FranchisePanel>

        <FranchisePanel
          title="Feature toegang"
          description="Feature gates centraal uit hetzelfde entitlementmodel."
          contentClassName="p-0"
        >
          <FranchiseMiniTable columns={["Feature", "Plan", "Toegang", "Status"]} minWidth="760px">
            {featureRows.map(([key, access]) => (
              <tr key={key}>
                <FranchiseTableCell>
                  <p className="font-black text-foreground">{FEATURE_LABELS[key]}</p>
                  <p className="text-xs text-muted-foreground">{key}</p>
                </FranchiseTableCell>
                <FranchiseTableCell>{PLAN_LABELS[access.requiredPlan]}</FranchiseTableCell>
                <FranchiseTableCell>
                  {access.allowed ? "Beschikbaar" : "Niet beschikbaar"}
                </FranchiseTableCell>
                <FranchiseTableCell>
                  <FranchiseStatusBadge tone={access.allowed ? "success" : "readonly"}>
                    {access.allowed ? "Actief" : "Locked"}
                  </FranchiseStatusBadge>
                </FranchiseTableCell>
              </tr>
            ))}
          </FranchiseMiniTable>
        </FranchisePanel>
      </section>
    </FranchisePage>
  );
}
