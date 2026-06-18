import {
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  FileText,
  GitBranch,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import {
  FranchiseActionLink,
  FranchiseEmptyState,
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

export default async function FranchisePlaybookPage() {
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
    console.error("[franchise/playbook] load failed", error);
  }

  if (!data) {
    return (
      <FranchiseErrorState
        title="Franchise Playbook"
        description={`Het franchiseplaybook kon nog niet worden geladen voor ${tenant.name}.`}
      />
    );
  }

  const [governance, templates] = data;
  const controlCards = buildFranchiseControlCards({
    governance,
    templates,
    entitlementSnapshot,
  });
  const rolloutRate = governance.template_activation_rate;

  return (
    <FranchisePage>
      <FranchisePageHeader
        eyebrow="Templates & playbook"
        title="Playbook"
        description="Het bestuurlijke handboek voor franchisebrede standaarden, lokale activatie, delegaties, audit en gecontroleerde rollout."
        badges={
          <>
            <FranchiseModeBadge />
            <FranchiseStatusBadge tone="success">Franchise canon</FranchiseStatusBadge>
          </>
        }
        actions={
          <>
            <FranchiseActionLink href="/backoffice/franchise/templates">
              Templates
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
          label="Actieve standaarden"
          value={governance.active_templates}
          hint="templates actief"
          icon={BookOpenCheck}
          tone="success"
        />
        <FranchiseKpiCard
          label="Rollout"
          value={`${rolloutRate}%`}
          hint="franchisees geactiveerd"
          icon={GitBranch}
          tone="delegated"
        />
        <FranchiseKpiCard
          label="Open gaten"
          value={governance.franchisees_without_template_activation}
          hint="zonder activatie"
          icon={ClipboardList}
          tone={governance.franchisees_without_template_activation > 0 ? "warning" : "success"}
        />
        <FranchiseKpiCard
          label="Governance"
          value="Read-only"
          hint="tenzij gedelegeerd"
          icon={ShieldCheck}
          tone="readonly"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.42fr_1fr]">
        <FranchisePanel title="Rollout status" description="Template-adoptie per netwerk.">
          <div className="space-y-4">
            <div className="rounded-2xl border border-brand-card-border bg-white p-4">
              <p className="text-sm font-black text-foreground">Template adoptie</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {governance.franchisees_with_active_templates} van {governance.franchisees_total} franchisees hebben een actieve template.
              </p>
              <div className="mt-4">
                <FranchiseProgressBar value={rolloutRate} tone="delegated" />
              </div>
            </div>
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

        <FranchisePanel title="Playbook modules" description="Wat de franchisegever centraal mag bewaken.">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
      </section>

      <FranchisePanel title="Franchise flow" description="Van standaard naar lokale uitvoering.">
        <div className="grid gap-3 md:grid-cols-5">
          {[
            ["1", "Standaard", "Franchisegever onderhoudt templates en werkwijze."],
            ["2", "Distributie", "Template wordt zichtbaar voor gekozen franchisee."],
            ["3", "Activatie", "Franchisee activeert lokaal naar pakket of proces."],
            ["4", "Bewaking", "Cockpit meet adoptie, planning, prestaties en signalen."],
            ["5", "Audit", "Afwijkingen, delegaties en mutaties blijven traceerbaar."],
          ].map(([step, title, description]) => (
            <div key={step} className="rounded-2xl border border-brand-card-border bg-white p-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-accent text-sm font-black text-primary">
                {step}
              </span>
              <h3 className="mt-3 font-black text-foreground">{title}</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {description}
              </p>
            </div>
          ))}
        </div>
      </FranchisePanel>

      <FranchisePanel title="AI rol" description="Ondersteunend, nooit autonoom publicerend.">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              icon: Sparkles,
              title: "Samenvatten",
              description: "AI helpt signalen kort te maken voor bestuur en coaching.",
            },
            {
              icon: FileText,
              title: "Voorstellen",
              description: "AI kan conceptacties voorstellen, maar een beheerder beslist.",
            },
            {
              icon: CheckCircle2,
              title: "Controle",
              description: "Geen publicatie of mutatie zonder expliciete bevestiging.",
            },
          ].map(({ icon: Icon, title, description }) => (
            <div key={title} className="rounded-xl border border-brand-card-border bg-white px-3 py-3">
              <Icon className="h-5 w-5 text-primary" aria-hidden />
              <p className="mt-2 font-black text-foreground">{title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </FranchisePanel>
    </FranchisePage>
  );
}
