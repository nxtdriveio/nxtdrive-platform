import { requirePlatformAdmin } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getAllPlatformNotificationConfigs } from "@/lib/notifications/platform-notification-config";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toggleGlobalTrigger } from "./actions";
import Link from "next/link";

export const dynamic = "force-dynamic";

const CHANNEL_LABEL: Record<string, string> = {
  email: "E-mail",
  inapp: "In-app",
  push: "Push",
};

const CHANNEL_ORDER = ["email", "inapp", "push"];

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const [user, params] = await Promise.all([requirePlatformAdmin(), searchParams]);
  const service = createServiceRoleClient();
  const configs = await getAllPlatformNotificationConfigs(service);

  const activeTab = params.tab ?? "triggers";
  const savedKey = params.saved ?? null;

  const tabClass = (tab: string) =>
    `px-4 py-2 text-sm font-medium rounded-md transition-colors ${
      activeTab === tab
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:text-foreground hover:bg-muted"
    }`;

  const byKey = new Map<string, typeof configs>();
  for (const c of configs) {
    if (!byKey.has(c.eventKey)) byKey.set(c.eventKey, []);
    byKey.get(c.eventKey)!.push(c);
  }

  const allKeys = Array.from(byKey.keys()).sort();
  const emailConfigs = configs.filter((c) => c.channel === "email");
  const inappConfigs = configs.filter((c) => c.channel === "inapp");
  const pushConfigs  = configs.filter((c) => c.channel === "push");

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-8">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-muted-foreground hover:text-foreground text-sm">
              ← Admin
            </Link>
            <span className="text-muted-foreground">/</span>
            <NxtdriveLogo className="text-base" />
            <span className="text-sm font-medium text-foreground">Notificatiebeheer</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:block">
              {user.profile?.full_name ?? user.email}
            </span>
            <Badge variant="primary" className="text-xs">platform admin</Badge>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
        {savedKey && (
          <div className="rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
            Template opgeslagen voor <strong>{savedKey}</strong>.
          </div>
        )}

        <div className="flex flex-wrap gap-1 rounded-lg bg-muted/50 p-1 sm:w-fit">
          {[
            { id: "triggers",         label: "Triggers" },
            { id: "templates",        label: "E-mail" },
            { id: "templates-inapp",  label: "In-app" },
            { id: "templates-push",   label: "Push" },
          ].map((tab) => (
            <Link
              key={tab.id}
              href={`/admin/notifications?tab=${tab.id}`}
              className={tabClass(tab.id)}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {activeTab === "triggers" && (
          <Card className="overflow-hidden">
            <div className="border-b border-border px-4 py-3 sm:px-6">
              <h2 className="text-sm font-semibold text-foreground">
                Globale trigger-instellingen
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Schakel hier triggers globaal aan of uit. Een uitgeschakelde trigger stuurt niets,
                ongeacht de tenant-instelling.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Trigger</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-xs">Omschrijving</th>
                    {CHANNEL_ORDER.map((ch) => (
                      <th key={ch} className="px-4 py-3 text-center font-medium">
                        {CHANNEL_LABEL[ch]}
                      </th>
                    ))}
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
                          <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                            {key}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs">
                          {firstRow?.description ?? ""}
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
                          return (
                            <td key={ch} className="px-4 py-3 text-center">
                              <form action={toggleGlobalTrigger}>
                                <input type="hidden" name="event_key" value={key} />
                                <input type="hidden" name="channel" value={ch} />
                                <input
                                  type="hidden"
                                  name="enabled"
                                  value={cfg.globallyEnabled ? "false" : "true"}
                                />
                                <button
                                  type="submit"
                                  title={cfg.globallyEnabled ? "Uitschakelen" : "Inschakelen"}
                                  className={`inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                    cfg.globallyEnabled
                                      ? "bg-primary"
                                      : "bg-muted border border-border"
                                  }`}
                                >
                                  <span
                                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                                      cfg.globallyEnabled ? "translate-x-6" : "translate-x-1"
                                    }`}
                                  />
                                  <span className="sr-only">
                                    {cfg.globallyEnabled ? "Uitschakelen" : "Inschakelen"}
                                  </span>
                                </button>
                              </form>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {activeTab === "templates" && (
          <Card className="overflow-hidden">
            <div className="border-b border-border px-4 py-3 sm:px-6">
              <h2 className="text-sm font-semibold text-foreground">E-mail Templates</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Bewerk de platform-standaard e-mailtemplate per trigger. Rijscholen die geen
                white-label hebben ontvangen e-mails op basis van deze templates.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Trigger</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Template</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {emailConfigs.map((cfg) => (
                    <tr key={cfg.eventKey} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{cfg.labelNl}</div>
                        <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                          {cfg.eventKey}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {cfg.globallyEnabled ? (
                          <Badge variant="success" className="text-xs">Ingeschakeld</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            Uitgeschakeld
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {cfg.bodyHtml ? (
                          <Badge variant="primary" className="text-xs">Aangepast</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Standaard</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/admin/notifications/templates/${cfg.eventKey}/email`}>
                          <Button size="sm" variant="outline">Bewerken</Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {activeTab === "templates-inapp" && (
          <Card className="overflow-hidden">
            <div className="border-b border-border px-4 py-3 sm:px-6">
              <h2 className="text-sm font-semibold text-foreground">In-app Templates</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Platform-standaard titel en tekst voor in-app meldingen per trigger. Tenants met
                white-label kunnen dit per rijschool aanpassen.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Trigger</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Template</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {inappConfigs.map((cfg) => (
                    <tr key={cfg.eventKey} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{cfg.labelNl}</div>
                        <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                          {cfg.eventKey}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {cfg.globallyEnabled ? (
                          <Badge variant="success" className="text-xs">Ingeschakeld</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            Uitgeschakeld
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {cfg.inappTitle ? (
                          <Badge variant="primary" className="text-xs">Aangepast</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Standaard</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/admin/notifications/templates/${cfg.eventKey}/inapp`}>
                          <Button size="sm" variant="outline">Bewerken</Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {activeTab === "templates-push" && (
          <Card className="overflow-hidden">
            <div className="border-b border-border px-4 py-3 sm:px-6">
              <h2 className="text-sm font-semibold text-foreground">Push Templates</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Platform-standaard titel en tekst voor push-notificaties per trigger.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Trigger</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Template</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pushConfigs.map((cfg) => (
                    <tr key={cfg.eventKey} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{cfg.labelNl}</div>
                        <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                          {cfg.eventKey}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {cfg.globallyEnabled ? (
                          <Badge variant="success" className="text-xs">Ingeschakeld</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            Uitgeschakeld
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {cfg.pushTitle ? (
                          <Badge variant="primary" className="text-xs">Aangepast</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Standaard</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/admin/notifications/templates/${cfg.eventKey}/push`}>
                          <Button size="sm" variant="outline">Bewerken</Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}
