import { Bell, Building2, Cog, Palette, ShieldCheck, Wallet } from "lucide-react";

import {
  FranchiseActionLink,
  FranchiseKpiCard,
  FranchiseModeBadge,
  FranchisePage,
  FranchisePageHeader,
  FranchisePanel,
  FranchiseRowLink,
  FranchiseSectionTabs,
  FranchiseStatusBadge,
} from "@/components/backoffice/franchise/franchise-primitives";
import { requireFranchiseOperator } from "@/lib/franchise/access";
import { PLAN_LABELS } from "@/lib/platform/features";

export const dynamic = "force-dynamic";

export default async function FranchiseSettingsPage() {
  const { entitlementSnapshot, franchiseeCount } = await requireFranchiseOperator();

  return (
    <FranchisePage>
      <FranchisePageHeader
        eyebrow="Franchise instellingen"
        title="Instellingen"
        description="Bundelt de relevante beheerplekken voor franchise, abonnement, branding, organisatie en veiligheid zonder bestaande configuraties te dupliceren."
        badges={
          <>
            <FranchiseModeBadge />
            <FranchiseStatusBadge tone="info">
              {PLAN_LABELS[entitlementSnapshot.tenant.plan]}
            </FranchiseStatusBadge>
          </>
        }
        actions={
          <>
            <FranchiseActionLink href="/backoffice/instellingen">
              Tenant instellingen
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
          label="Franchisees"
          value={franchiseeCount}
          hint="gekoppeld"
          icon={Building2}
          tone="primary"
        />
        <FranchiseKpiCard
          label="Plan"
          value={PLAN_LABELS[entitlementSnapshot.tenant.plan]}
          hint="entitlement basis"
          icon={Wallet}
          tone="delegated"
        />
        <FranchiseKpiCard
          label="White-label"
          value={entitlementSnapshot.featureAccess.white_label.allowed ? "Actief" : "Locked"}
          hint="huisstijl"
          icon={Palette}
          tone={entitlementSnapshot.featureAccess.white_label.allowed ? "success" : "warning"}
        />
        <FranchiseKpiCard
          label="Security"
          value="Guarded"
          hint="server actions + audit"
          icon={ShieldCheck}
          tone="success"
        />
      </section>

      <FranchisePanel title="Beheerlinks" description="Ga naar de bestaande bron van waarheid.">
        <div className="grid gap-3 md:grid-cols-2">
          <FranchiseRowLink
            href="/backoffice/instellingen"
            title="Tenant instellingen"
            subtitle="Branding, white-label, notifications, account en app-instellingen."
            meta={<Cog className="h-4 w-4" aria-hidden />}
          />
          <FranchiseRowLink
            href="/backoffice/abonnement"
            title="Abonnement"
            subtitle="Plan, limieten en feature gates voor deze franchisegever."
            meta={<Wallet className="h-4 w-4" aria-hidden />}
          />
          <FranchiseRowLink
            href="/backoffice/organisatie"
            title="Organisatie"
            subtitle="Rollen, medewerkers, teams en permissies binnen de huidige tenant."
            meta={<Building2 className="h-4 w-4" aria-hidden />}
          />
          <FranchiseRowLink
            href="/backoffice/instellingen/notificaties"
            title="Notificaties"
            subtitle="Templates, kanaalinstellingen en branding voor berichten."
            meta={<Bell className="h-4 w-4" aria-hidden />}
          />
          <FranchiseRowLink
            href="/backoffice/franchise/architecture"
            title="Architectuur"
            subtitle="Franchise tenantmodel, read-only grenzen en security principes."
            meta={<ShieldCheck className="h-4 w-4" aria-hidden />}
          />
          <FranchiseRowLink
            href="/backoffice/franchise/entitlements"
            title="Entitlements"
            subtitle="Feature access, limieten en downgradegedrag."
            meta={<Wallet className="h-4 w-4" aria-hidden />}
          />
        </div>
      </FranchisePanel>
    </FranchisePage>
  );
}
