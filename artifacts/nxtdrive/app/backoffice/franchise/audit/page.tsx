import Link from "next/link";
import { FileText, Filter, LockKeyhole, ScrollText, ShieldCheck } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  FRANCHISE_AUDIT_ACTION_OPTIONS,
  FRANCHISE_AUDIT_CATEGORY_OPTIONS,
  franchiseAuditCategoryLabel,
  isFranchiseAuditAction,
  isFranchiseAuditCategory,
  loadFranchiseAuditEvents,
  loadFranchiseAuditTenantOptions,
  type FranchiseAuditFilters,
} from "@/lib/franchise/admin";
import { requireFranchiseOperator } from "@/lib/franchise/access";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function param(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function clean(value: string | undefined, max = 120) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function dateParam(value: string | undefined) {
  const trimmed = clean(value, 10);
  return trimmed && /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : undefined;
}

function auditFiltersFromParams(params: SearchParams): FranchiseAuditFilters {
  const categoryRaw = clean(param(params, "category"), 40);
  const actionRaw = clean(param(params, "action"), 120);
  return {
    category: isFranchiseAuditCategory(categoryRaw) ? categoryRaw : undefined,
    action: isFranchiseAuditAction(actionRaw) ? actionRaw : undefined,
    tenantId: clean(param(params, "tenant"), 120),
    targetType: clean(param(params, "target_type"), 80),
    targetId: clean(param(params, "target_id"), 120),
    from: dateParam(param(params, "from")),
    to: dateParam(param(params, "to")),
  };
}

function activeFilterCount(filters: FranchiseAuditFilters) {
  return Object.values(filters).filter(Boolean).length;
}

export default async function FranchiseAuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { tenant } = await requireFranchiseOperator();
  const filters = auditFiltersFromParams(params);
  const [events, tenantOptions] = await Promise.all([
    loadFranchiseAuditEvents(tenant.id, { limit: 80, filters }),
    loadFranchiseAuditTenantOptions(tenant.id),
  ]);
  const tenantCount = new Set(events.map((event) => event.tenant_id).filter(Boolean)).size;
  const activeFilters = activeFilterCount(filters);

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
            {activeFilters > 0 ? (
              <FranchiseStatusBadge tone="info">
                {activeFilters} filter{activeFilters === 1 ? "" : "s"}
              </FranchiseStatusBadge>
            ) : null}
          </>
        }
      />

      <FranchiseSectionTabs />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FranchiseKpiCard
          label="Audit events"
          value={events.length}
          hint={activeFilters > 0 ? "binnen filters" : "laatste activiteiten"}
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
        title="Auditfilters"
        description="Filter op nieuwe franchise-acties, tenant, target en periode."
      >
        <form className="grid gap-3 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end">
          <label className="grid gap-1.5 text-xs font-black text-muted-foreground">
            Categorie
            <Select name="category" defaultValue={filters.category ?? ""}>
              <option value="">Alle categorieen</option>
              {FRANCHISE_AUDIT_CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1.5 text-xs font-black text-muted-foreground">
            Actie
            <Select name="action" defaultValue={filters.action ?? ""}>
              <option value="">Alle acties</option>
              {FRANCHISE_AUDIT_ACTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1.5 text-xs font-black text-muted-foreground">
            Tenant
            <Select name="tenant" defaultValue={filters.tenantId ?? ""}>
              <option value="">Franchisegever + franchisees</option>
              {tenantOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1.5 text-xs font-black text-muted-foreground">
            Targettype
            <Select name="target_type" defaultValue={filters.targetType ?? ""}>
              <option value="">Alle targets</option>
              <option value="tenant">Tenant</option>
              <option value="franchise_template">Franchise template</option>
              <option value="package">Pakket</option>
              <option value="franchise_operations_permission">Delegatie</option>
              <option value="franchise_lead_assignment">Lead assignment</option>
              <option value="lead">Lead</option>
              <option value="franchise_benchmark_action">Benchmarkactie</option>
              <option value="franchise_planning_action">Planningactie</option>
            </Select>
          </label>
          <div className="flex gap-2">
            <Button type="submit" className="h-10 px-4">
              <Filter className="h-4 w-4" aria-hidden />
              Filter
            </Button>
            {activeFilters > 0 ? (
              <Link
                href="/backoffice/franchise/audit"
                className={buttonVariants({ variant: "outline", className: "h-10 px-4" })}
              >
                Reset
              </Link>
            ) : null}
          </div>
          <label className="grid gap-1.5 text-xs font-black text-muted-foreground lg:col-span-2">
            Target-id bevat
            <Input
              name="target_id"
              placeholder="UUID of fragment"
              defaultValue={filters.targetId ?? ""}
            />
          </label>
          <label className="grid gap-1.5 text-xs font-black text-muted-foreground">
            Vanaf
            <Input name="from" type="date" defaultValue={filters.from ?? ""} />
          </label>
          <label className="grid gap-1.5 text-xs font-black text-muted-foreground">
            Tot en met
            <Input name="to" type="date" defaultValue={filters.to ?? ""} />
          </label>
        </form>
      </FranchisePanel>

      <FranchisePanel
        title="Recente auditlog"
        description={
          activeFilters > 0
            ? "Gesorteerd op meest recent, beperkt door de ingestelde filters."
            : "Gesorteerd op meest recent."
        }
        contentClassName="p-0"
      >
        {events.length === 0 ? (
          <div className="p-4">
            <FranchiseEmptyState
              title={activeFilters > 0 ? "Geen audit events voor deze filters" : "Nog geen audit events"}
              description={
                activeFilters > 0
                  ? "Verbreed de filters om meer franchise- of tenantactiviteiten te zien."
                  : "Zodra branding, template, leerling of franchise-acties worden gelogd verschijnen ze hier."
              }
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
                  <p className="font-black text-foreground">{event.action_label}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <FranchiseStatusBadge tone={event.category === "other" ? "readonly" : "info"}>
                      {franchiseAuditCategoryLabel(event.category)}
                    </FranchiseStatusBadge>
                    <span className="text-xs text-muted-foreground">{event.action}</span>
                  </div>
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
                  <p className="max-w-[14rem] truncate font-black text-foreground">
                    {event.tenant_name ?? "Onbekende tenant"}
                  </p>
                  <p className="max-w-[14rem] truncate text-xs text-muted-foreground">
                    {event.tenant_id ?? "-"}
                  </p>
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
