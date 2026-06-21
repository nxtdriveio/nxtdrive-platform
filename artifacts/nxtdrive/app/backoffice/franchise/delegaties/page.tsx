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
  const activeDelegations = delegations.filter((delegation) => delegation.permission_id);
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
          value="Read-only"
          hint="totdat delegatie bestaat"
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
            <Button type="submit" className="w-full" disabled={controlsDisabled}>
              Delegatie aanmaken
            </Button>
          </form>
        </FranchisePanel>
      </section>
    </FranchisePage>
  );
}
