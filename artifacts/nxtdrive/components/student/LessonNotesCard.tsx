import { AlertTriangle, CheckCircle2, MessageSquare } from "lucide-react";
import {
  StudentShowcaseCard,
  StudentShowcaseNotice,
} from "@/components/student/Showcase";

export function LessonNotesCard({
  studentNote,
  attentionPoints,
}: {
  studentNote: string | null;
  attentionPoints: string | null;
}) {
  if (!studentNote && !attentionPoints) return null;

  return (
    <StudentShowcaseCard
      title="Notities uit je les"
      eyebrow="Feedback"
      info="Hier lees je de lesnotitie en eventuele aandachtspunten die je instructeur voor jou heeft vastgelegd."
    >
      <div className="space-y-3">
        {studentNote ? (
          <StudentShowcaseNotice
            tone="success"
            title="Wat goed ging"
            description={studentNote}
            icon={<CheckCircle2 className="h-5 w-5" aria-hidden />}
          />
        ) : null}
        {attentionPoints ? (
          <StudentShowcaseNotice
            tone="warning"
            title="Aandachtspunten"
            description={attentionPoints}
            icon={<AlertTriangle className="h-5 w-5" aria-hidden />}
          />
        ) : null}
        {!studentNote && !attentionPoints ? (
          <StudentShowcaseNotice
            title="Nog geen notities"
            description="Er zijn nog geen extra lesnotities gedeeld voor deze rit."
            icon={<MessageSquare className="h-5 w-5" aria-hidden />}
          />
        ) : null}
      </div>
    </StudentShowcaseCard>
  );
}
