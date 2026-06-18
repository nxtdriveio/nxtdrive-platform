"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpenCheck,
  ChevronDown,
  Loader2,
  Minus,
  Pin,
  Plus,
  Sparkles,
  Tags,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { setRisConceptScoreAction } from "@/lib/ris/actions";
import {
  translateRisStepForStudent,
  type RISStepValue,
  type RISTreeModule,
  type RISTreeScript,
} from "@workspace/leskaart";
import type {
  InstructorRisLessonCard,
  RisScriptAssessment,
} from "@/lib/ris/data";

type FilterKey = "all" | "focus" | "attention" | `module-${1 | 2 | 3 | 4}`;

type ScriptView = {
  module: RISTreeModule;
  script: RISTreeScript;
  assessment: RisScriptAssessment | null;
};

const MIN_STEP_INDEX = 0;
const MAX_STEP_INDEX = 8;

function statusForStep(step: RISStepValue): Parameters<typeof setRisConceptScoreAction>[0]["status"] {
  if (step === "N") return "not_started";
  const numeric = Number(step);
  if (numeric <= 2) return "prepared";
  if (numeric <= 4) return "practiced";
  if (numeric === 5) return "progressing";
  if (numeric === 6) return "independent";
  if (numeric === 7) return "mastered";
  return "ready_for_test";
}

function stepIndex(step: RISStepValue | null): number {
  if (!step || step === "N") return MIN_STEP_INDEX;
  return Number(step);
}

function stepFromIndex(index: number): RISStepValue {
  if (index <= MIN_STEP_INDEX) return "N";
  return String(Math.min(MAX_STEP_INDEX, Math.max(1, index))) as RISStepValue;
}

function shiftStep(step: RISStepValue, delta: -1 | 1): RISStepValue {
  return stepFromIndex(stepIndex(step) + delta);
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

function filterLabel(filter: FilterKey): string {
  if (filter === "all") return "Alles";
  if (filter === "focus") return "Focus";
  if (filter === "attention") return "Aandacht";
  return `Module ${filter.replace("module-", "")}`;
}

export function RisScriptScoring({
  lessonId,
  studentName,
  ris,
}: {
  lessonId: string;
  studentName: string;
  ris: InstructorRisLessonCard;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [pendingScriptId, setPendingScriptId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const assessmentByScript = useMemo(() => {
    const map = new Map<string, RisScriptAssessment>();
    for (const assessment of ris.assessments) {
      map.set(assessment.scriptId, assessment);
    }
    return map;
  }, [ris.assessments]);

  const scripts = useMemo<ScriptView[]>(() => {
    const out: ScriptView[] = [];
    for (const module of ris.catalog.tree) {
      for (const category of module.categories) {
        for (const script of category.scripts) {
          out.push({
            module,
            script,
            assessment: assessmentByScript.get(script.id) ?? null,
          });
        }
      }
    }
    return out;
  }, [assessmentByScript, ris.catalog.tree]);

  const filteredScripts = scripts.filter(({ module, assessment }) => {
    if (filter === "all") return true;
    if (filter === "focus") return Boolean(assessment?.isFeaturedForLesson);
    if (filter === "attention") {
      return Boolean(
        assessment?.isAttentionPoint ||
          assessment?.shouldRepeat ||
          assessment?.status === "needs_attention",
      );
    }
    return module.moduleNumber === Number(filter.replace("module-", ""));
  });

  const scoredCount = scripts.filter((item) => visibleStep(item.assessment) !== null).length;
  const focusCount = scripts.filter((item) => item.assessment?.isFeaturedForLesson).length;
  const attentionCount = scripts.filter((item) => item.assessment?.isAttentionPoint).length;
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
    const step = input.step ?? visibleStep(current) ?? "N";
    const isAttentionPoint = input.attention ?? current?.isAttentionPoint ?? false;
    const isFeaturedForLesson = input.focus ?? current?.isFeaturedForLesson ?? false;
    const shouldRepeat = input.repeat ?? current?.shouldRepeat ?? false;
    const readyForTest = input.ready ?? current?.readyForTest ?? false;

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
      } else {
        router.refresh();
      }
      setPendingScriptId(null);
    });
  }

  return (
    <Card id="ris-leskaart" className="scroll-mt-24 overflow-hidden">
      <CardContent className="space-y-5 pt-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-primary">
              <BookOpenCheck className="h-4 w-4" aria-hidden />
              RIS-leskaart
            </div>
            <h2 className="mt-1 text-xl font-black text-foreground">
              Scriptbeoordeling voor {studentName}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Leg per RIS-script een conceptstap vast. Conceptscores blijven intern
              totdat de leskaart later bewust wordt gepubliceerd.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[22rem]">
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <div className="text-lg font-black text-foreground">{scoredCount}</div>
              <div className="text-[0.68rem] uppercase tracking-wider text-muted-foreground">
                Concepten
              </div>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <div className="text-lg font-black text-foreground">{focusCount}</div>
              <div className="text-[0.68rem] uppercase tracking-wider text-muted-foreground">
                Focus
              </div>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <div className="text-lg font-black text-foreground">{attentionCount}</div>
              <div className="text-[0.68rem] uppercase tracking-wider text-muted-foreground">
                Aandacht
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(["all", "focus", "attention", "module-1", "module-2", "module-3", "module-4"] as FilterKey[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                filter === item
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground",
              )}
            >
              {filterLabel(item)}
            </button>
          ))}
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
        ) : filteredScripts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center">
            <Sparkles className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden />
            <div className="font-semibold text-foreground">
              Geen scripts in filter "{filterLabel(filter)}"
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Markeer scripts als focus of aandachtspunt, of schakel naar Alles.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredScripts.map(({ module, script, assessment }) => {
              const step = visibleStep(assessment) ?? "N";
              const definition = translateRisStepForStudent(step, ris.catalog.steps);
              const pending = pendingScriptId === script.id;
              const hasConcept = assessment?.conceptRisStep != null;
              const tagCount = summaryTagCount(assessment);
              const currentIndex = stepIndex(step);
              return (
                <article
                  key={script.id}
                  className={cn(
                    "rounded-2xl border border-border bg-card/75 p-3 shadow-sm",
                    assessment?.isAttentionPoint && "border-warning/50 bg-warning/5",
                    assessment?.isFeaturedForLesson && "ring-1 ring-primary/30",
                  )}
                >
                  <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">Module {module.moduleNumber}</Badge>
                        <Badge variant={hasConcept ? "primary" : "outline"}>
                          {script.code}
                        </Badge>
                        {assessment?.isFeaturedForLesson ? (
                          <Badge variant="info" className="gap-1">
                            <Pin className="h-3 w-3" aria-hidden />
                            Focus
                          </Badge>
                        ) : null}
                        {assessment?.isAttentionPoint ? (
                          <Badge variant="warning">Aandacht</Badge>
                        ) : null}
                        {assessment?.readyForTest ? (
                          <Badge variant="success">Toetsklaar</Badge>
                        ) : null}
                      </div>
                      <h3 className="mt-2 text-sm font-black text-foreground sm:text-base">
                        {script.title}
                      </h3>
                      {script.descriptionShort ? (
                        <p className="mt-1 text-xs leading-5 text-muted-foreground sm:text-sm">
                          {script.descriptionShort}
                        </p>
                      ) : null}
                      {script.variants.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {script.variants.map((variant) => (
                            <span
                              key={variant.id}
                              className="rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[0.68rem] text-muted-foreground"
                            >
                              {variant.code}: {variant.title}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center xl:flex-col xl:items-stretch">
                      <div className="flex min-w-[13rem] items-center justify-between gap-2 rounded-2xl border border-border bg-background/70 p-1.5">
                        <button
                          type="button"
                          disabled={locked || pending || currentIndex === MIN_STEP_INDEX}
                          onClick={() => saveScript({ script, step: shiftStep(step, -1) })}
                          aria-label={`Verlaag score voor ${script.title}`}
                          className={cn(
                            "grid h-9 w-9 place-items-center rounded-xl border border-border bg-card text-muted-foreground transition hover:border-primary/50 hover:text-primary",
                            (locked || pending || currentIndex === MIN_STEP_INDEX) &&
                              "cursor-not-allowed opacity-45",
                          )}
                        >
                          <Minus className="h-4 w-4" aria-hidden />
                        </button>
                        <div className="min-w-0 flex-1 px-1 text-center">
                          <div className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                            Score
                          </div>
                          <div className="mt-0.5 text-xl font-black text-foreground">
                            {pending ? (
                              <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" aria-hidden />
                            ) : (
                              step
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={locked || pending || currentIndex === MAX_STEP_INDEX}
                          onClick={() => saveScript({ script, step: shiftStep(step, 1) })}
                          aria-label={`Verhoog score voor ${script.title}`}
                          className={cn(
                            "grid h-9 w-9 place-items-center rounded-xl border border-border bg-card text-muted-foreground transition hover:border-primary/50 hover:text-primary",
                            (locked || pending || currentIndex === MAX_STEP_INDEX) &&
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

                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {definition.instructorLabel}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
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
        className={cn(
          "flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 rounded-2xl border border-border bg-card px-3 text-xs font-black text-foreground shadow-sm transition hover:border-primary/50",
          "[&::-webkit-details-marker]:hidden",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <span className="inline-flex items-center gap-2">
          <Tags className="h-4 w-4 text-primary" aria-hidden />
          Samenvatting
        </span>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          {count}
          <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden />
        </span>
      </summary>
      <div className="absolute right-0 z-20 mt-2 grid w-52 gap-1 rounded-2xl border border-border bg-popover p-2 shadow-brand-floating">
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
