import { requireActiveTenant } from "@/lib/auth/require-role";
import { Card, CardContent } from "@/components/ui/card";
import { PushToggle } from "@/components/notifications/PushToggle";
import { getVapidPublicKey } from "@/lib/notifications/web-push";
import { getNotificationPreference } from "@/lib/notifications/push-actions";
import { loadInAppNotifications } from "@/lib/notifications/in-app";
import {
  PWACard,
  PWAKpiGrid,
  PWAKpiTile,
  PWAPage,
  PWAPageHeader,
} from "@/components/pwa/primitives";

export const dynamic = "force-dynamic";

function relativeNL(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "zojuist";
  if (min < 60) return `${min} min geleden`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs} uur geleden`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days} ${days === 1 ? "dag" : "dagen"} geleden`;
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

export default async function InstructorNotificationsPage() {
  const { tenant } = await requireActiveTenant(["instructor", "tenant_admin"]);
  const [vapidPublicKey, serverPushEnabled, { items }] = await Promise.all([
    Promise.resolve(getVapidPublicKey()),
    getNotificationPreference(),
    loadInAppNotifications(tenant.id),
  ]);

  return (
    <PWAPage app="instructor" contentClassName="space-y-5">
      <PWAPageHeader
        eyebrow="Meldingen"
        title="Notificaties"
        description="Beheer pushmeldingen en bekijk recente updates zonder je flow te onderbreken."
        align="left"
      />

      <PWAKpiGrid compact className="lg:grid-cols-3">
        <PWAKpiTile
          label="Open meldingen"
          value={items.filter((item) => !item.readAt).length}
          hint="Updates die nog niet als gelezen zijn gemarkeerd."
        />
        <PWAKpiTile
          label="Recente items"
          value={items.length}
          hint="Alle meldingen die momenteel in je inbox staan."
        />
        <PWAKpiTile
          label="Pushstatus"
          value={serverPushEnabled ? "Aan" : "Uit"}
          hint="Per apparaat beheer je dit hieronder."
        />
      </PWAKpiGrid>

      <div className="grid gap-5 xl:grid-cols-[minmax(20rem,0.85fr)_minmax(0,1.15fr)]">
        <div className="space-y-5">
          <PushToggle
            vapidPublicKey={vapidPublicKey}
            serverPushEnabled={serverPushEnabled}
          />
          <PWACard
            title="Slim gebruik"
            className="bg-card"
            contentClassName="space-y-2"
          >
            <p className="text-sm leading-6 text-muted-foreground">
              Laat push aan op je hoofdtabelt en gebruik deze inbox om snel te
              scannen wat direct aandacht vraagt. Zo blijft je lesflow rustig.
            </p>
          </PWACard>
        </div>

        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {items.length === 0 && (
                <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Geen meldingen
                </li>
              )}
              {items.map((n) => (
                <li key={n.id} className="px-4 py-3.5">
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        n.readAt ? "bg-transparent" : "bg-primary"
                      }`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-sm ${
                          n.readAt ? "font-normal" : "font-semibold"
                        } text-foreground`}
                      >
                        {n.title}
                      </div>
                      {n.body && (
                        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                          {n.body}
                        </p>
                      )}
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {relativeNL(n.createdAt)}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </PWAPage>
  );
}
