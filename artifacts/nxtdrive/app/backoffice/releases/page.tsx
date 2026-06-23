import { Rocket, Send, Sparkles } from "lucide-react";
import {
  AdminGrid,
  AdminMetricStrip,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from "@/components/backoffice/admin-primitives";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { loadReleaseCenter, PRODUCT_OPS_ROLES } from "@/lib/product-ops";
import {
  acknowledgeRelease,
  createRelease,
  promoteReleaseToProduction,
} from "./actions";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  staging: "Staging",
  production: "Production",
  archived: "Archief",
};

const TYPE_LABELS: Record<string, string> = {
  feature: "Feature",
  improvement: "Verbetering",
  fix: "Fix",
  security: "Security",
  known_issue: "Bekend punt",
};

export default async function ReleasesPage() {
  const { user, tenant } = await requireActiveTenant(PRODUCT_OPS_ROLES);
  const isPlatformAdmin = user.profile?.is_platform_admin === true;
  const { releases } = await loadReleaseCenter(tenant, isPlatformAdmin);
  const production = releases.filter(
    (release) => release.status === "production",
  );
  const staging = releases.filter((release) => release.status === "staging");
  const unread = releases.filter((release) => !release.acknowledged).length;

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Releasebeheer"
        title="Wat is nieuw in NXTDRIVE"
        description="Overzicht van staging- en productie-releases. Platform admin kan een staging release na merge met productie direct publiceren."
      />

      <AdminMetricStrip
        items={[
          {
            label: "Productie",
            value: production.length,
            hint: "Beschikbaar voor klanten",
          },
          {
            label: "Staging",
            value: staging.length,
            hint: "Klaar voor production merge",
          },
          {
            label: "Nog niet gelezen",
            value: unread,
            hint: "Door deze tenant",
          },
          {
            label: "Totaal zichtbaar",
            value: releases.length,
            hint: "Release-items",
          },
        ]}
      />

      {isPlatformAdmin ? (
        <AdminPanel
          title="Nieuwe release"
          description="Eenvoudige registratie voor staging of productie."
        >
          <form
            action={createRelease}
            className="grid gap-3 lg:grid-cols-[180px_1fr_1fr_140px_auto]"
          >
            <div className="space-y-1.5">
              <Label htmlFor="release-version">Versie</Label>
              <Input
                id="release-version"
                name="version"
                placeholder="2026.06.23"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="release-title">Titel</Label>
              <Input
                id="release-title"
                name="title"
                placeholder="Release titel"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="release-summary">Samenvatting</Label>
              <Input
                id="release-summary"
                name="summary"
                placeholder="Korte klanttekst"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="release-status">Status</Label>
              <Select id="release-status" name="status" defaultValue="staging">
                <option value="draft">Draft</option>
                <option value="staging">Staging</option>
                <option value="production">Production</option>
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full">
                <Send className="mr-2 h-4 w-4" aria-hidden />
                Opslaan
              </Button>
            </div>
          </form>
        </AdminPanel>
      ) : null}

      <AdminGrid columns="2" className="items-start">
        {releases.length === 0 ? (
          <AdminPanel
            title="Nog geen releases"
            description="Er is nog niets gepubliceerd."
          >
            <div className="rounded-2xl border border-dashed border-border bg-[var(--surface-2)] p-8 text-center">
              <Rocket className="mx-auto h-8 w-8 text-primary" aria-hidden />
              <p className="mt-3 font-semibold text-foreground">
                Releasebeheer is klaar voor gebruik
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Zodra staging of productie-notities worden aangemaakt,
                verschijnen ze hier.
              </p>
            </div>
          </AdminPanel>
        ) : (
          releases.map((release) => (
            <AdminPanel
              key={release.id}
              title={`${release.version} - ${release.title}`}
              description={release.summary}
              contentClassName="space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                    {STATUS_LABELS[release.status]}
                  </span>
                  <span className="rounded-full border border-border px-3 py-1 text-xs font-bold text-muted-foreground">
                    {release.audience}
                  </span>
                  {release.acknowledged ? (
                    <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-bold text-success">
                      Gelezen
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {!release.acknowledged ? (
                    <form action={acknowledgeRelease}>
                      <input
                        type="hidden"
                        name="release_id"
                        value={release.id}
                      />
                      <Button type="submit" variant="outline" size="sm">
                        Markeer gelezen
                      </Button>
                    </form>
                  ) : null}
                  {isPlatformAdmin && release.status === "staging" ? (
                    <form action={promoteReleaseToProduction}>
                      <input
                        type="hidden"
                        name="release_id"
                        value={release.id}
                      />
                      <Button type="submit" size="sm">
                        Naar production
                      </Button>
                    </form>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                {(release.product_release_items ?? []).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-border bg-[var(--surface-2)] p-3"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" aria-hidden />
                      <p className="font-bold text-foreground">{item.title}</p>
                      <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                        {TYPE_LABELS[item.item_type] ?? item.item_type}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-border bg-[var(--surface-2)] p-3 text-xs text-muted-foreground">
                Staging merge:{" "}
                {release.staging_merged_at
                  ? new Intl.DateTimeFormat("nl-NL", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(release.staging_merged_at))
                  : "Nog niet gemarkeerd"}
                <br />
                Productie:{" "}
                {release.production_released_at
                  ? new Intl.DateTimeFormat("nl-NL", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(release.production_released_at))
                  : "Nog niet gepubliceerd"}
              </div>
            </AdminPanel>
          ))
        )}
      </AdminGrid>
    </AdminPage>
  );
}
