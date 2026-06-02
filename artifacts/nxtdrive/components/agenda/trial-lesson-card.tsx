import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  TRIAL_LESSON_STATUS_LABEL,
  TRIAL_LESSON_STATUS_VARIANT,
  type TrialLessonStatus,
} from "@/lib/trial-lessons/types";

const timeFmt = new Intl.DateTimeFormat("nl-NL", {
  hour: "2-digit",
  minute: "2-digit",
});

// Compact agenda card for a trial lesson (proefles). Visually distinct from a
// regular lesson card (dashed accent border + "Proefles" tag) and links back
// to the lead detail so the backoffice can confirm / reschedule / reject it.
export function TrialLessonCard({
  leadId,
  leadName,
  startsAt,
  status,
  instructorName,
}: {
  leadId: string;
  leadName: string;
  startsAt: string;
  status: TrialLessonStatus;
  instructorName?: string;
}) {
  return (
    <Link
      href={`/backoffice/leads/${leadId}`}
      className="block rounded-md border border-dashed border-info/60 bg-info/5 px-2 py-1.5 text-xs hover:border-info"
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-medium text-foreground">
          {timeFmt.format(new Date(startsAt))}
        </span>
        <Badge variant={TRIAL_LESSON_STATUS_VARIANT[status]}>
          {TRIAL_LESSON_STATUS_LABEL[status]}
        </Badge>
      </div>
      <div className="mt-1 truncate text-muted-foreground">
        <span className="font-medium text-info">Proefles</span> · {leadName}
      </div>
      {instructorName ? (
        <div className="truncate text-[11px] text-muted-foreground">
          {instructorName}
        </div>
      ) : null}
    </Link>
  );
}
