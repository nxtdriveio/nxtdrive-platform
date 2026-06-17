import Link from "next/link";
import { BookOpenCheck, Network, Package, ShieldCheck } from "lucide-react";
import { FranchiseDowngradeAlert } from "@/components/backoffice/franchise-downgrade-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requireFranchiseOperator } from "@/lib/franchise/access";
import {
  createFranchiseTemplate,
  pushTemplateToFranchisee,
  updateFranchiseTemplate,
} from "@/lib/franchise/actions";
import { loadFranchiseTemplates } from "@/lib/franchise/templates";
import { PLAN_LABELS } from "@/lib/platform/features";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { formatTegoed } from "@/lib/students/types";

export const dynamic = "force-dynamic";

const euroFmt = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

function formatEuroCents(cents: number): string {
  return euroFmt.format(cents / 100);
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

  const { data: franchisees } = await service
    .from("tenants")
    .select("id, name, slug")
    .eq("parent_tenant_id", tenant.id)
    .order("name");

  const templates = await loadFranchiseTemplates(tenant.id);

  const activeTemplates = templates.filter((template) => template.is_active);
  const activatedFranchiseeIds = new Set(
    activeTemplates.flatMap((template) =>
      template.activations.map((activation) => activation.franchisee_tenant_id),
    ),
  );

  const hasError = !!sp.error;
  const errorMsg = hasError ? decodeURIComponent(sp.error ?? "") : null;
  const controlsDisabled = readOnlyDowngrade;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Franchise Templates</h1>
          <p className="text-sm text-muted-foreground">
            Beheer pakketsjablonen en stuur ze door naar franchisees
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="primary">{activeTemplates.length} actief</Badge>
            <Badge variant="outline">
              {activatedFranchiseeIds.size} franchisees geactiveerd
            </Badge>
            <Badge variant="outline">Read-only distributie, lokale activatie</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/backoffice/franchise/playbook">
            <Button variant="outline" size="sm">
              Playbook
            </Button>
          </Link>
          <Link href="/backoffice/franchise/aandacht">
            <Button variant="outline" size="sm">
              Aandacht
            </Button>
          </Link>
          <Link href="/backoffice/franchise">
            <Button variant="outline" size="sm">
              Terug naar dashboard
            </Button>
          </Link>
        </div>
      </div>

      {readOnlyDowngrade ? (
        <FranchiseDowngradeAlert
          planLabel={PLAN_LABELS[franchiseAccess.requiredPlan]}
        />
      ) : null}

      {sp.created ? (
        <div className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          Template aangemaakt.
        </div>
      ) : null}
      {sp.saved ? (
        <div className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          Template opgeslagen.
        </div>
      ) : null}
      {sp.pushed ? (
        <div className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          Template doorgestuurd naar franchisee.
        </div>
      ) : null}
      {hasError && errorMsg ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {errorMsg}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Actieve templates</CardTitle>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                {activeTemplates.length}
              </p>
            </div>
            <span className="rounded-full bg-primary-soft p-2 text-primary">
              <Package className="h-5 w-5" aria-hidden />
            </span>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Standaardpakketten die nu franchisebreed uit te rollen zijn.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Adoptie</CardTitle>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                {activatedFranchiseeIds.size}/{franchisees?.length ?? 0}
              </p>
            </div>
            <span className="rounded-full bg-primary-soft p-2 text-primary">
              <Network className="h-5 w-5" aria-hidden />
            </span>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Hoeveel franchisees al minimaal een actief sjabloon ontvangen hebben.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Playbook route</CardTitle>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                Governance
              </p>
            </div>
            <span className="rounded-full bg-primary-soft p-2 text-primary">
              <BookOpenCheck className="h-5 w-5" aria-hidden />
            </span>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Gebruik de playbook-pagina om template-adoptie te combineren met aandacht en planning.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Governance</CardTitle>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                {readOnlyDowngrade ? "Afschaalmodus" : "Read-only"}
              </p>
            </div>
            <span className="rounded-full bg-primary-soft p-2 text-primary">
              <ShieldCheck className="h-5 w-5" aria-hidden />
            </span>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Doorsturen maakt sjablonen zichtbaar voor franchisees; lokale activatie blijft hun eigen actie.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground">
            Bestaande templates ({templates.length})
          </h2>
          {templates.length === 0 ? (
            <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border text-center">
              <p className="text-sm text-muted-foreground">
                Nog geen templates. Maak er een aan.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map((template) => {
                const credits = template.config.credits_total ?? 0;
                const priceCents = template.config.price_cents ?? 0;
                const validDays = template.config.valid_days;
                const activationCount = template.activations.length;

                return (
                  <Card
                    key={template.id}
                    className={!template.is_active ? "opacity-60" : undefined}
                  >
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-medium text-foreground">
                              {template.name}
                            </p>
                            <Badge
                              variant={template.is_active ? "primary" : "outline"}
                              className="shrink-0 text-xs"
                            >
                              {template.is_active ? "Actief" : "Inactief"}
                            </Badge>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {formatTegoed(credits)} · {formatEuroCents(priceCents)} excl. BTW
                            {validDays ? ` · ${validDays} dagen geldig` : ""}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground/70">
                            {activationCount} franchisee
                            {activationCount !== 1 ? "s" : ""} geactiveerd
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-col gap-1.5">
                          <form action={updateFranchiseTemplate}>
                            <input type="hidden" name="template_id" value={template.id} />
                            <input
                              type="hidden"
                              name="is_active"
                              value={template.is_active ? "false" : "true"}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              type="submit"
                              className="h-7 text-xs"
                              disabled={controlsDisabled}
                            >
                              {template.is_active ? "Deactiveer" : "Activeer"}
                            </Button>
                          </form>
                        </div>
                      </div>

                      {template.is_active && (franchisees?.length ?? 0) > 0 ? (
                        <form
                          action={pushTemplateToFranchisee}
                          className="mt-3 flex gap-2"
                        >
                          <input type="hidden" name="template_id" value={template.id} />
                          <select
                            name="franchisee_tenant_id"
                            className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            required
                            disabled={controlsDisabled}
                          >
                            <option value="">Kies franchisee...</option>
                            {(franchisees ?? []).map((franchisee) => {
                              const alreadyActivated = template.activations.some(
                                (activation) =>
                                  activation.franchisee_tenant_id === franchisee.id,
                              );
                              return (
                                <option
                                  key={franchisee.id}
                                  value={franchisee.id}
                                  disabled={alreadyActivated}
                                >
                                  {franchisee.name}
                                  {alreadyActivated ? " (al actief)" : ""}
                                </option>
                              );
                            })}
                          </select>
                          <Button
                            size="sm"
                            variant="outline"
                            type="submit"
                            className="h-7 shrink-0 text-xs"
                            disabled={controlsDisabled}
                          >
                            Doorsturen
                          </Button>
                        </form>
                      ) : null}

                      {(franchisees?.length ?? 0) === 0 && template.is_active ? (
                        <p className="mt-2 text-xs text-muted-foreground/60">
                          Koppel eerst franchisees via het admin-paneel om sjablonen door te sturen.
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nieuw pakket-sjabloon</CardTitle>
          </CardHeader>
          <CardContent>
            {controlsDisabled ? (
              <p className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                Nieuwe sjablonen en distributie zijn tijdelijk read-only totdat dit
                netwerk weer het vereiste{" "}
                {PLAN_LABELS[franchiseAccess.requiredPlan]}-abonnement heeft.
              </p>
            ) : null}

            <form action={createFranchiseTemplate} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">
                  Naam <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="bijv. Standaardpakket Franchise"
                  required
                  disabled={controlsDisabled}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="credits_total">
                    Lesuren (minuten) <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    id="credits_total"
                    name="credits_total"
                    type="number"
                    min="1"
                    placeholder="1800"
                    required
                    disabled={controlsDisabled}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Bijv. 1800 = 30 uur
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="price_excl_vat_euros">Prijs excl. BTW (EUR)</Label>
                  <Input
                    id="price_excl_vat_euros"
                    name="price_excl_vat_euros"
                    type="text"
                    placeholder="1500,00"
                    disabled={controlsDisabled}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="valid_days">Geldigheid (dagen)</Label>
                <Input
                  id="valid_days"
                  name="valid_days"
                  type="number"
                  min="1"
                  placeholder="365 (leeg = onbeperkt)"
                  disabled={controlsDisabled}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Omschrijving</Label>
                <Textarea
                  id="description"
                  name="description"
                  rows={2}
                  placeholder="Optionele beschrijving voor dit sjabloon"
                  disabled={controlsDisabled}
                />
              </div>

              <Button type="submit" className="w-full" disabled={controlsDisabled}>
                Sjabloon aanmaken
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
