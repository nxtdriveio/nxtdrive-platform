"use client";

import { useTransition, useState } from "react";
import {
  AlertTriangle,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  Send,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type {
  EndOfLessonSchedulingState,
  EndOfLessonSchedulingSuggestion,
} from "@/lib/end-of-lesson-scheduling/service";
import {
  planInstructorNextLessonAction,
  proposeInstructorNextLessonAction,
} from "@/lib/ris/actions";

type ActionStatus = {
  kind: "success" | "error";
  message: string;
} | null;

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "short",
  day: "2-digit",
  month: "short",
});

const timeFmt = new Intl.DateTimeFormat("nl-NL", {
  hour: "2-digit",
  minute: "2-digit",
});

function formatMoment(startsAt: string, endsAt: string | null) {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;
  return `${dateFmt.format(start)} · ${
    end ? `${timeFmt.format(start)} - ${timeFmt.format(end)}` : timeFmt.format(start)
  }`;
}

export function EndOfLessonSchedulingPanel({
  state,
}: {
  state: EndOfLessonSchedulingState;
}) {
  const [status, setStatus] = useState<ActionStatus>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function runAction(
    suggestion: EndOfLessonSchedulingSuggestion,
    mode: "plan" | "propose",
  ) {
    setStatus(null);
    setPendingKey(`${mode}:${suggestion.startsAt}`);
    startTransition(async () => {
      const payload = {
        lessonId: state.sourceLessonId,
        startsAt: suggestion.startsAt,
        endsAt: suggestion.endsAt,
        durationMin: suggestion.durationMin,
      };
      const result =
        mode === "plan"
          ? await planInstructorNextLessonAction(payload)
          : await proposeInstructorNextLessonAction(payload);
      if (result.error) {
        setStatus({ kind: "error", message: result.error });
      } else {
        setStatus({
          kind: "success",
          message:
            mode === "plan"
              ? "Volgende les is ingepland."
              : "Voorstel is naar de leerling gestuurd.",
        });
      }
      setPendingKey(null);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-primary">
              <CalendarClock className="h-4 w-4" aria-hidden />
              Volgende les
            </div>
            <h3 className="mt-1 text-lg font-black text-foreground">
              Einde-les planning
            </h3>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Controleer direct of er al een vervolgafspraak staat. Zo niet,
              plan of stuur een voorstel op basis van beschikbaarheid, pakket en
              tegoed.
            </p>
          </div>
          <Badge variant={state.nextLesson ? "success" : "primary"}>
            {state.nextLesson ? "Gepland" : "Suggesties"}
          </Badge>
        </div>

        {state.nextLesson ? (
          <div className="flex items-start gap-3 rounded-2xl border border-success/30 bg-success/10 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <div>
              <div className="font-black text-foreground">
                Er staat al een volgende les gepland
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {formatMoment(state.nextLesson.startsAt, state.nextLesson.endsAt)}
                {state.nextLesson.location ? ` · ${state.nextLesson.location}` : ""}
              </div>
            </div>
          </div>
        ) : null}

        {!state.nextLesson && state.lowCreditWarning ? (
          <div className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-warning">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <div className="text-sm font-semibold">{state.lowCreditWarning}</div>
          </div>
        ) : null}

        {!state.nextLesson && state.suggestions.length > 0 ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {state.suggestions.map((suggestion) => (
              <div
                key={suggestion.startsAt}
                className="rounded-2xl border border-border bg-background/70 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-black text-foreground">
                      {formatMoment(suggestion.startsAt, suggestion.endsAt)}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {suggestion.durationMin} min · score {suggestion.score}
                    </div>
                  </div>
                  <Badge variant={suggestion.canDirectPlan ? "success" : "warning"}>
                    {suggestion.canDirectPlan ? "Direct mogelijk" : "Voorstel"}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {suggestion.reasons.slice(0, 3).map((reason) => (
                    <span
                      key={reason}
                      className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary"
                    >
                      {reason}
                    </span>
                  ))}
                  {suggestion.warnings.slice(0, 2).map((warning) => (
                    <span
                      key={warning}
                      className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-bold text-warning"
                    >
                      {warning}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    disabled={
                      isPending ||
                      !suggestion.canDirectPlan ||
                      pendingKey === `plan:${suggestion.startsAt}`
                    }
                    onClick={() => runAction(suggestion, "plan")}
                    className="gap-2"
                  >
                    <CalendarCheck2 className="h-4 w-4" aria-hidden />
                    Plan direct
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isPending || pendingKey === `propose:${suggestion.startsAt}`}
                    onClick={() => runAction(suggestion, "propose")}
                    className="gap-2"
                  >
                    <Send className="h-4 w-4" aria-hidden />
                    Stel voor
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {!state.nextLesson && state.suggestions.length === 0 ? (
          <div className="rounded-2xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
            Er zijn nog geen geschikte vervolgslots gevonden.
            {state.blockingReasons.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {state.blockingReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {status ? (
          <div
            className={
              status.kind === "success"
                ? "rounded-2xl border border-success/30 bg-success/10 p-3 text-sm font-semibold text-success"
                : "rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm font-semibold text-destructive"
            }
          >
            {status.message}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
