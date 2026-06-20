import { BadgeCheck, CheckCircle2, Circle, CalendarClock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MACHTIGING_STATUS_LABEL } from "@/lib/cbr/types";
import {
  CBR_EXAM_STATUS_LABEL,
  CBR_EXAM_STATUS_TONE,
  type CbrStatusTone,
} from "@/lib/cbr/derive";
import type { CbrStudentSummary } from "@/lib/cbr/data";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

const TONE_VARIANT: Record<
  CbrStatusTone,
  "default" | "info" | "warning" | "success" | "danger"
> = {
  neutral: "default",
  info: "info",
  warning: "warning",
  success: "success",
  danger: "danger",
};

/** Leerling-zicht op het CBR-examenproces (read-only). */
export function StudentCbrCard({ summary }: { summary: CbrStudentSummary }) {
  const { preconditions: pre, derived } = summary;
  const next =
    derived.nextAppointmentType === "exam"
      ? "Examen"
      : derived.nextAppointmentType === "interim_test"
        ? "Tussentijdse toets"
        : null;

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
            <BadgeCheck className="h-4 w-4" aria-hidden />
            CBR-status
          </div>
          <Badge variant={TONE_VARIANT[CBR_EXAM_STATUS_TONE[derived.examStatus]]}>
            {CBR_EXAM_STATUS_LABEL[derived.examStatus]}
          </Badge>
        </div>

        <div className="space-y-1.5">
          <Row label="Theorie behaald" done={pre.theorieBehaald} />
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Machtiging</span>
            <Badge
              variant={
                pre.machtigingStatus === "ontvangen"
                  ? "success"
                  : pre.machtigingStatus === "aangevraagd"
                    ? "warning"
                    : "default"
              }
            >
              {MACHTIGING_STATUS_LABEL[pre.machtigingStatus]}
            </Badge>
          </div>
          {pre.gezondheidsverklaringVereist ? (
            <Row
              label="Gezondheidsverklaring"
              done={pre.gezondheidsverklaringGeregeld}
            />
          ) : null}
        </div>

        {next && derived.nextAppointmentAt ? (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <CalendarClock
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span className="text-foreground">
              {next} op {dateFmt.format(new Date(derived.nextAppointmentAt))}
            </span>
          </div>
        ) : null}

        {derived.lastExamResult ? (
          <div
            className={
              derived.lastExamResult === "passed"
                ? "rounded-md border border-success/40 bg-success/5 px-3 py-2 text-sm text-foreground"
                : "rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-foreground"
            }
          >
            <div className="font-medium">
              Laatste examenuitslag:{" "}
              {derived.lastExamResult === "passed" ? "Geslaagd" : "Gezakt"}
              {derived.lastExamAt
                ? ` (${dateFmt.format(new Date(derived.lastExamAt))})`
                : null}
            </div>
            {summary.lastExamNote ? (
              <div className="mt-1">
                <span className="font-medium">Vervolgadvies: </span>
                {summary.lastExamNote}
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Row({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {done ? (
        <span className="inline-flex items-center gap-1 text-success">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          Geregeld
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Circle className="h-4 w-4" aria-hidden />
          Open
        </span>
      )}
    </div>
  );
}
