import { InstructorNotificationsView } from "@/components/instructor/RedesignViews";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { loadInAppNotifications } from "@/lib/notifications/in-app";

export const dynamic = "force-dynamic";

export default async function InstructorNotificationsPage() {
  const { tenant } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);
  const { items, unreadCount } = await loadInAppNotifications(tenant.id, {
    limit: 100,
  });
  return (
    <InstructorNotificationsView
      items={items}
      unreadCount={unreadCount}
    />
  );
}
