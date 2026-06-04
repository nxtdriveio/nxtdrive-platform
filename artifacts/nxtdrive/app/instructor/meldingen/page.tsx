import { requireActiveTenant } from "@/lib/auth/require-role";
import { Card, CardContent } from "@/components/ui/card";
import { PushToggle } from "@/components/notifications/PushToggle";
import { getVapidPublicKey } from "@/lib/notifications/web-push";
import { getNotificationPreference } from "@/lib/notifications/push-actions";
import { loadInAppNotifications } from "@/lib/notifications/in-app";

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
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold text-foreground">Meldingen</h1>

      <PushToggle vapidPublicKey={vapidPublicKey} serverPushEnabled={serverPushEnabled} />

      <Card>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {items.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                Geen meldingen
              </li>
            )}
            {items.map((n) => (
              <li key={n.id} className="px-4 py-3">
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
                      <p className="mt-0.5 text-xs text-muted-foreground">
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
  );
}
