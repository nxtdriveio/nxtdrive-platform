import { FileText, LockKeyhole, ScrollText, ShieldCheck } from "lucide-react";

import {
  FranchiseEmptyState,
  FranchiseKpiCard,
  FranchiseModeBadge,
  FranchisePage,
  FranchisePageHeader,
  FranchisePanel,
  FranchiseSectionTabs,
  FranchiseStatusBadge,
  FranchiseTableCell,
  FranchiseMiniTable,
} from "@/components/backoffice/franchise/franchise-primitives";
import { formatDateTime } from "@/components/backoffice/franchise/franchise-format";
import { loadFranchiseAuditEvents } from "@/lib/franchise/admin";
import { requireFranchiseOperator } from "@/lib/franchise/access";

export const dynamic = "force-dynamic";

export default async function FranchiseAuditPage() {
  const { tenant } = await requireFranchiseOperator();
  const events = await loadFranchiseAuditEvents(tenant.id, 24);
  const tenantCount = new Set(events.map((event) => event.tenant_id).filter(Boolean)).size;

  return (
    <FranchisePage>
      <FranchisePageHeader
        eyebrow="Audit & veiligheid"
        title="Audit"
        description="Traceerbare franchise- en tenantactiviteiten. Deze pagina leest alleen auditdata; gevoelige wijzigingen blijven via bestaande server actions en RPC's lopen."
        badges={
          <>
            <FranchiseModeBadge />
            <FranchiseStatusBadge tone="success">Insert-only audit</FranchiseStatusBadge>
          </>
        }
      />

      <FranchiseSectionTabs />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FranchiseKpiCard
          label="Audit events"
          value={events.length}
          hint="laatste activiteiten"
          icon={ScrollText}
          tone="primary"
        />
        <FranchiseKpiCard
          label="Tenants geraakt"
          value={tenantCount}
          hint="franchisegever + franchisees"
          icon={ShieldCheck}
          tone="delegated"
        />
        <FranchiseKpiCard
          label="Mutaties"
          value="Bewaakt"
          hint="server-side actions"
          icon={LockKeyhole}
          tone="readonly"
        />
        <FranchiseKpiCard
          label="Log model"
          value="Read"
          hint="geen bewerking vanuit UI"
          icon={FileText}
          tone="info"
        />
      </section>

      <FranchisePanel
        title="Recente auditlog"
        description="Gesorteerd op meest recent."
        contentClassName="p-0"
      >
        {events.length === 0 ? (
          <div className="p-4">
            <FranchiseEmptyState
              title="Nog geen audit events"
              description="Zodra branding, template, leerling of franchise-acties worden gelogd verschijnen ze hier."
            />
          </div>
        ) : (
          <FranchiseMiniTable
            columns={["Tijd", "Actie", "Target", "Tenant", "Payload"]}
            minWidth="920px"
          >
            {events.map((event) => (
              <tr key={event.id}>
                <FranchiseTableCell>{formatDateTime(event.created_at)}</FranchiseTableCell>
                <FranchiseTableCell>
                  <p className="font-black text-foreground">{event.action}</p>
                </FranchiseTableCell>
                <FranchiseTableCell>
                  {event.target_type ?? "tenant"}
                  {event.target_id ? (
                    <p className="max-w-[16rem] truncate text-xs text-muted-foreground">
                      {event.target_id}
                    </p>
                  ) : null}
                </FranchiseTableCell>
                <FranchiseTableCell>
                  <span className="max-w-[14rem] truncate text-xs text-muted-foreground">
                    {event.tenant_id ?? "-"}
                  </span>
                </FranchiseTableCell>
                <FranchiseTableCell>
                  <code className="line-clamp-1 rounded-lg bg-brand-muted px-2 py-1 text-xs text-muted-foreground">
                    {JSON.stringify(event.payload)}
                  </code>
                </FranchiseTableCell>
              </tr>
            ))}
          </FranchiseMiniTable>
        )}
      </FranchisePanel>
    </FranchisePage>
  );
}
