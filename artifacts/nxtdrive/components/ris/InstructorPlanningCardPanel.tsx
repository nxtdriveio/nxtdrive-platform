"use client";

import { useState, useTransition } from "react";
import { Loader2, Send, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { upsertPlanningCardAction } from "@/lib/ris/actions";
import type { PlanningCard } from "@/lib/ris/data";

type GoalState = {
  title: string;
  description: string;
};

export function InstructorPlanningCardPanel({
  lessonId,
  studentId,
  studentName,
  planningCard,
}: {
  lessonId: string;
  studentId: string;
  studentName: string;
  planningCard: PlanningCard | null;
}) {
  const [summary, setSummary] = useState(planningCard?.studentVisibleSummary ?? "");
  const [goals, setGoals] = useState<GoalState[]>(
    planningCard?.goals.length
      ? planningCard.goals.map((goal) => ({
          title: goal.title,
          description: goal.description ?? "",
        }))
      : [
          { title: "", description: "" },
          { title: "", description: "" },
        ],
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function updateGoal(index: number, patch: Partial<GoalState>) {
    setGoals((current) =>
      current.map((goal, goalIndex) =>
        goalIndex === index ? { ...goal, ...patch } : goal,
      ),
    );
  }

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await upsertPlanningCardAction({
        id: planningCard?.id ?? null,
        studentId,
        nextLessonId: lessonId,
        studentVisibleSummary: summary,
        sharedWithStudent: true,
        goals: goals
          .map((goal) => ({
            title: goal.title,
            description: goal.description,
            status: "active" as const,
          }))
          .filter((goal) => goal.title.trim().length > 0),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
    });
  }

  return (
    <Card id="ris-plankaart" className="scroll-mt-24 overflow-hidden">
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-primary">
              <Target className="h-4 w-4" aria-hidden />
              Plankaart
            </div>
            <h2 className="mt-1 text-xl font-black text-foreground">
              Volgende focus voor {studentName}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Deel vooraf concrete lesdoelen met de leerling. Deze kaart is direct
              zichtbaar in de leerlingapp zodra je opslaat.
            </p>
          </div>
          {planningCard?.sharedAt ? (
            <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
              Gedeeld
            </span>
          ) : null}
        </div>

        <Textarea
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          rows={3}
          maxLength={1200}
          placeholder="Korte voorbereiding voor de leerling..."
        />

        <div className="grid gap-3 md:grid-cols-2">
          {goals.map((goal, index) => (
            <div key={index} className="space-y-2 rounded-2xl border border-border bg-muted/20 p-3">
              <Input
                value={goal.title}
                onChange={(event) => updateGoal(index, { title: event.target.value })}
                maxLength={160}
                placeholder={`Doel ${index + 1}`}
              />
              <Textarea
                value={goal.description}
                onChange={(event) => updateGoal(index, { description: event.target.value })}
                rows={2}
                maxLength={500}
                placeholder="Korte toelichting"
              />
            </div>
          ))}
        </div>

        {error ? (
          <p className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
            Plankaart is gedeeld met de leerling.
          </p>
        ) : null}

        <Button
          type="button"
          variant="primary"
          disabled={isPending}
          onClick={save}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="h-4 w-4" aria-hidden />
          )}
          Plankaart delen
        </Button>
      </CardContent>
    </Card>
  );
}
