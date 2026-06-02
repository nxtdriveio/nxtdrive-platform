"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { createTasksFromIntakePoints } from "../actions";

type IntakeTaskPoint = {
  code: string;
  label: string;
};

function summarize(
  result: Awaited<ReturnType<typeof createTasksFromIntakePoints>>,
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

export function IntakeTaskButtons({
  leadId,
  points,
}: {
  leadId: string;
  points: IntakeTaskPoint[];
}) {
  const [isPending, startTransition] = useTransition();
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "ok" | "info" | "error";
    text: string;
  } | null>(null);

  if (points.length === 0) return null;

  const run = (codes: string[], marker: string) => {
    setPendingCode(marker);
    setFeedback(null);
    startTransition(async () => {
      const result = await createTasksFromIntakePoints(leadId, codes);
      setFeedback(summarize(result));
      setPendingCode(null);
    });
  };

  const allCodes = points.map((p) => p.code);

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        {points.map((p) => (
          <Button
            key={p.code}
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => run([p.code], p.code)}
          >
            {pendingCode === p.code ? "Bezig…" : `Taak: ${p.label}`}
          </Button>
        ))}
      </div>

      {points.length > 1 ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={isPending}
          onClick={() => run(allCodes, "__all__")}
        >
          {pendingCode === "__all__"
            ? "Bezig…"
            : "Alle aandachtspunten omzetten naar taken"}
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
