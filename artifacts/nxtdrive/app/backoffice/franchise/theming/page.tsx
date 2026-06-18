import { AppWindow, Globe2, Palette, RefreshCcw, ShieldCheck } from "lucide-react";

import {
  FranchiseActionLink,
  FranchiseKpiCard,
  FranchiseModeBadge,
  FranchisePage,
  FranchisePageHeader,
  FranchisePanel,
  FranchiseSectionTabs,
  FranchiseStatusBadge,
} from "@/components/backoffice/franchise/franchise-primitives";
import { getTenantBrandingBundle, resolveLogoUrl } from "@/lib/branding";
import { requireFranchiseOperator } from "@/lib/franchise/access";

export const dynamic = "force-dynamic";

export default async function FranchiseThemingPage() {
  const { tenant, entitlementSnapshot } = await requireFranchiseOperator();
  const bundle = await getTenantBrandingBundle(tenant.id);
  const branding = bundle.branding;
  const logoUrl = resolveLogoUrl(tenant, branding);
  const whiteLabel = entitlementSnapshot.featureAccess.white_label;
  const hasOverrides = Boolean(branding?.theme_overrides);

  return (
    <FranchisePage>
      <FranchisePageHeader
        eyebrow="Theming & white-label"
        title="Theming"
        description="Franchisebrede huisstijlstatus voor backoffice, instructor en student shells. Beheer blijft via tenant-instellingen en platform presets lopen."
        badges={
          <>
            <FranchiseModeBadge />
            <FranchiseStatusBadge tone={whiteLabel.allowed ? "success" : "warning"}>
              {whiteLabel.allowed ? "White-label actief" : "Elite vereist"}
            </FranchiseStatusBadge>
          </>
        }
        actions={
          <>
            <FranchiseActionLink href="/backoffice/instellingen">
              Tenant huisstijl
            </FranchiseActionLink>
            <FranchiseActionLink href="/backoffice/franchise/settings" variant="primary">
              Franchise settings
            </FranchiseActionLink>
          </>
        }
      />

      <FranchiseSectionTabs />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FranchiseKpiCard
          label="Preset"
          value={bundle.preset?.name ?? "NXTDRIVE"}
          hint={bundle.preset ? "platform preset" : "standaard"}
          icon={Palette}
          tone="primary"
        />
        <FranchiseKpiCard
          label="Logo"
          value={logoUrl ? "Tenant" : "NXTDRIVE"}
          hint="resolved logo"
          icon={AppWindow}
          tone={logoUrl ? "success" : "readonly"}
        />
        <FranchiseKpiCard
          label="Overrides"
          value={hasOverrides ? "Actief" : "Geen"}
          hint="theme token overrides"
          icon={RefreshCcw}
          tone={hasOverrides ? "warning" : "success"}
        />
        <FranchiseKpiCard
          label="Domein"
          value={branding?.custom_domain ?? "Platform"}
          hint="custom domain status"
          icon={Globe2}
          tone={branding?.custom_domain ? "delegated" : "readonly"}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.45fr_1fr]">
        <FranchisePanel title="Brand preview" description="Resolved tenant branding.">
          <div className="rounded-2xl border border-brand-card-border bg-white p-5">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Tenant logo" className="h-12 w-auto max-w-[220px] object-contain" />
            ) : (
              <div className="text-2xl font-black tracking-tight text-foreground">
                NXTDRIVE
              </div>
            )}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl p-4" style={{ background: bundle.tokens.light.primary, color: bundle.tokens.light.primary_foreground }}>
                <p className="text-sm font-black">Primary</p>
                <p className="mt-1 text-xs opacity-80">{bundle.tokens.light.primary}</p>
              </div>
              <div className="rounded-xl p-4" style={{ background: bundle.tokens.light.card, color: bundle.tokens.light.foreground, border: `1px solid ${bundle.tokens.light.border}` }}>
                <p className="text-sm font-black">Card</p>
                <p className="mt-1 text-xs opacity-80">{bundle.tokens.light.card}</p>
              </div>
            </div>
          </div>
        </FranchisePanel>

        <FranchisePanel title="Surface checks" description="Waar theming doorwerkt.">
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ["Backoffice", "Sidebar, topbar, panels en management tokens."],
              ["Instructor app", "Tablet/mobile cockpit met tenantstijl."],
              ["Student app", "Light shell met mobile-first PWA tokens."],
              ["Metadata & manifests", "Theme color, logo en domeincontext."],
            ].map(([title, description]) => (
              <div key={title} className="rounded-2xl border border-brand-card-border bg-white p-4">
                <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
                <h2 className="mt-3 font-black text-foreground">{title}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </FranchisePanel>
      </section>
    </FranchisePage>
  );
}
