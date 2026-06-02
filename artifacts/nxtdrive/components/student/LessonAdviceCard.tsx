import { Lightbulb } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Highlighted "Advies"-block (student view): the instructor's free-text advice
 * for the next lesson / home practice. Read-only.
 */
export function LessonAdviceCard({ advice }: { advice: string | null }) {
  if (!advice) return null;
  return (
    <Card className="border-primary/40 bg-primary-soft/40">
      <CardContent className="space-y-2 pt-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary">
          <Lightbulb className="h-4 w-4" aria-hidden />
          Advies van je instructeur
        </div>
        <p className="whitespace-pre-wrap text-sm text-foreground">{advice}</p>
      </CardContent>
    </Card>
  );
}
