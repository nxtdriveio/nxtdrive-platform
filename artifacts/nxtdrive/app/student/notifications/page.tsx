import { Bell } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { NotificationInbox } from "@/components/notifications/NotificationInbox";
import { PWAPage, PWAPageHeader } from "@/components/pwa/primitives";
import { loadInAppNotifications } from "@/lib/notifications/in-app";

export const dynamic = "force-dynamic";

export default async function StudentNotificationsPage() {
  const { tenant } = await requireActiveTenant(["student", "parent"]);
  const { items, unreadCount } = await loadInAppNotifications(tenant.id, {
    limit: 100,
  });

  return (
    <PWAPage app="student" contentClassName="space-y-4">
      <PWAPageHeader
        eyebrow="Meldingen"
        title="Updates"
        subtitle="Lessen, feedback, betalingen en berichten die aandacht vragen."
        icon={<Bell className="h-4 w-4" aria-hidden />}
      />
      <NotificationInbox items={items} unreadCount={unreadCount} />
    </PWAPage>
  );
}
