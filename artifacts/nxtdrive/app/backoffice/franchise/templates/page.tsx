import { BookOpenCheck, Package, Send, ShieldCheck, Sparkles } from "lucide-react";

import { FranchiseDowngradeAlert } from "@/components/backoffice/franchise-downgrade-alert";
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
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  applyFranchiseTemplateToFranchisee,
  createFranchiseTemplate,
  pushTemplateToFranchisee,
  updateFranchiseTemplate,
} from "@/lib/franchise/actions";
import { requireFranchiseOperator } from "@/lib/franchise/access";
import { loadFranchiseDelegations } from "@/lib/franchise/steering";
import { loadFranchiseTemplates } from "@/lib/franchise/templates";
import { PLAN_LABELS } from "@/lib/platform/features";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { formatTegoed } from "@/lib/students/types";

export const dynamic = "force-dynamic";

const euroFormatter = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

function formatEuroCents(cents: number): string {
  return euroFormatter.format(cents / 100);
}

export default async function FranchiseTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const [sp, { tenant, franchiseAccess, readOnlyDowngrade }] = await Promise.all([
    searchParams,
    requireFranchiseOperator(),
  ]);

  const service = createServiceRoleClient();
  const [{ data: franchisees }, templates, delegations] = await Promise.all([
    service
      .from("tenants")
      .select("id, name, slug")
      .eq("parent_tenant_id", tenant.id)
      .order("name"),
    loadFranchiseTemplates(tenant.id),
    loadFranchiseDelegations(tenant.id),
  ]);

  const activeTemplates = templates.filter((template) => template.is_active);
  const activatedFranchiseeIds = new Set(
    activeTemplates.flatMap((template) =>
      template.activations.map((activation) => activation.franchisee_tenant_id),
    ),
  );
  const errorMsg = sp.error ? decodeURIComponent(sp.error) : null;
  const controlsDisabled = readOnlyDowngrade;
  const delegationByTenant = new Map(
    delegations.map((delegation) => [
      delegation.franchisee_tenant_id,
      delegation,
    ]),
  );

  return (
    <FranchisePage>
      <FranchisePageHeader
        eyebrow="Templates & playbook"
        title="Templates"
        description="Beheer franchisebrede pakketsjablonen. Distributie maakt templates zichtbaar; toepassen maakt een echt pakket aan wanneer template-delegatie actief is."
        badges={
          <>
            <FranchiseModeBadge />
            <FranchiseStatusBadge tone="success">{activeTemplates.length} actief</FranchiseStatusBadge>
            <FranchiseStatusBadge tone="readonly">Lokale activatie</FranchiseStatusBadge>
          </>
        }
        actions={
          <>
            <FranchiseActionLink href="/backoffice/franchise/playbook">
              Playbook
            </FranchiseActionLink>
            <FranchiseActionLink href="/backoffice/franchise/governance" variant="primary">
              Governance
            </FranchiseActionLink>
          </>
        }
      />

      <FranchiseSectionTabs />

      {readOnlyDowngrade ? (
        <FranchiseDowngradeAlert
          planLabel={PLAN_LABELS[franchiseAccess.requiredPlan]}
        />
      ) : null}

      {errorMsg ? (
        <div className="rounded-2xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm font-bold text-danger">
          {errorMsg}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FranchiseKpiCard
          label="Templates"
          value={templates.length}
          hint="totaal"
          icon={Package}
          tone="primary"
        />
        <FranchiseKpiCard
          label="Actief"
          value={activeTemplates.length}
          hint="beschikbaar voor distributie"
          icon={BookOpenCheck}
          tone="success"
        />
        <FranchiseKpiCard
          label="Activatie"
          value={`${activatedFranchiseeIds.size}/${franchisees?.length ?? 0}`}
          hint="franchisees"
          icon={Send}
          tone="delegated"
        />
        <FranchiseKpiCard
          label="Model"
          value="Gestuurd"
          hint="met template-delegatie"
          icon={ShieldCheck}
          tone="delegated"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.45fr]">
        <FranchisePanel
          title="Template catalogus"
          description="Actieve en concept-templates met distributiestatus."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {templates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-brand-border bg-brand-muted p-6 text-sm text-muted-foreground lg:col-span-2">
                Nog geen templates. Maak rechts een eerste franchise-template aan.
              </div>
            ) : (
              templates.map((template) => {
                const activationCount = template.activations.length;
                const appliedCount = template.activations.filter(
                  (activation) => activation.resulting_package_id,
                ).length;
                const credits = template.config.credits_total ?? 0;
                const price = template.config.price_cents ?? 0;
                const validDays = template.config.valid_days ?? null;

                return (
                  <article
                    key={template.id}
                    className="rounded-2xl border border-brand-card-border bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-base font-black text-foreground">
                          {template.name}
                        </h2>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {template.config.description ?? "Geen beschrijving ingesteld."}
                        </p>
                      </div>
                      <FranchiseStatusBadge tone={template.is_active ? "success" : "readonly"}>
                        {template.is_active ? "Actief" : "Concept"}
                      </FranchiseStatusBadge>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                      <div className="rounded-xl bg-brand-muted px-3 py-2">
                        <p className="text-xs font-bold text-muted-foreground">Tegoed</p>
                        <p className="font-black text-foreground">{formatTegoed(credits)}</p>
                      </div>
                      <div className="rounded-xl bg-brand-muted px-3 py-2">
                        <p className="text-xs font-bold text-muted-foreground">Prijs</p>
                        <p className="font-black text-foreground">{formatEuroCents(price)}</p>
                      </div>
                      <div className="rounded-xl bg-brand-muted px-3 py-2">
                        <p className="text-xs font-bold text-muted-foreground">Geldig</p>
                        <p className="font-black text-foreground">
                          {validDays ? `${validDays} dgn` : "Onbeperkt"}
                        </p>
                      </div>
                    </div>

                    <form action={updateFranchiseTemplate} className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-brand-card-border bg-brand-muted px-3 py-3">
                      <input type="hidden" name="template_id" value={template.id} />
                      <input
                        type="hidden"
                        name="is_active"
                        value={template.is_active ? "false" : "true"}
                      />
                      <div>
                        <p className="text-sm font-black text-foreground">
                          {activationCount} distributies, {appliedCount} toegepast
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Activeren/deactiveren beinvloedt nieuwe distributie.
                        </p>
                      </div>
                      <Button type="submit" size="sm" variant="outline" disabled={controlsDisabled}>
                        {template.is_active ? "Deactiveren" : "Activeren"}
                      </Button>
                    </form>

                    {template.is_active && (franchisees?.length ?? 0) > 0 ? (
                      <form action={pushTemplateToFranchisee} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                        <input type="hidden" name="template_id" value={template.id} />
                        <select
                          name="franchisee_tenant_id"
                          className="h-10 rounded-xl border border-brand-border bg-white px-3 text-sm text-foreground"
                          disabled={controlsDisabled}
                          required
                        >
                          <option value="">Kies franchisee...</option>
                          {(franchisees ?? []).map((franchisee) => (
                            <option key={franchisee.id} value={franchisee.id}>
                              {franchisee.name}
                            </option>
                          ))}
                        </select>
                        <Button type="submit" size="sm" disabled={controlsDisabled}>
                          Distribueren
                        </Button>
                      </form>
                    ) : null}

                    {template.is_active && (franchisees?.length ?? 0) > 0 ? (
                      <form action={applyFranchiseTemplateToFranchisee} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                        <input
                          type="hidden"
                          name="return_to"
                          value="/backoffice/franchise/templates"
                        />
                        <input type="hidden" name="template_id" value={template.id} />
                        <select
                          name="franchisee_tenant_id"
                          className="h-10 rounded-xl border border-brand-border bg-white px-3 text-sm text-foreground"
                          disabled={controlsDisabled}
                          required
                        >
                          <option value="">Toepassen bij...</option>
                          {(franchisees ?? []).map((franchisee) => {
                            const delegation = delegationByTenant.get(franchisee.id);
                            const allowed = Boolean(delegation?.can_manage_templates);
                            return (
                              <option
                                key={franchisee.id}
                                value={franchisee.id}
                                disabled={!allowed}
                              >
                                {franchisee.name}
                                {allowed ? "" : " - template-delegatie nodig"}
                              </option>
                            );
                          })}
                        </select>
                        <Button type="submit" size="sm" disabled={controlsDisabled}>
                          Toepassen
                        </Button>
                      </form>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
        </FranchisePanel>

        <div className="space-y-4">
          <FranchisePanel title="Nieuw template" description="Franchisebreed sjabloon.">
            <form action={createFranchiseTemplate} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Naam</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="Standaardpakket Franchise"
                  disabled={controlsDisabled}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="credits_total">Lesminuten</Label>
                  <Input
                    id="credits_total"
                    name="credits_total"
                    type="number"
                    min="0"
                    step="30"
                    defaultValue="2400"
                    disabled={controlsDisabled}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="price_excl_vat_euros">Prijs in euro</Label>
                  <Input
                    id="price_excl_vat_euros"
                    name="price_excl_vat_euros"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue="2450"
                    disabled={controlsDisabled}
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="valid_days">Geldigheid in dagen</Label>
                <Input
                  id="valid_days"
                  name="valid_days"
                  type="number"
                  min="0"
                  placeholder="Laat leeg voor onbeperkt"
                  disabled={controlsDisabled}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Beschrijving</Label>
                <Textarea
                  id="description"
                  name="description"
                  rows={3}
                  placeholder="Voor standaard rijopleiding binnen franchiseformule."
                  disabled={controlsDisabled}
                />
              </div>
              <Button type="submit" className="w-full" disabled={controlsDisabled}>
                Template aanmaken
              </Button>
            </form>
          </FranchisePanel>

          <FranchisePanel title="Playbook regels" description="Veilige template-uitrol.">
            <div className="space-y-3 text-sm text-muted-foreground">
              {[
                "Templates blijven eigendom van de franchisegever.",
                "Distributie maakt een template zichtbaar voor franchisee.",
                "Toepassen maakt centraal een pakket aan wanneer template-delegatie actief is.",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-xl border border-brand-card-border bg-white px-3 py-3">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </FranchisePanel>
        </div>
      </section>
    </FranchisePage>
  );
}
