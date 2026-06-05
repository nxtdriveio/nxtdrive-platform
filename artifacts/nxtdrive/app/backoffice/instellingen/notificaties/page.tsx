import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getAllPlatformNotificationConfigs } from "@/lib/notifications/platform-notification-config";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toggleTenantTrigger } from "./actions";
import Link from "next/link";

export const dynamic = "force-dynamic";

const CHANNEL_LABEL: Record<string, string> = {
  email: "E-mail",
  inapp: "In-app",
  push: "Push",
};

const CHANNEL_ORDER = ["email", "inapp", "push"];

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

  const [platformConfigs, { data: tenantTemplates }] = await Promise.all([
    getAllPlatformNotificationConfigs(service),
    service
      .from("notification_templates")
      .select("key, channel, tenant_enabled, subject, body_html, enabled")
      .eq("tenant_id", tenant.id),
  ]);

  const { isWhiteLabelEligible } = await import("@/lib/platform/features");
  const isWhiteLabel = isWhiteLabelEligible(
    tenant as { plan: import("@/lib/types").TenantPlan; white_label_enabled?: boolean | null },
  );

  const savedKey = params.saved ?? null;

  const globallyEnabledConfigs = platformConfigs.filter((c) => c.globallyEnabled);

  const byKey = new Map<string, typeof globallyEnabledConfigs>();
  for (const c of globallyEnabledConfigs) {
    if (!byKey.has(c.eventKey)) byKey.set(c.eventKey, []);
    byKey.get(c.eventKey)!.push(c);
  }
  const allKeys = Array.from(byKey.keys()).sort();

  function getTenantEnabled(key: string, channel: string): boolean | null {
    const row = (tenantTemplates ?? []).find(
      (r) => (r.key as string) === key && (r.channel as string) === channel,
    );
    const te = row?.tenant_enabled;
    if (te === true) return true;
    if (te === false) return false;
    return null;
  }

  function hasTenantTemplate(key: string, channel: string): boolean {
    const row = (tenantTemplates ?? []).find(
      (r) => (r.key as string) === key && (r.channel as string) === channel,
    );
    return Boolean(row?.body_html || row?.subject);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Notificaties</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Schakel triggers aan of uit voor jouw rijschool. Uitgeschakelde triggers sturen geen
            berichten aan leerlingen of medewerkers.
            {isWhiteLabel && (
              <span>
                {" "}
                Als white-label rijschool kun je ook eigen templates instellen per e-mailtrigger.
              </span>
            )}
          </p>
        </div>
        <Link href="/backoffice/instellingen" className="text-sm text-muted-foreground hover:text-foreground">
          ← Instellingen
        </Link>
      </div>

      {savedKey && (
        <div className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          Instelling opgeslagen voor <strong>{savedKey}</strong>.
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3 sm:px-6">
          <h2 className="text-sm font-semibold text-foreground">Trigger-instellingen</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Alleen globaal ingeschakelde triggers zijn hier zichtbaar. Platform admin beheert de
            globale aan/uit-schakelaar.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Trigger</th>
                {CHANNEL_ORDER.map((ch) => (
                  <th key={ch} className="px-4 py-3 text-center font-medium">
                    {CHANNEL_LABEL[ch]}
                  </th>
                ))}
                {isWhiteLabel && (
                  <th className="px-4 py-3 font-medium">Template</th>
                )}
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
                      <div className="mt-0.5 font-mono text-xs text-muted-foreground">{key}</div>
                    </td>
                    {CHANNEL_ORDER.map((ch) => {
                      const cfg = rows.find((r) => r.channel === ch);
                      if (!cfg) {
                        return (
                          <td key={ch} className="px-4 py-3 text-center text-muted-foreground">
                            —
                          </td>
                        );
                      }
                      const tenantEnabled = getTenantEnabled(key, ch);
                      const isOn = tenantEnabled === null ? true : tenantEnabled;
                      return (
                        <td key={ch} className="px-4 py-3 text-center">
                          <form action={toggleTenantTrigger}>
                            <input type="hidden" name="event_key" value={key} />
                            <input type="hidden" name="channel" value={ch} />
                            <input
                              type="hidden"
                              name="enabled"
                              value={isOn ? "false" : "true"}
                            />
                            <button
                              type="submit"
                              title={isOn ? "Uitschakelen" : "Inschakelen"}
                              className={`inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                isOn ? "bg-primary" : "bg-muted border border-border"
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
                        </td>
                      );
                    })}
                    {isWhiteLabel && (
                      <td className="px-4 py-3">
                        {rows.some((r) => r.channel === "email") ? (
                          <div className="flex items-center gap-2">
                            {hasTenantTemplate(key, "email") && (
                              <Badge variant="primary" className="text-xs">Eigen template</Badge>
                            )}
                            <Link
                              href={`/backoffice/instellingen/notificaties/templates/${key}/email`}
                            >
                              <Button size="sm" variant="outline">
                                {hasTenantTemplate(key, "email") ? "Aanpassen" : "Instellen"}
                              </Button>
                            </Link>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {!isWhiteLabel && (
        <p className="text-xs text-muted-foreground">
          Eigen e-mailtemplates zijn beschikbaar voor white-label rijscholen (NXTDRIVE Elite).
          Je e-mails worden verstuurd in de NXTDRIVE-huisstijl met jouw schoolnaam en gegevens.
        </p>
      )}
    </div>
  );
}
