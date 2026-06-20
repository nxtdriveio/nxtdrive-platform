"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCircle2,
  ShieldAlert,
  ListChecks,
  Gauge,
  StickyNote,
  Flag,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  setSkillScoreAction,
  setLessonProgressAction,
  completeLessonAction,
} from "@/app/instructor/actions";
import type { InstructorLeskaart } from "@/lib/skills/leskaart-data";

type FlatLeaf = {
  id: string;
  label: string;
  categoryLabel: string;
  subLabel: string;
  isCritical: boolean;
  currentScore: number | null;
  todayScore: number | null;
};

const STEPS = [
  { key: "skills", label: "Onderdelen", icon: ListChecks },
  { key: "scores", label: "Scores", icon: Gauge },
  { key: "note", label: "Notitie", icon: StickyNote },
  { key: "confirm", label: "Afronden", icon: Flag },
] as const;

/**
 * Tablet-landscape, step-by-step "les afronden" flow (PWA canon §"Les Afronden
 * Flow"): pick the skills practiced → tap a 1–10 score per skill → add an
 * overall note/score → confirm. Reuses the existing locked server actions only
 * (setSkillScoreAction per tap, setLessonProgressAction for the note step,
 * completeLessonAction to finish) — no new financial/ledger paths. Skill scores
 * and the progress note persist as you go, so an interrupted flow loses nothing.
 */
export function FinishLessonFlow({
  lessonId,
  studentName,
  leskaart,
  currentScore,
  currentSummary,
}: {
  lessonId: string;
  studentName: string;
  leskaart: InstructorLeskaart;
  currentScore: number | null;
  currentSummary: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const flatLeaves = useMemo<FlatLeaf[]>(() => {
    const out: FlatLeaf[] = [];
    for (const cat of leskaart.categories) {
      for (const sub of cat.subcategories) {
        for (const leaf of sub.leaves) {
          out.push({
            id: leaf.id,
            label: leaf.label,
            categoryLabel: cat.label,
            subLabel: sub.label,
            isCritical: leaf.isCritical,
            currentScore: leaf.currentScore,
            todayScore: leaf.todayScore,
          });
        }
      }
    }
    return out;
  }, [leskaart]);

  // Pre-select skills already graded during this lesson; pre-fill those scores.
  const [selected, setSelected] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const l of flatLeaves) if (l.todayScore != null) s.add(l.id);
    return s;
  });
  const [scores, setScores] = useState<Record<string, number | null>>(() => {
    const init: Record<string, number | null> = {};
    for (const l of flatLeaves) init[l.id] = l.todayScore;
    return init;
  });
  const [overall, setOverall] = useState<number | null>(currentScore);
  const [summary, setSummary] = useState<string>(currentSummary ?? "");

  // Lock body scroll while the overlay is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const selectedLeaves = useMemo(
    () => flatLeaves.filter((l) => selected.has(l.id)),
    [flatLeaves, selected],
  );
  const scoredCount = selectedLeaves.filter((l) => scores[l.id] != null).length;
  const allScored = scoredCount === selectedLeaves.length;

  function reset() {
    setStep(0);
    setError(null);
    setSavingId(null);
  }

  function toggleSkill(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function tapScore(id: string, value: number) {
    setError(null);
    setScores((cur) => ({ ...cur, [id]: value }));
    setSavingId(id);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("lesson_id", lessonId);
      fd.set("skill_id", id);
      fd.set("score", String(value));
      const res = await setSkillScoreAction(fd);
      if (res?.error) setError(res.error);
      setSavingId(null);
    });
  }

  function saveNoteAndContinue() {
    if (overall == null) {
      setError("Kies een eindscore voor deze les (1–10).");
      return;
    }
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("lesson_id", lessonId);
      fd.set("score", String(overall));
      fd.set("summary", summary.trim());
      const res = await setLessonProgressAction(fd);
      if (res?.error) {
        setError(res.error);
      } else {
        setStep(3);
      }
    });
  }

  const canNext =
    step === 0 ? true : step === 1 ? allScored : step === 2 ? overall != null : false;

  return (
    <>
      <Button
        type="button"
        size="lg"
        variant="outline"
        className="w-full"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <CheckCircle2 className="h-4 w-4" aria-hidden />
        Les afronden
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-stretch justify-center bg-background/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Les afronden"
        >
          <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-card shadow-brand-card sm:h-[min(92vh,52rem)] sm:max-w-5xl sm:rounded-2xl sm:border sm:border-border">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
              <div className="min-w-0">
                <div className="text-xs uppercase text-muted-foreground">
                  Les afronden
                </div>
                <div className="truncate text-sm font-semibold text-foreground">
                  {studentName}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Sluiten"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            {/* Body: step rail (left) + content (right) — tablet landscape split. */}
            <div className="flex min-h-0 flex-1">
              <nav className="hidden w-52 shrink-0 flex-col gap-1 border-r border-border bg-muted/30 p-3 md:flex lg:w-60">
                {STEPS.map((s, i) => {
                  const Icon = s.icon;
                  const done = i < step;
                  const active = i === step;
                  return (
                    <div
                      key={s.key}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm",
                        active
                          ? "bg-primary-soft font-medium text-primary"
                          : done
                            ? "text-foreground"
                            : "text-muted-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : done
                              ? "border-primary bg-primary-soft text-primary"
                              : "border-border bg-card text-muted-foreground",
                        )}
                      >
                        {done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
                      </span>
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      {s.label}
                    </div>
                  );
                })}
              </nav>

              {/* Mobile step indicator */}
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground md:hidden">
                  Stap {step + 1}/{STEPS.length} ·{" "}
                  <span className="font-medium text-foreground">
                    {STEPS[step].label}
                  </span>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                  {step === 0 ? (
                    <SkillsStep
                      leskaart={leskaart}
                      selected={selected}
                      onToggle={toggleSkill}
                    />
                  ) : null}

                  {step === 1 ? (
                    <ScoresStep
                      leaves={selectedLeaves}
                      scores={scores}
                      savingId={savingId}
                      onTap={tapScore}
                    />
                  ) : null}

                  {step === 2 ? (
                    <NoteStep
                      overall={overall}
                      summary={summary}
                      onOverall={setOverall}
                      onSummary={setSummary}
                    />
                  ) : null}

                  {step === 3 ? (
                    <ConfirmStep
                      selectedLeaves={selectedLeaves}
                      scores={scores}
                      overall={overall}
                      summary={summary}
                    />
                  ) : null}
                </div>

                {error ? (
                  <div className="mx-4 mb-2 rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger sm:mx-6">
                    {error}
                  </div>
                ) : null}

                {/* Footer nav */}
                <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-6">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setError(null);
                      if (step === 0) setOpen(false);
                      else setStep((s) => s - 1);
                    }}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                    {step === 0 ? "Annuleren" : "Vorige"}
                  </Button>

                  {step === 1 ? (
                    <span className="text-xs text-muted-foreground">
                      {scoredCount}/{selectedLeaves.length} beoordeeld
                    </span>
                  ) : null}

                  {step < 2 ? (
                    <Button
                      type="button"
                      disabled={!canNext}
                      onClick={() => {
                        setError(null);
                        setStep((s) => s + 1);
                      }}
                    >
                      Volgende
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </Button>
                  ) : step === 2 ? (
                    <Button
                      type="button"
                      disabled={overall == null || savingId != null}
                      onClick={saveNoteAndContinue}
                    >
                      Volgende
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </Button>
                  ) : (
                    <form action={completeLessonAction}>
                      <input type="hidden" name="lesson_id" value={lessonId} />
                      <Button type="submit" size="lg">
                        <Flag className="h-4 w-4" aria-hidden />
                        Rond les af
                      </Button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function SkillsStep({
  leskaart,
  selected,
  onToggle,
}: {
  leskaart: InstructorLeskaart;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          Welke onderdelen heb je geoefend?
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Tik de vaardigheden aan die je deze les wilt beoordelen. ({selected.size}{" "}
          geselecteerd)
        </p>
      </div>

      {leskaart.totalLeaves === 0 ? (
        <p className="text-sm text-muted-foreground">
          Deze rijschool heeft nog geen vaardigheden in de leskaart. Je kunt deze
          les nog steeds afronden met een notitie.
        </p>
      ) : (
        <div className="space-y-5">
          {leskaart.categories.map((cat) => (
            <div key={cat.id}>
              <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                {cat.label}
              </div>
              <div className="flex flex-wrap gap-2">
                {cat.subcategories.flatMap((sub) =>
                  sub.leaves.map((leaf) => {
                    const isSel = selected.has(leaf.id);
                    return (
                      <button
                        key={leaf.id}
                        type="button"
                        onClick={() => onToggle(leaf.id)}
                        aria-pressed={isSel}
                        className={cn(
                          "inline-flex min-h-11 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm transition-colors",
                          isSel
                            ? "border-primary bg-primary-soft font-medium text-primary"
                            : "border-border bg-card text-foreground hover:border-muted-foreground/40 hover:bg-muted",
                        )}
                      >
                        {leaf.isCritical ? (
                          <ShieldAlert
                            className="h-4 w-4 shrink-0 text-warning"
                            aria-label="Kritieke veiligheidsvaardigheid"
                          />
                        ) : null}
                        {leaf.label}
                        {isSel ? (
                          <Check className="h-4 w-4 shrink-0" aria-hidden />
                        ) : leaf.currentScore != null ? (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {leaf.currentScore}
                          </span>
                        ) : null}
                      </button>
                    );
                  }),
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScoresStep({
  leaves,
  scores,
  savingId,
  onTap,
}: {
  leaves: FlatLeaf[];
  scores: Record<string, number | null>;
  savingId: string | null;
  onTap: (id: string, value: number) => void;
}) {
  if (leaves.length === 0) {
    return (
      <div className="space-y-2">
        <h2 className="text-base font-semibold text-foreground">Scores</h2>
        <p className="text-sm text-muted-foreground">
          Je hebt geen onderdelen geselecteerd. Ga terug om onderdelen te kiezen,
          of ga verder naar de notitie.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          Geef een score (1–10)
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Tik per onderdeel het niveau van vandaag.
        </p>
      </div>

      <ul className="space-y-4">
        {leaves.map((leaf) => {
          const value = scores[leaf.id];
          const isSaving = savingId === leaf.id;
          return (
            <li key={leaf.id} className="rounded-xl border border-border p-3.5">
              <div className="mb-2.5 flex items-center gap-2">
                {leaf.isCritical ? (
                  <ShieldAlert
                    className="h-4 w-4 shrink-0 text-warning"
                    aria-label="Kritiek"
                  />
                ) : null}
                <span className="text-sm font-medium text-foreground">
                  {leaf.label}
                </span>
                {leaf.currentScore != null ? (
                  <span className="text-xs text-muted-foreground">
                    huidig {leaf.currentScore}
                  </span>
                ) : null}
                {isSaving ? (
                  <Loader2
                    className="ml-auto h-4 w-4 animate-spin text-muted-foreground"
                    aria-label="Opslaan…"
                  />
                ) : value != null ? (
                  <Check className="ml-auto h-4 w-4 text-primary" aria-hidden />
                ) : null}
              </div>
              <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                  const active = value === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => onTap(leaf.id, n)}
                      aria-pressed={active}
                      aria-label={`${leaf.label}: ${n}`}
                      className={cn(
                        "h-12 rounded-lg border text-base font-semibold tabular-nums transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground hover:border-muted-foreground/40 hover:bg-muted",
                      )}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NoteStep({
  overall,
  summary,
  onOverall,
  onSummary,
}: {
  overall: number | null;
  summary: string;
  onOverall: (n: number) => void;
  onSummary: (s: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          Eindscore &amp; notitie
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Geef een algemene lesscore en een korte toelichting voor de leerling.
        </p>
      </div>

      <div>
        <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
          Lesscore (1–10)
        </div>
        <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
            const active = overall === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => onOverall(n)}
                aria-pressed={active}
                aria-label={`Lesscore: ${n}`}
                className={cn(
                  "h-12 rounded-lg border text-base font-semibold tabular-nums transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-muted-foreground/40 hover:bg-muted",
                )}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label
          htmlFor="finish-summary"
          className="mb-2 block text-xs font-medium uppercase text-muted-foreground"
        >
          Toelichting
        </label>
        <Textarea
          id="finish-summary"
          rows={4}
          maxLength={2000}
          value={summary}
          onChange={(e) => onSummary(e.target.value)}
          placeholder="bv. Sturen in bochten gaat goed, parkeren oefenen volgende les."
        />
      </div>
    </div>
  );
}

function ConfirmStep({
  selectedLeaves,
  scores,
  overall,
  summary,
}: {
  selectedLeaves: FlatLeaf[];
  scores: Record<string, number | null>;
  overall: number | null;
  summary: string;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          Controleer en rond af
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          De scores en notitie zijn al opgeslagen. &quot;Rond les af&quot; sluit
          de les definitief.
        </p>
      </div>

      <div className="rounded-xl border border-border p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
          <Gauge className="h-4 w-4" aria-hidden />
          Lesscore
        </div>
        <div className="text-2xl font-semibold tabular-nums text-foreground">
          {overall ?? "—"}
          <span className="text-base font-normal text-muted-foreground">/10</span>
        </div>
        {summary.trim() ? (
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
            {summary.trim()}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Geen toelichting.</p>
        )}
      </div>

      <div className="rounded-xl border border-border p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
          <ListChecks className="h-4 w-4" aria-hidden />
          Beoordeelde onderdelen ({selectedLeaves.length})
        </div>
        {selectedLeaves.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Geen onderdelen beoordeeld deze les.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {selectedLeaves.map((leaf) => (
              <li
                key={leaf.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-foreground"
              >
                {leaf.isCritical ? (
                  <ShieldAlert
                    className="h-3 w-3 text-warning"
                    aria-label="Kritiek"
                  />
                ) : null}
                {leaf.label}
                <span className="font-semibold tabular-nums text-primary">
                  {scores[leaf.id] ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
