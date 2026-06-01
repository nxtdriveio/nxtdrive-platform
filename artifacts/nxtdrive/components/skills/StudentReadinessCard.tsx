import { GraduationCap, Info, ListChecks } from "lucide-react";
import {
  ADVICE_LABELS,
  PHASE_LABELS,
  type ReadinessPhase,
  type ReadinessResult,
} from "@workspace/leskaart";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const PHASE_ORDER: ReadinessPhase[] = [
  "beginfase",
  "ontwikkelfase",
  "gevorderd",
  "bijna_examenrijp",
  "examenwaardig",
];

const adviceVariant = {
  examenwaardig: "success",
  bijna_examenrijp: "warning",
  niet_examenrijp: "danger",
} as const;

const phaseMessage: Record<ReadinessPhase, string> = {
  beginfase: "Je bent net begonnen — elke les telt. Zet 'm op!",
  ontwikkelfase: "Je bent goed op weg en bouwt je vaardigheden op.",
  gevorderd: "Sterke vooruitgang — je nadert de examenfase.",
  bijna_examenrijp: "Bijna zover! Nog een paar punten aanscherpen.",
  examenwaardig: "Top! Je vaardigheden zijn op examenniveau.",
};

/**
 * Mobile-first, read-only exam-readiness meter for the student/parent. Shows
 * the L1 verdict, the 5-phase band and the advisory disclaimer. No inputs —
 * scoring and preconditions are instructor-only (L2).
 */
export function StudentReadinessCard({
  readiness,
}: {
  readiness: ReadinessResult;
}) {
  const currentIdx = PHASE_ORDER.indexOf(readiness.phase);

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <GraduationCap className="h-4 w-4" aria-hidden />
            Examenrijpheid
          </div>
          <Badge variant={adviceVariant[readiness.advice]}>
            {ADVICE_LABELS[readiness.advice]}
          </Badge>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-3xl font-semibold text-foreground tabular-nums">
              {readiness.readinessPct}%
            </span>
            <span className="text-xs text-muted-foreground">
              {PHASE_LABELS[readiness.phase]}
            </span>
          </div>
          <div
            className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={readiness.readinessPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${readiness.readinessPct}%` }}
            />
          </div>
        </div>

        {/* Fase-band: the five phases with the current one highlighted. */}
        <div>
          <div className="flex gap-1">
            {PHASE_ORDER.map((p, i) => (
              <div
                key={p}
                className={cn(
                  "h-1.5 flex-1 rounded-full",
                  i <= currentIdx ? "bg-primary" : "bg-muted",
                )}
                aria-hidden
              />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
            <span>Begin</span>
            <span>Examenwaardig</span>
          </div>
        </div>

        <p className="text-sm text-foreground">{phaseMessage[readiness.phase]}</p>

        {readiness.blockers.length > 0 ? (
          <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <ListChecks className="h-3.5 w-3.5" aria-hidden />
              Nog te doen
            </div>
            <ul className="space-y-1 text-sm text-foreground">
              {readiness.blockers.slice(0, 4).map((b) => (
                <li key={b} className="flex gap-2">
                  <span className="text-muted-foreground">•</span>
                  {b}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="flex gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {readiness.disclaimer}
        </p>
      </CardContent>
    </Card>
  );
}
