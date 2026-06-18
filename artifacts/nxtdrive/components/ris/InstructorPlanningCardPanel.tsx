"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Loader2, Send, Target, WandSparkles } from "lucide-react";
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

const GOAL_SLOT_COUNT = 3;

function initialGoals(planningCard: PlanningCard | null): GoalState[] {
  const goals =
    planningCard?.goals.map((goal) => ({
      title: goal.title,
      description: goal.description ?? "",
    })) ?? [];

  while (goals.length < GOAL_SLOT_COUNT) {
    goals.push({ title: "", description: "" });
  }

  return goals.slice(0, GOAL_SLOT_COUNT);
}

export function InstructorPlanningCardPanel({
  lessonId,
  studentId,
  studentName,
  planningCard,
  goalOptions,
  studentLearningWish,
}: {
  lessonId: string;
  studentId: string;
  studentName: string;
  planningCard: PlanningCard | null;
  goalOptions: string[];
  studentLearningWish?: string | null;
}) {
  const [planningCardId, setPlanningCardId] = useState(planningCard?.id ?? null);
  const [summary, setSummary] = useState(planningCard?.studentVisibleSummary ?? "");
  const [goals, setGoals] = useState<GoalState[]>(() => initialGoals(planningCard));
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    planningCard ? "saved" : "idle",
  );
  const [sharedWithStudent, setSharedWithStudent] = useState(
    planningCard?.sharedWithStudent ?? false,
  );
  const [isPending, startTransition] = useTransition();
  const datalistId = `ris-goal-options-${lessonId}`;
  const normalizedGoalOptions = useMemo(
    () => Array.from(new Set([...goalOptions, "Anders..."])),
    [goalOptions],
  );
  const draftSignature = JSON.stringify({ summary, goals });
  const lastSavedSignature = useRef(draftSignature);

  function updateGoal(index: number, patch: Partial<GoalState>) {
    setGoals((current) =>
      current.map((goal, goalIndex) =>
        goalIndex === index ? { ...goal, ...patch } : goal,
      ),
    );
  }

  async function persist({ share }: { share: boolean }) {
    const result = await upsertPlanningCardAction({
      id: planningCardId,
      studentId,
      nextLessonId: lessonId,
      studentVisibleSummary: summary,
      sharedWithStudent: share,
      goals: goals
        .map((goal) => ({
          title: goal.title,
          description: goal.description,
          status: "active" as const,
        }))
        .filter((goal) => goal.title.trim().length > 0),
    });
    if ("error" in result && result.error) {
      setError(result.error);
      setSaveState("idle");
      return null;
    }
    const nextPlanningCardId =
      "planningCardId" in result ? result.planningCardId : undefined;
    if (nextPlanningCardId) {
      setPlanningCardId(nextPlanningCardId);
    }
    lastSavedSignature.current = draftSignature;
    setSaveState("saved");
    if (share) setSharedWithStudent(true);
    return nextPlanningCardId ?? planningCardId;
  }

  useEffect(() => {
    if (draftSignature === lastSavedSignature.current) return;
    setError(null);
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      void persist({ share: sharedWithStudent });
    }, 900);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftSignature, sharedWithStudent]);

  function sharePlanningCard() {
    setError(null);
    setSaveState("saving");
    startTransition(async () => {
      await persist({ share: true });
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
          ) : saveState === "saving" ? (
            <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
              Concept opslaan...
            </span>
          ) : saveState === "saved" ? (
            <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
              Concept opgeslagen
            </span>
          ) : null}
        </div>

        {studentLearningWish ? (
          <div className="rounded-2xl border border-primary/20 bg-primary-soft/40 p-4">
            <div className="flex items-center gap-2 text-sm font-black text-foreground">
              <WandSparkles className="h-4 w-4 text-primary" aria-hidden />
              Leerwens leerling na vorige les
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {studentLearningWish}
            </p>
          </div>
        ) : null}

        <Textarea
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          rows={3}
          maxLength={1200}
          placeholder="Korte voorbereiding voor de leerling..."
        />

        <datalist id={datalistId}>
          {normalizedGoalOptions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>

        <div className="grid gap-3 lg:grid-cols-3">
          {goals.map((goal, index) => (
            <div key={index} className="space-y-2 rounded-2xl border border-border bg-muted/20 p-3">
              <Input
                value={goal.title}
                onChange={(event) => updateGoal(index, { title: event.target.value })}
                list={datalistId}
                maxLength={160}
                placeholder={`Doel ${index + 1} kiezen of typen`}
              />
              <Textarea
                value={goal.description}
                onChange={(event) => updateGoal(index, { description: event.target.value })}
                rows={2}
                maxLength={500}
                placeholder="Korte toelichting (optioneel)"
              />
            </div>
          ))}
        </div>

        {error ? (
          <p className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        {sharedWithStudent ? (
          <p className="rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
            Plankaart is gedeeld met de leerling.
          </p>
        ) : null}

        <Button
          type="button"
          variant="primary"
          disabled={isPending}
          onClick={sharePlanningCard}
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
