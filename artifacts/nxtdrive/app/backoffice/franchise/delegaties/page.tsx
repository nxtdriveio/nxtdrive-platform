import { CalendarClock, Handshake, LockKeyhole, ShieldCheck } from "lucide-react";

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
import { requireFranchiseOperator } from "@/lib/franchise/access";

export const dynamic = "force-dynamic";

export default async function FranchiseDelegationsPage() {
  const { readOnlyDowngrade } = await requireFranchiseOperator();

  return (
    <FranchisePage>
      <FranchisePageHeader
        eyebrow="Delegatie & governance"
        title="Delegaties"
        description="Delegaties zijn de enige route waarmee franchisebrede inzichten kunnen leiden tot beperkte lokale acties. Zonder delegatie blijft alles read-only."
        badges={
          <>
            <FranchiseModeBadge />
            <FranchiseStatusBadge tone={readOnlyDowngrade ? "warning" : "readonly"}>
              Mutaties geblokkeerd
            </FranchiseStatusBadge>
          </>
        }
        actions={
          <>
            <FranchiseActionLink href="/backoffice/franchise/governance">
              Governance
            </FranchiseActionLink>
            <FranchiseActionLink href="/backoffice/franchise/audit" variant="primary">
              Audit
            </FranchiseActionLink>
          </>
        }
      />

      <FranchiseSectionTabs />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FranchiseKpiCard
          label="Actieve delegaties"
          value="0"
          hint="geen backend-mutatie actief"
          icon={Handshake}
          tone="readonly"
        />
        <FranchiseKpiCard
          label="Scope model"
          value="Expliciet"
          hint="tenant, vestiging, rol"
          icon={ShieldCheck}
          tone="delegated"
        />
        <FranchiseKpiCard
          label="Geldigheid"
          value="Tijdelijk"
          hint="altijd einddatum"
          icon={CalendarClock}
          tone="info"
        />
        <FranchiseKpiCard
          label="Default"
          value="Read-only"
          hint="veilig uitgangspunt"
          icon={LockKeyhole}
          tone="readonly"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.65fr]">
        <FranchisePanel title="Delegatie model" description="Voorbereid als veilige governance-laag.">
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ["Planning bewerken", "Alleen voor gekozen franchisee, vestiging of periode."],
              ["Template beheren", "Alleen standaard zichtbaar maken; lokale activatie blijft lokaal."],
              ["Financieel inzien", "Read-only rapportage, geen factuurmutaties over tenants heen."],
              ["Gebruikersbeheer", "Geen centrale wijziging zonder platform- of tenantbevestiging."],
            ].map(([title, description]) => (
              <div key={title} className="rounded-2xl border border-brand-card-border bg-white p-4">
                <h2 className="font-black text-foreground">{title}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </FranchisePanel>

        <FranchisePanel title="Nieuwe delegatie" description="Nog bewust uitgeschakeld.">
          <div className="rounded-2xl border border-dashed border-brand-border bg-brand-muted p-5">
            <LockKeyhole className="h-6 w-6 text-primary" aria-hidden />
            <h2 className="mt-3 font-black text-foreground">Geen mock-mutatie</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              De UI toont het delegatiemodel, maar maakt geen schijn-delegaties aan zolang er geen veilig backendcontract met audit en RLS/role checks bestaat.
            </p>
          </div>
        </FranchisePanel>
      </section>
    </FranchisePage>
  );
}
