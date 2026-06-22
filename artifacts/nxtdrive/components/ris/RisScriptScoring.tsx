"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  BookOpenCheck,
  ChevronDown,
  Info,
  Loader2,
  Minus,
  Pin,
  Plus,
  Tags,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { setRisConceptScoreAction } from "@/lib/ris/actions";
import {
  type RISStepValue,
  type RISTreeModule,
  type RISTreeScript,
} from "@workspace/leskaart";
import type {
  InstructorRisLessonCard,
  RisScriptAssessment,
} from "@/lib/ris/data";

type ScriptView = {
  module: RISTreeModule;
  script: RISTreeScript;
  assessment: RisScriptAssessment | null;
};

const MIN_SCORE = 1;
const MAX_SCORE = 10;

function statusForStep(
  step: RISStepValue,
): NonNullable<Parameters<typeof setRisConceptScoreAction>[0]["status"]> {
  const numeric = Number(step);
  if (numeric <= 2) return "prepared";
  if (numeric <= 4) return "practiced";
  if (numeric <= 5) return "progressing";
  if (numeric <= 6) return "independent";
  if (numeric <= 7) return "mastered";
  return "ready_for_test";
}

function stepIndex(step: RISStepValue | null): number {
  if (!step) return 0;
  return Number(step);
}

function stepFromIndex(index: number): RISStepValue | null {
  if (index < MIN_SCORE) return null;
  return String(Math.min(MAX_SCORE, Math.max(MIN_SCORE, index))) as RISStepValue;
}

function shiftStep(step: RISStepValue | null, delta: -1 | 1): RISStepValue {
  if (!step && delta > 0) return "1";
  if (!step) return "1";
  return stepFromIndex(stepIndex(step) + delta) ?? "1";
}

function visibleStep(assessment: RisScriptAssessment | null): RISStepValue | null {
  return (
    assessment?.conceptRisStep ??
    assessment?.finalRisStep ??
    assessment?.previousRisStep ??
    null
  );
}

function summaryTagCount(assessment: RisScriptAssessment | null): number {
  return [
    assessment?.isFeaturedForLesson,
    assessment?.isAttentionPoint,
    assessment?.shouldRepeat,
    assessment?.readyForTest,
  ].filter(Boolean).length;
}

function optimisticAssessment({
  lessonCardId,
  script,
  current,
  step,
  isAttentionPoint,
  isFeaturedForLesson,
  shouldRepeat,
  readyForTest,
}: {
  lessonCardId: string | null;
  script: RISTreeScript;
  current: RisScriptAssessment | null;
  step: RISStepValue;
  isAttentionPoint: boolean;
  isFeaturedForLesson: boolean;
  shouldRepeat: boolean;
  readyForTest: boolean;
}): RisScriptAssessment {
  return {
    id: current?.id ?? `optimistic-${script.id}`,
    lessonCardId: current?.lessonCardId ?? lessonCardId ?? "",
    scriptId: script.id,
    scriptVariantId: current?.scriptVariantId ?? null,
    previousRisStep: current?.previousRisStep ?? null,
    conceptRisStep: step,
    finalRisStep: current?.finalRisStep ?? null,
    status: isAttentionPoint ? "needs_attention" : statusForStep(step),
    isAttentionPoint,
    isFeaturedForLesson,
    shouldRepeat,
    readyForTest,
    instructorNote: current?.instructorNote ?? null,
    studentVisibleNote: current?.studentVisibleNote ?? null,
  };
}

export function RisScriptScoring({
  lessonId,
  studentName,
  ris,
  onAssessmentsChange,
}: {
  lessonId: string;
  studentName: string;
  ris: InstructorRisLessonCard;
  onAssessmentsChange?: (assessments: RisScriptAssessment[]) => void;
}) {
  const [assessments, setAssessments] = useState(ris.assessments);
  const [pendingScriptId, setPendingScriptId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setAssessments(ris.assessments);
  }, [ris.assessments]);

  const assessmentByScript = useMemo(() => {
    const map = new Map<string, RisScriptAssessment>();
    for (const assessment of assessments) {
      map.set(assessment.scriptId, assessment);
    }
    return map;
  }, [assessments]);

  const modules = useMemo(() => {
    return ris.catalog.tree.map((module) => {
      const scripts: ScriptView[] = [];
      for (const category of module.categories) {
        for (const script of category.scripts) {
          scripts.push({
            module,
            script,
            assessment: assessmentByScript.get(script.id) ?? null,
          });
        }
      }
      return { module, scripts };
    });
  }, [assessmentByScript, ris.catalog.tree]);

  const allScripts = modules.flatMap((module) => module.scripts);
  const scoredCount = allScripts.filter((item) => visibleStep(item.assessment) !== null).length;
  const focusCount = allScripts.filter((item) => item.assessment?.isFeaturedForLesson).length;
  const attentionCount = allScripts.filter((item) => item.assessment?.isAttentionPoint).length;
  const locked = ris.card
    ? !["draft", "completion_in_progress", "ready_to_publish"].includes(
        ris.card.publicationStatus,
      )
    : false;

  function saveScript(input: {
    script: RISTreeScript;
    step?: RISStepValue;
    attention?: boolean;
    focus?: boolean;
    repeat?: boolean;
    ready?: boolean;
  }) {
    const current = assessmentByScript.get(input.script.id) ?? null;
    const step = input.step ?? visibleStep(current);
    if (!step) {
      setError("Kies eerst een RIS-score van 1 t/m 10 voordat je labels opslaat.");
      return;
    }
    const isAttentionPoint = input.attention ?? current?.isAttentionPoint ?? false;
    const isFeaturedForLesson = input.focus ?? current?.isFeaturedForLesson ?? false;
    const shouldRepeat = input.repeat ?? current?.shouldRepeat ?? false;
    const readyForTest = input.ready ?? current?.readyForTest ?? false;
    const previousAssessments = assessments;
    const nextAssessment = optimisticAssessment({
      lessonCardId: ris.card?.id ?? null,
      script: input.script,
      current,
      step,
      isAttentionPoint,
      isFeaturedForLesson,
      shouldRepeat,
      readyForTest,
    });

    setAssessments((currentAssessments) => {
      const exists = currentAssessments.some((item) => item.scriptId === input.script.id);
      const next = !exists
        ? [...currentAssessments, nextAssessment]
        : currentAssessments.map((item) =>
        item.scriptId === input.script.id ? nextAssessment : item,
      );
      onAssessmentsChange?.(next);
      return next;
    });
    setError(null);
    setPendingScriptId(input.script.id);
    startTransition(async () => {
      const result = await setRisConceptScoreAction({
        lessonId,
        scriptId: input.script.id,
        conceptRisStep: step,
        status: isAttentionPoint ? "needs_attention" : statusForStep(step),
        isAttentionPoint,
        isFeaturedForLesson,
        shouldRepeat,
        readyForTest,
        instructorNote: current?.instructorNote ?? null,
        studentVisibleNote: current?.studentVisibleNote ?? null,
      });
      if (result.error) {
        setError(result.error);
        setAssessments(previousAssessments);
        onAssessmentsChange?.(previousAssessments);
      } else {
        const assessmentId = "assessmentId" in result ? result.assessmentId : undefined;
        if (!assessmentId) {
          setPendingScriptId(null);
          return;
        }
        setAssessments((currentAssessments) =>
          {
            const next = currentAssessments.map((item) =>
            item.scriptId === input.script.id
              ? { ...item, id: assessmentId }
              : item,
            );
            onAssessmentsChange?.(next);
            return next;
          },
        );
      }
      setPendingScriptId(null);
    });
  }

  return (
    <Card id="ris-leskaart" className="scroll-mt-24 overflow-hidden">
      <CardContent className="space-y-5 pt-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase text-primary">
              <BookOpenCheck className="h-4 w-4" aria-hidden />
              RIS-leskaart
            </div>
            <h2 className="mt-1 text-xl font-black text-foreground">
              Beoordeling voor {studentName}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Werk per module de actuele RIS-score bij. Alle modules staan standaard
              ingeklapt zodat de leskaart compact blijft.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[22rem]">
            <Metric value={scoredCount} label="Concepten" />
            <Metric value={focusCount} label="Focus" />
            <Metric value={attentionCount} label="Aandacht" />
          </div>
        </div>

        {locked ? (
          <div className="rounded-xl border border-success/40 bg-success/10 p-3 text-sm text-success">
            Deze RIS-leskaart is gepubliceerd. Conceptscores zijn vergrendeld.
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
            {error}
          </div>
        ) : null}

        {ris.catalog.tree.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Er is nog geen RIS-catalogus beschikbaar voor deze tenant.
          </div>
        ) : (
          <div className="space-y-3">
            {modules.map(({ module, scripts }) => {
              const moduleScored = scripts.filter((item) => visibleStep(item.assessment) !== null).length;
              const moduleAttention = scripts.filter((item) => item.assessment?.isAttentionPoint).length;
              return (
                <details
                  key={module.id}
                  className="group rounded-2xl border border-border bg-card/75 shadow-sm"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="primary">Module {module.moduleNumber}</Badge>
                        {moduleAttention > 0 ? (
                          <Badge variant="warning">{moduleAttention} aandacht</Badge>
                        ) : null}
                      </div>
                      <div className="mt-1 truncate text-sm font-black text-foreground">
                        {module.title}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs font-bold text-muted-foreground">
                        {moduleScored} / {scripts.length}
                      </span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open:rotate-180" aria-hidden />
                    </div>
                  </summary>
                  <div className="divide-y divide-border border-t border-border">
                    {scripts.map(({ script, assessment }) => {
                      const step = visibleStep(assessment);
                      const pending = pendingScriptId === script.id;
                      const tagCount = summaryTagCount(assessment);
                      const currentIndex = stepIndex(step);
                      const tooltip = script.descriptionShort ?? "Geen extra scriptinformatie.";
                      return (
                        <div
                          key={script.id}
                          className={cn(
                            "grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center",
                            assessment?.isAttentionPoint && "bg-warning/5",
                            assessment?.isFeaturedForLesson && "bg-primary-soft/25",
                          )}
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                title={tooltip}
                                className="inline-flex min-w-0 items-center gap-2 text-left text-sm font-black text-foreground"
                              >
                                <span className="shrink-0 text-primary">{script.code}:</span>
                                <span className="truncate">{script.title}</span>
                                <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                              </button>
                              {assessment?.isFeaturedForLesson ? (
                                <Badge variant="info" className="gap-1">
                                  <Pin className="h-3 w-3" aria-hidden />
                                  Focus
                                </Badge>
                              ) : null}
                              {assessment?.isAttentionPoint ? (
                                <Badge variant="warning">Aandacht</Badge>
                              ) : null}
                              {assessment?.shouldRepeat ? (
                                <Badge variant="outline">Herhalen</Badge>
                              ) : null}
                              {assessment?.readyForTest ? (
                                <Badge variant="success">Toetsklaar</Badge>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                            <div className="flex items-center gap-1 rounded-xl border border-border bg-background/70 p-1">
                              <button
                                type="button"
                                disabled={locked || pending || !step || currentIndex <= MIN_SCORE}
                                onClick={() => saveScript({ script, step: shiftStep(step, -1) })}
                                aria-label={`Verlaag score voor ${script.title}`}
                                className={cn(
                                  "grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-primary",
                                  (locked || pending || !step || currentIndex <= MIN_SCORE) &&
                                    "cursor-not-allowed opacity-45",
                                )}
                              >
                                <Minus className="h-4 w-4" aria-hidden />
                              </button>
                              <span className="grid h-8 min-w-16 place-items-center rounded-lg bg-card px-3 text-sm font-black text-foreground">
                                {pending ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
                                ) : step ? (
                                  `${step}/10`
                                ) : (
                                  "Geen score"
                                )}
                              </span>
                              <button
                                type="button"
                                disabled={locked || pending || currentIndex >= MAX_SCORE}
                                onClick={() => saveScript({ script, step: shiftStep(step, 1) })}
                                aria-label={`Verhoog score voor ${script.title}`}
                                className={cn(
                                  "grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-primary",
                                  (locked || pending || currentIndex >= MAX_SCORE) &&
                                    "cursor-not-allowed opacity-45",
                                )}
                              >
                                <Plus className="h-4 w-4" aria-hidden />
                              </button>
                            </div>
                            <SummaryTagDropdown
                              count={tagCount}
                              assessment={assessment}
                              disabled={locked || pending}
                              onToggle={(patch) =>
                                saveScript({
                                  script,
                                  ...patch,
                                })
                              }
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <div className="text-lg font-black text-foreground">{value}</div>
      <div className="text-[0.68rem] uppercase text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function SummaryTagDropdown({
  assessment,
  count,
  disabled,
  onToggle,
}: {
  assessment: RisScriptAssessment | null;
  count: number;
  disabled?: boolean;
  onToggle: (patch: {
    attention?: boolean;
    focus?: boolean;
    repeat?: boolean;
    ready?: boolean;
  }) => void;
}) {
  const options = [
    {
      label: "Focus",
      active: Boolean(assessment?.isFeaturedForLesson),
      patch: { focus: !assessment?.isFeaturedForLesson },
    },
    {
      label: "Aandacht",
      active: Boolean(assessment?.isAttentionPoint),
      patch: { attention: !assessment?.isAttentionPoint },
    },
    {
      label: "Herhalen",
      active: Boolean(assessment?.shouldRepeat),
      patch: { repeat: !assessment?.shouldRepeat },
    },
    {
      label: "Toetsklaar",
      active: Boolean(assessment?.readyForTest),
      patch: { ready: !assessment?.readyForTest },
    },
  ];

  return (
    <details className="group relative">
      <summary
        aria-label="Labels kiezen"
        className={cn(
          "flex h-10 cursor-pointer list-none items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-black text-foreground shadow-sm transition hover:border-primary/50",
          "[&::-webkit-details-marker]:hidden",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <Tags className="h-4 w-4 text-primary" aria-hidden />
        <span>Labels</span>
        <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-[0.65rem] text-primary">
          {count}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open:rotate-180" aria-hidden />
      </summary>
      <div className="absolute right-0 z-20 mt-2 grid w-52 gap-1 rounded-2xl border border-border bg-popover p-2 shadow-brand-card">
        {options.map((option) => (
          <button
            key={option.label}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(option.patch)}
            className={cn(
              "flex items-center justify-between rounded-xl border px-3 py-2 text-left text-xs font-bold transition",
              option.active
                ? "border-primary/40 bg-primary-soft text-primary"
                : "border-transparent bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            {option.label}
            <span
              className={cn(
                "h-2.5 w-2.5 rounded-full border",
                option.active ? "border-primary bg-primary" : "border-muted-foreground/40",
              )}
            />
          </button>
        ))}
      </div>
    </details>
  );
}
