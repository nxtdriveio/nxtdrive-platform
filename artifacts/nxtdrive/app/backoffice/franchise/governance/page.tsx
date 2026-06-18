import { BadgeCheck, LockKeyhole, Scale, ShieldCheck, Workflow } from "lucide-react";

import {
  FranchiseActionLink,
  FranchiseErrorState,
  FranchiseKpiCard,
  FranchiseModeBadge,
  FranchisePage,
  FranchisePageHeader,
  FranchisePanel,
  FranchiseProgressBar,
  FranchiseSectionTabs,
  FranchiseStatusBadge,
} from "@/components/backoffice/franchise/franchise-primitives";
import {
  buildFranchiseControlCards,
  type FranchiseControlStatus,
} from "@/lib/franchise/admin";
import { requireFranchiseOperator } from "@/lib/franchise/access";
import { loadFranchiseGovernanceOverview } from "@/lib/franchise/governance";
import { loadFranchiseTemplates } from "@/lib/franchise/templates";

export const dynamic = "force-dynamic";

function statusTone(status: FranchiseControlStatus) {
  if (status === "active" || status === "ready") return "success";
  if (status === "review") return "warning";
  if (status === "blocked") return "danger";
  return "readonly";
}

export default async function FranchiseGovernancePage() {
  const { tenant, entitlementSnapshot } = await requireFranchiseOperator();
  let data:
    | [
        Awaited<ReturnType<typeof loadFranchiseGovernanceOverview>>,
        Awaited<ReturnType<typeof loadFranchiseTemplates>>,
      ]
    | null = null;

  try {
    data = await Promise.all([
      loadFranchiseGovernanceOverview(tenant.id),
      loadFranchiseTemplates(tenant.id),
    ]);
  } catch (error) {
    console.error("[franchise/governance] load failed", error);
  }

  if (!data) {
    return (
      <FranchiseErrorState
        title="Franchise Governance"
        description={`Governance kon nog niet worden geladen voor ${tenant.name}.`}
      />
    );
  }

  const [governance, templates] = data;
  const controlCards = buildFranchiseControlCards({
    governance,
    templates,
    entitlementSnapshot,
  });

  return (
    <FranchisePage>
      <FranchisePageHeader
        eyebrow="Governance"
        title="Governance"
        description="Centrale controlelaag voor franchisebrede standaarden, delegaties, read-only grenzen en auditbaarheid."
        badges={
          <>
            <FranchiseModeBadge />
            <FranchiseStatusBadge tone="success">Guard actief</FranchiseStatusBadge>
          </>
        }
        actions={
          <>
            <FranchiseActionLink href="/backoffice/franchise/delegaties">
              Delegaties
            </FranchiseActionLink>
            <FranchiseActionLink href="/backoffice/franchise/audit" variant="primary">
              Auditlog
            </FranchiseActionLink>
          </>
        }
      />

      <FranchiseSectionTabs />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FranchiseKpiCard
          label="Template adoptie"
          value={`${governance.template_activation_rate}%`}
          hint={`${governance.franchisees_with_active_templates}/${governance.franchisees_total} franchisees`}
          icon={BadgeCheck}
          tone="success"
        />
        <FranchiseKpiCard
          label="Directe aandacht"
          value={governance.high_priority_count}
          hint={`${governance.attention_count} totaal`}
          icon={Scale}
          tone={governance.high_priority_count > 0 ? "danger" : "success"}
        />
        <FranchiseKpiCard
          label="Vestigingsbasis"
          value={governance.franchisees_without_active_branches}
          hint="zonder actieve vestiging"
          icon={Workflow}
          tone={governance.franchisees_without_active_branches > 0 ? "warning" : "success"}
        />
        <FranchiseKpiCard
          label="Mutatiemodel"
          value="Read-only"
          hint="tenzij gedelegeerd"
          icon={LockKeyhole}
          tone="readonly"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.55fr]">
        <FranchisePanel title="Governance controls" description="Status van franchisebrede beheerdomeinen.">
          <div className="grid gap-3 md:grid-cols-2">
            {controlCards.map((card) => (
              <article key={card.title} className="rounded-2xl border border-brand-card-border bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-black text-foreground">{card.title}</h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {card.description}
                    </p>
                  </div>
                  <FranchiseStatusBadge tone={statusTone(card.status)}>
                    {card.value}
                  </FranchiseStatusBadge>
                </div>
                <p className="mt-3 text-xs font-bold text-primary">{card.detail}</p>
              </article>
            ))}
          </div>
        </FranchisePanel>

        <FranchisePanel title="Rollout gaten" description="Wat bestuurlijk aandacht nodig heeft.">
          <div className="space-y-3">
            {governance.rollout_gaps.map((gap) => (
              <div key={gap.label} className="rounded-xl border border-brand-card-border bg-white px-3 py-3">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                  {gap.label}
                </p>
                <p className="mt-1 text-2xl font-black text-foreground">{gap.value}</p>
                <p className="text-xs text-muted-foreground">{gap.detail}</p>
              </div>
            ))}
          </div>
        </FranchisePanel>
      </section>

      <FranchisePanel title="Governance policy" description="Franchise is geen centrale schrijfmachine.">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ["Tenant-isolatie", "Elke franchisee blijft een eigen tenant en data-eigenaar."],
            ["Expliciete delegatie", "Schrijven kan alleen met scope, rol, geldigheid en audit."],
            ["AI onder controle", "AI mag samenvatten en voorstellen, niet autonoom publiceren."],
          ].map(([title, description]) => (
            <div key={title} className="rounded-2xl border border-brand-card-border bg-white p-4">
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
              <h2 className="mt-3 font-black text-foreground">{title}</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            </div>
          ))}
        </div>
      </FranchisePanel>
    </FranchisePage>
  );
}
