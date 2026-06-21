import { CalendarClock, Handshake, LockKeyhole, ShieldCheck } from "lucide-react";

import {
  FranchiseActionLink,
  FranchiseEmptyState,
  FranchiseKpiCard,
  FranchiseModeBadge,
  FranchisePage,
  FranchisePageHeader,
  FranchisePanel,
  FranchiseSectionTabs,
  FranchiseStatusBadge,
} from "@/components/backoffice/franchise/franchise-primitives";
import { Button } from "@/components/ui/button";
import {
  revokeFranchiseDelegation,
  upsertFranchiseDelegation,
} from "@/lib/franchise/actions";
import { requireFranchiseOperator } from "@/lib/franchise/access";
import {
  loadFranchiseDelegations,
  type FranchiseDelegationState,
} from "@/lib/franchise/steering";

export const dynamic = "force-dynamic";

const PERMISSIONS = [
  ["can_manage_planning", "Planning beheren"],
  ["can_manage_leads", "Lead routing"],
  ["can_manage_templates", "Templates toepassen"],
  ["can_manage_fleet", "Voertuigen beheren"],
  ["can_manage_instructor_availability", "Beschikbaarheid beheren"],
] as const;

const SCOPE_OPTIONS = [
  ["tenant", "Hele franchisee"],
  ["branches", "Specifieke vestigingen"],
  ["rayons", "Specifieke rayons"],
  ["capabilities", "Specifieke capabilities"],
  ["custom", "Custom scope"],
] as const;

function statusLabel(status: FranchiseDelegationState["status"]) {
  if (status === "active") return "Actief";
  if (status === "scheduled") return "Ingepland";
  if (status === "expired") return "Verlopen";
  if (status === "revoked") return "Ingetrokken";
  return "Read-only";
}

function statusTone(status: FranchiseDelegationState["status"]) {
  if (status === "active") return "delegated";
  if (status === "scheduled") return "info";
  if (status === "expired" || status === "revoked") return "warning";
  return "readonly";
}

function dateInputValue(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function displayDate(value: string | null) {
  if (!value) return "Geen einddatum";
  return new Date(value).toLocaleDateString("nl-NL");
}

function PermissionCheckbox({
  name,
  label,
  defaultChecked,
  disabled,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-brand-card-border bg-white px-3 py-2 text-sm font-bold text-foreground">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="h-4 w-4 rounded border-brand-border text-primary"
      />
      {label}
    </label>
  );
}

function DelegationBadges({ delegation }: { delegation: FranchiseDelegationState }) {
  if (!delegation.is_active) {
    return (
      <FranchiseStatusBadge tone={statusTone(delegation.status)}>
        {statusLabel(delegation.status)}
      </FranchiseStatusBadge>
    );
  }
  const activeLabels = PERMISSIONS.filter(([key]) => delegation[key]).map(([, label]) => label);
  if (activeLabels.length === 0) {
    return <FranchiseStatusBadge tone="readonly">Read-only</FranchiseStatusBadge>;
  }
  return (
    <>
      {activeLabels.slice(0, 3).map((label) => (
        <FranchiseStatusBadge key={label} tone="delegated">
          {label}
        </FranchiseStatusBadge>
      ))}
      {activeLabels.length > 3 ? (
        <FranchiseStatusBadge tone="info">+{activeLabels.length - 3}</FranchiseStatusBadge>
      ) : null}
    </>
  );
}

function DelegationGovernanceSummary({
  delegation,
}: {
  delegation: FranchiseDelegationState;
}) {
  return (
    <dl className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
      <div className="rounded-xl border border-brand-card-border bg-white px-3 py-2">
        <dt className="font-black uppercase tracking-[0.12em]">Scope</dt>
        <dd className="mt-1 font-bold text-foreground">
          {SCOPE_OPTIONS.find(([key]) => key === delegation.scope_type)?.[1] ?? "Custom"}
        </dd>
      </div>
      <div className="rounded-xl border border-brand-card-border bg-white px-3 py-2">
        <dt className="font-black uppercase tracking-[0.12em]">Geldig tot</dt>
        <dd className="mt-1 font-bold text-foreground">
          {displayDate(delegation.valid_until)}
        </dd>
      </div>
      <div className="rounded-xl border border-brand-card-border bg-white px-3 py-2">
        <dt className="font-black uppercase tracking-[0.12em]">Reden</dt>
        <dd className="mt-1 line-clamp-2 font-bold text-foreground">
          {delegation.revoked_at
            ? delegation.revoke_reason ?? "Geen reden vastgelegd"
            : delegation.grant_reason ?? "Geen reden vastgelegd"}
        </dd>
      </div>
    </dl>
  );
}

function DelegationGovernanceFields({
  delegation,
  controlsDisabled,
}: {
  delegation?: FranchiseDelegationState;
  controlsDisabled: boolean;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <label className="block space-y-1.5">
        <span className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
          Scope
        </span>
        <select
          name="scope_type"
          defaultValue={delegation?.scope_type ?? "tenant"}
          disabled={controlsDisabled}
          className="h-11 w-full rounded-xl border border-brand-border bg-white px-3 text-sm font-bold text-foreground"
        >
          {SCOPE_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
          Scope referenties
        </span>
        <input
          name="scope_refs"
          defaultValue={delegation?.scope_refs.join(", ") ?? ""}
          disabled={controlsDisabled}
          placeholder="Optioneel: vestiging-, rayon- of capability-id's"
          className="h-11 w-full rounded-xl border border-brand-border bg-white px-3 text-sm font-bold text-foreground"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
          Geldig vanaf
        </span>
        <input
          type="date"
          name="valid_from"
          defaultValue={dateInputValue(delegation?.valid_from ?? null)}
          disabled={controlsDisabled}
          className="h-11 w-full rounded-xl border border-brand-border bg-white px-3 text-sm font-bold text-foreground"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
          Geldig tot
        </span>
        <input
          type="date"
          name="valid_until"
          defaultValue={dateInputValue(delegation?.valid_until ?? null)}
          disabled={controlsDisabled}
          className="h-11 w-full rounded-xl border border-brand-border bg-white px-3 text-sm font-bold text-foreground"
        />
      </label>
      <label className="block space-y-1.5 lg:col-span-2">
        <span className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
          Reden voor delegatie
        </span>
        <textarea
          name="grant_reason"
          required
          defaultValue={delegation?.grant_reason ?? ""}
          disabled={controlsDisabled}
          placeholder="Bijvoorbeeld: centrale leadrouting tijdelijk toegestaan voor vestiging Noord."
          className="min-h-20 w-full rounded-xl border border-brand-border bg-white px-3 py-2 text-sm font-bold text-foreground"
        />
      </label>
    </div>
  );
}

export default async function FranchiseDelegationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const [sp, { tenant, readOnlyDowngrade }] = await Promise.all([
    searchParams,
    requireFranchiseOperator(),
  ]);
  const delegations = await loadFranchiseDelegations(tenant.id);
  const activeDelegations = delegations.filter((delegation) => delegation.is_active);
  const leadDelegations = delegations.filter((delegation) => delegation.can_manage_leads);
  const templateDelegations = delegations.filter(
    (delegation) => delegation.can_manage_templates,
  );
  const errorMsg = sp.error ? decodeURIComponent(sp.error) : null;
  const controlsDisabled = readOnlyDowngrade;

  return (
    <FranchisePage>
      <FranchisePageHeader
        eyebrow="Delegatie & governance"
        title="Delegaties"
        description="Zet expliciet vast waar de franchisegever mag sturen. Lead routing, template-toepassing en lokale operationele acties lopen via deze rechten en blijven auditbaar."
        badges={
          <>
            <FranchiseModeBadge mode={activeDelegations.length > 0 ? "delegated" : "readonly"} />
            <FranchiseStatusBadge tone={readOnlyDowngrade ? "warning" : "success"}>
              {readOnlyDowngrade ? "Read-only downgrade" : "Sturing actief"}
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

      {errorMsg ? (
        <div className="rounded-2xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm font-bold text-danger">
          {errorMsg}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FranchiseKpiCard
          label="Actieve delegaties"
          value={activeDelegations.length}
          hint={`${delegations.length} franchisees`}
          icon={Handshake}
          tone={activeDelegations.length > 0 ? "delegated" : "readonly"}
        />
        <FranchiseKpiCard
          label="Lead routing"
          value={leadDelegations.length}
          hint="franchisees met leadrechten"
          icon={ShieldCheck}
          tone={leadDelegations.length > 0 ? "success" : "readonly"}
        />
        <FranchiseKpiCard
          label="Templates"
          value={templateDelegations.length}
          hint="centraal toepassen toegestaan"
          icon={CalendarClock}
          tone={templateDelegations.length > 0 ? "success" : "warning"}
        />
        <FranchiseKpiCard
          label="Default"
          value="Governed"
          hint="scope, reden en audit"
          icon={LockKeyhole}
          tone="readonly"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.55fr]">
        <FranchisePanel title="Delegaties per franchisee" description="Rechten worden direct opgeslagen in franchise_operations_permissions.">
          <div className="space-y-3">
            {delegations.length === 0 ? (
              <FranchiseEmptyState
                icon={Handshake}
                title="Geen franchisees gekoppeld"
                description="Koppel eerst franchisee-tenants voordat je delegaties kunt instellen."
              />
            ) : (
              delegations.map((delegation) => (
                <article
                  key={delegation.franchisee_tenant_id}
                  className="rounded-2xl border border-brand-card-border bg-brand-muted p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="text-base font-black text-foreground">
                        {delegation.franchisee_name}
                      </h2>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <DelegationBadges delegation={delegation} />
                      </div>
                    </div>
                    {delegation.updated_at ? (
                      <p className="text-xs font-bold text-muted-foreground">
                        Bijgewerkt {new Date(delegation.updated_at).toLocaleDateString("nl-NL")}
                      </p>
                    ) : null}
                  </div>
                  <DelegationGovernanceSummary delegation={delegation} />

                  <form action={upsertFranchiseDelegation} className="mt-4 space-y-3">
                    <input
                      type="hidden"
                      name="return_to"
                      value="/backoffice/franchise/delegaties"
                    />
                    <input
                      type="hidden"
                      name="franchisee_tenant_id"
                      value={delegation.franchisee_tenant_id}
                    />
                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {PERMISSIONS.map(([key, label]) => (
                        <PermissionCheckbox
                          key={key}
                          name={key}
                          label={label}
                          defaultChecked={delegation[key]}
                          disabled={controlsDisabled}
                        />
                      ))}
                    </div>
                    <DelegationGovernanceFields
                      delegation={delegation}
                      controlsDisabled={controlsDisabled}
                    />
                    {delegation.permission_id ? (
                      <label className="block space-y-1.5">
                        <span className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">
                          Reden bij intrekken
                        </span>
                        <input
                          name="revoke_reason"
                          disabled={controlsDisabled}
                          placeholder="Verplicht wanneer je deze delegatie intrekt."
                          className="h-11 w-full rounded-xl border border-brand-border bg-white px-3 text-sm font-bold text-foreground"
                        />
                      </label>
                    ) : null}
                    <div className="flex flex-wrap justify-end gap-2">
                      {delegation.permission_id ? (
                        <Button
                          formAction={revokeFranchiseDelegation}
                          variant="outline"
                          type="submit"
                          disabled={controlsDisabled}
                        >
                          Intrekken
                        </Button>
                      ) : null}
                      <Button type="submit" disabled={controlsDisabled}>
                        Delegatie opslaan
                      </Button>
                    </div>
                  </form>
                </article>
              ))
            )}
          </div>
        </FranchisePanel>

        <FranchisePanel title="Nieuwe stuurroute" description="Kies een franchisee en geef alleen de noodzakelijke rechten.">
          <form action={upsertFranchiseDelegation} className="space-y-4">
            <input
              type="hidden"
              name="return_to"
              value="/backoffice/franchise/delegaties"
            />
            <label className="block space-y-1.5">
              <span className="text-sm font-black text-foreground">Franchisee</span>
              <select
                name="franchisee_tenant_id"
                disabled={controlsDisabled}
                required
                className="h-11 w-full rounded-xl border border-brand-border bg-white px-3 text-sm font-bold text-foreground"
              >
                <option value="">Kies franchisee...</option>
                {delegations.map((delegation) => (
                  <option
                    key={delegation.franchisee_tenant_id}
                    value={delegation.franchisee_tenant_id}
                  >
                    {delegation.franchisee_name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-2">
              {PERMISSIONS.map(([key, label]) => (
                <PermissionCheckbox
                  key={key}
                  name={key}
                  label={label}
                  disabled={controlsDisabled}
                />
              ))}
            </div>
            <DelegationGovernanceFields controlsDisabled={controlsDisabled} />
            <Button type="submit" className="w-full" disabled={controlsDisabled}>
              Delegatie aanmaken
            </Button>
          </form>
        </FranchisePanel>
      </section>
    </FranchisePage>
  );
}
