import { CheckCircle2, AlertTriangle, MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * "Leerlingnotitie" block (student view): the instructor's lesson note and any
 * attention points, shown as icon bullets. Read-only.
 */
export function LessonNotesCard({
  studentNote,
  attentionPoints,
}: {
  studentNote: string | null;
  attentionPoints: string | null;
}) {
  if (!studentNote && !attentionPoints) return null;
  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <MessageSquare className="h-4 w-4" aria-hidden />
          Leerlingnotitie
        </div>

        {studentNote ? (
          <div className="flex gap-2.5">
            <CheckCircle2
              className="mt-0.5 h-4 w-4 shrink-0 text-success"
              aria-hidden
            />
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {studentNote}
            </p>
          </div>
        ) : null}

        {attentionPoints ? (
          <div className="flex gap-2.5">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-warning"
              aria-hidden
            />
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {attentionPoints}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
