"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { convertExamSignalsToTasks } from "@/lib/exam/actions";

type ExamSignalItem = {
  code: string;
  label: string;
};

function summarize(
  result: Awaited<ReturnType<typeof convertExamSignalsToTasks>>,
): { tone: "ok" | "info" | "error"; text: string } {
  if (!result.ok) {
    return { tone: "error", text: result.error ?? "Er ging iets mis." };
  }
  if (result.created === 0 && result.existing > 0) {
    return { tone: "info", text: "Taak stond al open — niets toegevoegd." };
  }
  const parts: string[] = [];
  if (result.created > 0) {
    parts.push(`${result.created} ${result.created === 1 ? "taak" : "taken"} aangemaakt`);
  }
  if (result.existing > 0) {
    parts.push(`${result.existing} stond${result.existing === 1 ? "" : "en"} al open`);
  }
  return { tone: "ok", text: parts.join(", ") + "." };
}

export function ExamSignalButtons({
  appointmentId,
  signals,
}: {
  appointmentId: string;
  signals: ExamSignalItem[];
}) {
  const [isPending, startTransition] = useTransition();
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "ok" | "info" | "error";
    text: string;
  } | null>(null);

  if (signals.length === 0) return null;

  const run = (codes: string[], marker: string) => {
    setPendingCode(marker);
    setFeedback(null);
    startTransition(async () => {
      const result = await convertExamSignalsToTasks(appointmentId, codes);
      setFeedback(summarize(result));
      setPendingCode(null);
    });
  };

  const allCodes = signals.map((s) => s.code);

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        {signals.map((s) => (
          <Button
            key={s.code}
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => run([s.code], s.code)}
          >
            {pendingCode === s.code ? "Bezig…" : `Taak: ${s.label}`}
          </Button>
        ))}
      </div>

      {signals.length > 1 ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={isPending}
          onClick={() => run(allCodes, "__all__")}
        >
          {pendingCode === "__all__"
            ? "Bezig…"
            : "Alle signalen omzetten naar taken"}
        </Button>
      ) : null}

      {feedback ? (
        <p
          className={
            feedback.tone === "error"
              ? "text-sm text-danger"
              : feedback.tone === "info"
                ? "text-sm text-muted-foreground"
                : "text-sm text-success"
          }
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}
