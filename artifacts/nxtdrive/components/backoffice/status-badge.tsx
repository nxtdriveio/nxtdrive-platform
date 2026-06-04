import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";

const LEAD_STATUS_MAP: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  new: { label: "Nieuw", variant: "info" },
  contacted: { label: "Benaderd", variant: "primary" },
  package_advised: { label: "Pakket", variant: "warning" },
  converted: { label: "Klant", variant: "success" },
  dropped: { label: "Afgevallen", variant: "default" },
  assessment_pending: { label: "In beoordeling", variant: "warning" },
  trial_scheduled: { label: "Proefles ingepland", variant: "info" },
  trial_completed: { label: "Proefles gedaan", variant: "primary" },
  no_show: { label: "No-show", variant: "danger" },
  inactive: { label: "Inactief", variant: "default" },
};

const LESSON_STATUS_MAP: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  planned: { label: "Gepland", variant: "primary" },
  in_progress: { label: "Bezig", variant: "info" },
  completed: { label: "Gereed", variant: "success" },
  cancelled_with_refund: { label: "Geannuleerd", variant: "default" },
  cancelled_no_refund: { label: "Geannuleerd", variant: "danger" },
};

const TRIAL_STATUS_MAP: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  provisional: { label: "Voorlopig", variant: "warning" },
  confirmed: { label: "Bevestigd", variant: "success" },
  cancelled: { label: "Geannuleerd", variant: "default" },
  rejected: { label: "Afgewezen", variant: "danger" },
};

type StatusDomain = "lead" | "lesson" | "trial";

export function StatusBadge({
  status,
  domain,
}: {
  status: string;
  domain: StatusDomain;
}) {
  const map =
    domain === "lead"
      ? LEAD_STATUS_MAP
      : domain === "lesson"
        ? LESSON_STATUS_MAP
        : TRIAL_STATUS_MAP;

  const resolved = map[status] ?? { label: status, variant: "default" as const };
  return <Badge variant={resolved.variant}>{resolved.label}</Badge>;
}
