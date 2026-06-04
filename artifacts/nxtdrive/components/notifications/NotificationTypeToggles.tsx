"use client";

import { useOptimistic, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { updateNotificationTypePreference } from "@/lib/notifications/push-actions";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABEL,
  NOTIFICATION_CATEGORY_DESCRIPTION,
  type NotificationCategory,
} from "@/lib/notifications/types";

type Props = {
  initialPreferences: Partial<Record<NotificationCategory, boolean>>;
};

/**
 * Per-category notification preference toggles rendered on the student profile.
 * Missing keys in `initialPreferences` mean opted-in (default on).
 * Each toggle persists immediately via a server action with optimistic UI.
 */
export function NotificationTypeToggles({ initialPreferences }: Props) {
  const [preferences, setOptimistic] = useOptimistic(
    initialPreferences,
    (
      state: Partial<Record<NotificationCategory, boolean>>,
      update: { category: NotificationCategory; enabled: boolean },
    ) => ({ ...state, [update.category]: update.enabled }),
  );

  const [, startTransition] = useTransition();

  function toggle(category: NotificationCategory, enabled: boolean) {
    startTransition(async () => {
      setOptimistic({ category, enabled });
      await updateNotificationTypePreference(category, enabled);
    });
  }

  return (
    <div className="space-y-3">
      {NOTIFICATION_CATEGORIES.map((category) => {
        const enabled = preferences[category] !== false;
        return (
          <div key={category} className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground leading-snug">
                {NOTIFICATION_CATEGORY_LABEL[category]}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {NOTIFICATION_CATEGORY_DESCRIPTION[category]}
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={(checked: boolean) => toggle(category, checked)}
              aria-label={NOTIFICATION_CATEGORY_LABEL[category]}
              className="shrink-0 mt-0.5"
            />
          </div>
        );
      })}
    </div>
  );
}
