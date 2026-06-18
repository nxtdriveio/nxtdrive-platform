import { Database, Layers3, LockKeyhole, Network, ServerCog, ShieldCheck } from "lucide-react";

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
import { loadFranchiseContext } from "@/lib/franchise/context";

export const dynamic = "force-dynamic";

export default async function FranchiseArchitecturePage() {
  const { tenant } = await requireFranchiseOperator();
  const context = await loadFranchiseContext(tenant.id);

  return (
    <FranchisePage>
      <FranchisePageHeader
        eyebrow="Platform & architectuur"
        title="Architectuur"
        description="Franchise is een tenant-overstijgende stuurlaag boven losse tenantcontainers. Deze pagina maakt die grens expliciet voor beheer, rapportage en veiligheid."
        badges={
          <>
            <FranchiseModeBadge />
            <FranchiseStatusBadge tone="success">Tenant-isolatie</FranchiseStatusBadge>
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
          label="Franchisegever"
          value={context.franchisegever_name}
          hint="root tenant"
          icon={Network}
          tone="primary"
        />
        <FranchiseKpiCard
          label="Franchisees"
          value={context.franchisees.length}
          hint="child tenants"
          icon={Layers3}
          tone="delegated"
        />
        <FranchiseKpiCard
          label="Datagrens"
          value="Tenant"
          hint="geen shared write model"
          icon={Database}
          tone="readonly"
        />
        <FranchiseKpiCard
          label="Security"
          value="Server"
          hint="service reads, guarded actions"
          icon={ShieldCheck}
          tone="success"
        />
      </section>

      <FranchisePanel title="Architectuurprincipes" description="De basis onder de franchisebackoffice.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[
            {
              icon: Database,
              title: "Tenant boundary",
              description:
                "Elke franchisee heeft eigen tenantdata en eigen lokale verantwoordelijkheden.",
            },
            {
              icon: ServerCog,
              title: "Server-side aggregatie",
              description:
                "Franchise dashboards lezen via server services, niet via client-side secret keys.",
            },
            {
              icon: LockKeyhole,
              title: "Read-only default",
              description:
                "Cross-tenant schrijftoegang bestaat niet zonder expliciete backendactie.",
            },
            {
              icon: ShieldCheck,
              title: "Audit first",
              description: "Gevoelige acties worden gelogd en blijven herleidbaar.",
            },
            {
              icon: Layers3,
              title: "Entitlements",
              description:
                "Franchisegever vereist Elite; downgrade behoudt zichtbaarheid als read-only.",
            },
            {
              icon: Network,
              title: "Bestuurlijke laag",
              description:
                "Het doel is sturen, vergelijken en escaleren, niet lokale operatie overnemen.",
            },
          ].map(({ icon: Icon, title, description }) => (
            <div key={title} className="rounded-2xl border border-brand-card-border bg-white p-4">
              <Icon className="h-5 w-5 text-primary" aria-hidden />
              <h2 className="mt-3 font-black text-foreground">{title}</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </FranchisePanel>
    </FranchisePage>
  );
}
