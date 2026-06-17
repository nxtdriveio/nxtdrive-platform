import type { ComponentType } from "react";
import Link from "next/link";
import {
  BellRing,
  Mail,
  Palette,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getAllPlatformNotificationConfigs } from "@/lib/notifications/platform-notification-config";
import {
  getTenantFeatureAccess,
  loadTenantEntitlementSnapshot,
} from "@/lib/platform/entitlements";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toggleTenantTrigger } from "./actions";

export const dynamic = "force-dynamic";

const CHANNEL_LABEL: Record<string, string> = {
  email: "E-mail",
  inapp: "In-app",
  push: "Push",
};

const CHANNEL_ORDER = ["email", "inapp", "push"];

function SummaryCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <Card className="border-border/80 bg-card/70">
      <CardContent className="flex items-start justify-between gap-3 pt-5">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            {label}
          </p>
          <p className="text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </p>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
        <span className="rounded-full border border-white/10 bg-primary/10 p-2 text-primary">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </CardContent>
    </Card>
  );
}

export default async function TenantNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const [{ tenant }, params] = await Promise.all([
    requireActiveTenant(["tenant_admin"]),
    searchParams,
  ]);

  const service = createServiceRoleClient();
  const entitlementSnapshot = await loadTenantEntitlementSnapshot(
    service,
    tenant.id,
  );
  const whiteLabelGate = getTenantFeatureAccess(
    entitlementSnapshot.tenant,
    "white_label",
    { requireEnabledFlag: true },
  );

  const [platformConfigs, { data: tenantTemplates }] = await Promise.all([
    getAllPlatformNotificationConfigs(service),
    service
      .from("notification_templates")
      .select(
        "key, channel, tenant_enabled, subject, body_html, body_text, push_title, push_body, inapp_title, inapp_body, enabled",
      )
      .eq("tenant_id", tenant.id),
  ]);
  const isWhiteLabel = whiteLabelGate.allowed;

  const savedKey = params.saved ?? null;
  const globallyEnabledConfigs = platformConfigs.filter((c) => c.globallyEnabled);

  const byKey = new Map<string, typeof globallyEnabledConfigs>();
  for (const cfg of globallyEnabledConfigs) {
    if (!byKey.has(cfg.eventKey)) byKey.set(cfg.eventKey, []);
    byKey.get(cfg.eventKey)!.push(cfg);
  }
  const allKeys = Array.from(byKey.keys()).sort();

  function getTenantEnabled(key: string, channel: string): boolean | null {
    const row = (tenantTemplates ?? []).find(
      (template) =>
        (template.key as string) === key &&
        (template.channel as string) === channel,
    );
    const tenantEnabled = row?.tenant_enabled;
    if (tenantEnabled === true) return true;
    if (tenantEnabled === false) return false;
    return null;
  }

  function hasTenantTemplate(key: string, channel: string): boolean {
    const row = (tenantTemplates ?? []).find(
      (template) =>
        (template.key as string) === key &&
        (template.channel as string) === channel,
    );
    return Boolean(
      row?.body_html ||
        row?.subject ||
        row?.body_text ||
        row?.push_title ||
        row?.push_body ||
        row?.inapp_title ||
        row?.inapp_body,
    );
  }

  const totalChannels = globallyEnabledConfigs.length;
  const tenantDisabledCount = globallyEnabledConfigs.reduce((sum, cfg) => {
    return sum + (getTenantEnabled(cfg.eventKey, cfg.channel) === false ? 1 : 0);
  }, 0);
  const templateOverrideCount = (tenantTemplates ?? []).filter((row) =>
    Boolean(
      row.subject ||
        row.body_html ||
        row.body_text ||
        row.push_title ||
        row.push_body ||
        row.inapp_title ||
        row.inapp_body,
    ),
  ).length;
  const emailTriggerCount = globallyEnabledConfigs.filter(
    (cfg) => cfg.channel === "email",
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/90">
            <BellRing className="h-3.5 w-3.5" aria-hidden />
            Communicatiecontrole
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Notificaties</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Schakel triggers aan of uit voor jouw rijschool. Uitgeschakelde
              triggers sturen geen berichten aan leerlingen of medewerkers.
              {isWhiteLabel ? (
                <span>
                  {" "}
                  Als white-label rijschool kun je ook eigen templates instellen
                  per e-mailtrigger.
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <Link
          href="/backoffice/instellingen"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Terug naar instellingen
        </Link>
      </div>

      {savedKey ? (
        <div className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          Instelling opgeslagen voor <strong>{savedKey}</strong>.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Zichtbare triggers"
          value={String(allKeys.length)}
          hint="Globaal actieve events die voor deze tenant zichtbaar zijn."
          icon={BellRing}
        />
        <SummaryCard
          label="Kanaalroutes"
          value={String(totalChannels)}
          hint={`${emailTriggerCount} e-mailroutes plus in-app en push waar beschikbaar.`}
          icon={Mail}
        />
        <SummaryCard
          label="Tenant overrides uit"
          value={String(tenantDisabledCount)}
          hint="Tenant-specifiek uitgeschakelde trigger-kanalen."
          icon={ShieldCheck}
        />
        <SummaryCard
          label="Eigen templates"
          value={String(templateOverrideCount)}
          hint={
            isWhiteLabel
              ? "Eigen white-label templates die afwijken van platformstandaard."
              : "Template overrides komen beschikbaar zodra Elite white-label actief is."
          }
          icon={Palette}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Kanaalgedrag</CardTitle>
            <p className="text-sm text-muted-foreground">
              Hoe de notificatielaag voor deze tenant nu werkt.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-border bg-muted/20 px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
                Platform aan, tenant volgt standaard
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Als een kanaal geen tenant override heeft, volgt het automatisch
                de globale platforminstelling.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Smartphone className="h-4 w-4 text-primary" aria-hidden />
                Tenant-specifiek uit
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Gebruik tenant overrides om kanaalgedrag lokaal af te stemmen
                zonder de platformstandaard voor andere rijscholen te veranderen.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Palette className="h-4 w-4 text-primary" aria-hidden />
                Eigen template
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                White-label tenants kunnen per e-mailtrigger eigen copy
                gebruiken terwijl de triggerlogica gelijk blijft.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Beheerfocus</CardTitle>
            <p className="text-sm text-muted-foreground">
              Waar notificatiebeheer nu de meeste waarde levert.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-border bg-muted/20 px-4 py-4">
              <p className="text-sm font-medium text-foreground">
                Belangrijkste tenantblokkades
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {tenantDisabledCount === 0
                  ? "Er staan geen tenant-specifieke kanaalblokkades actief."
                  : `${tenantDisabledCount} kanaalroutes zijn tenant-specifiek uitgezet en vragen een bewuste keuze.`}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 px-4 py-4">
              <p className="text-sm font-medium text-foreground">
                Templatevolwassenheid
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {isWhiteLabel
                  ? `${templateOverrideCount} eigen template override(s) staan klaar voor branded communicatie.`
                  : "Deze tenant draait nog op de NXTDRIVE-standaardcopy totdat white-label actief is."}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 px-4 py-4">
              <p className="text-sm font-medium text-foreground">
                Aanbevolen route
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Zet eerst kritieke leerling- en betaaltriggers goed, daarna pas
                marketing- of servicecopy. Zo blijft operationele communicatie
                het betrouwbaarst.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3 sm:px-6">
          <h2 className="text-sm font-semibold text-foreground">
            Trigger-instellingen
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Alleen globaal ingeschakelde triggers zijn hier zichtbaar. Platform
            admin beheert de globale aan/uit-schakelaar.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Trigger</th>
                {CHANNEL_ORDER.map((channel) => (
                  <th
                    key={channel}
                    className="px-4 py-3 text-center font-medium"
                  >
                    {CHANNEL_LABEL[channel]}
                  </th>
                ))}
                {isWhiteLabel ? (
                  <th className="px-4 py-3 font-medium">Template</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {allKeys.map((key) => {
                const rows = byKey.get(key) ?? [];
                const firstRow = rows[0];
                return (
                  <tr key={key} className="hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">
                        {firstRow?.labelNl ?? key}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {firstRow?.description ?? key}
                      </div>
                    </td>
                    {CHANNEL_ORDER.map((channel) => {
                      const cfg = rows.find((row) => row.channel === channel);
                      if (!cfg) {
                        return (
                          <td
                            key={channel}
                            className="px-4 py-3 text-center text-muted-foreground"
                          >
                            -
                          </td>
                        );
                      }
                      const tenantEnabled = getTenantEnabled(key, channel);
                      const isOn = tenantEnabled === null ? true : tenantEnabled;
                      return (
                        <td key={channel} className="px-4 py-3 text-center">
                          <div className="flex flex-col items-center gap-2">
                            <form action={toggleTenantTrigger}>
                              <input type="hidden" name="event_key" value={key} />
                              <input
                                type="hidden"
                                name="channel"
                                value={channel}
                              />
                              <input
                                type="hidden"
                                name="enabled"
                                value={isOn ? "false" : "true"}
                              />
                              <button
                                type="submit"
                                title={isOn ? "Uitschakelen" : "Inschakelen"}
                                className={`inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                  isOn
                                    ? "bg-primary"
                                    : "border border-border bg-muted"
                                }`}
                              >
                                <span
                                  className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                                    isOn ? "translate-x-6" : "translate-x-1"
                                  }`}
                                />
                                <span className="sr-only">
                                  {isOn ? "Uitschakelen" : "Inschakelen"}
                                </span>
                              </button>
                            </form>
                            <Badge
                              variant={isOn ? "success" : "outline"}
                              className="text-[10px]"
                            >
                              {tenantEnabled === false
                                ? "Tenant uit"
                                : tenantEnabled === true
                                  ? "Tenant aan"
                                  : "Standaard"}
                            </Badge>
                          </div>
                        </td>
                      );
                    })}
                    {isWhiteLabel ? (
                      <td className="px-4 py-3">
                        {rows.some((row) => row.channel === "email") ? (
                          <div className="flex items-center gap-2">
                            {hasTenantTemplate(key, "email") ? (
                              <Badge variant="primary" className="text-xs">
                                Eigen template
                              </Badge>
                            ) : null}
                            <Link
                              href={`/backoffice/instellingen/notificaties/templates/${key}/email`}
                            >
                              <Button size="sm" variant="outline">
                                {hasTenantTemplate(key, "email")
                                  ? "Aanpassen"
                                  : "Instellen"}
                              </Button>
                            </Link>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {!isWhiteLabel ? (
        <p className="text-xs text-muted-foreground">
          Eigen e-mailtemplates zijn beschikbaar voor white-label rijscholen
          (NXTDRIVE Elite). Tot die tijd gebruikt deze tenant de
          NXTDRIVE-standaardcopy met jouw schoolnaam en contactgegevens.
        </p>
      ) : null}
    </div>
  );
}
