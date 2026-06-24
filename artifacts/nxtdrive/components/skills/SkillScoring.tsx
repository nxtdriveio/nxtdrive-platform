"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ShieldAlert,
  BookOpen,
  GraduationCap,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { setSkillScoreAction } from "@/app/instructor/actions";
import type { InstructorLeskaart } from "@/lib/skills/leskaart-data";

type LiveScore = { current: number | null; today: number | null };
const SCORE_VALUES = Array.from({ length: 8 }, (_, i) => i + 1);

/** Tablet-first instructor scoring grid: grouped, collapsible, 1-8 per skill. */
export function SkillScoring({
  lessonId,
  studentName,
  leskaart,
}: {
  lessonId: string;
  studentName: string;
  leskaart: InstructorLeskaart;
}) {
  const [scores, setScores] = useState<Record<string, LiveScore>>(() => {
    const init: Record<string, LiveScore> = {};
    for (const cat of leskaart.categories) {
      for (const sub of cat.subcategories) {
        for (const leaf of sub.leaves) {
          init[leaf.id] = { current: leaf.currentScore, today: leaf.todayScore };
        }
      }
    }
    return init;
  });
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const live = (id: string): LiveScore =>
    scores[id] ?? { current: null, today: null };

  // Live aggregates so the header/chips update right after a score is set.
  const { totalLeaves, scoredLeaves, today } = useMemo(() => {
    let total = 0;
    let scored = 0;
    const todayList: { id: string; label: string; score: number }[] = [];
    for (const cat of leskaart.categories) {
      for (const sub of cat.subcategories) {
        for (const leaf of sub.leaves) {
          total += 1;
          const s = live(leaf.id);
          if (s.current != null) scored += 1;
          if (s.today != null)
            todayList.push({ id: leaf.id, label: leaf.label, score: s.today });
        }
      }
    }
    todayList.sort((a, b) => a.label.localeCompare(b.label));
    return { totalLeaves: total, scoredLeaves: scored, today: todayList };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scores, leskaart]);

  const allExpanded = leskaart.categories.every((c) => open[c.id]);
  function toggleAll() {
    const next = !allExpanded;
    const map: Record<string, boolean> = {};
    for (const c of leskaart.categories) map[c.id] = next;
    setOpen(map);
  }

  function score(skillId: string, value: number) {
    const prev = scores[skillId] ?? { current: null, today: null };
    setError(null);
    setPendingId(skillId);
    setScores((cur) => ({ ...cur, [skillId]: { current: value, today: value } }));
    startTransition(async () => {
      const fd = new FormData();
      fd.set("lesson_id", lessonId);
      fd.set("skill_id", skillId);
      fd.set("score", String(value));
      const res = await setSkillScoreAction(fd);
      if (res?.error) {
        setError(res.error);
        setScores((cur) => ({ ...cur, [skillId]: prev }));
      } else {
        // Re-run the server component so the readiness verdict and carry-over
        // recompute from the new rollup.
        router.refresh();
      }
      setPendingId(null);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <GraduationCap className="h-4 w-4" aria-hidden />
              Leskaart — beoordeling
            </div>
            <p className="mt-0.5 text-sm text-foreground">
              {studentName} · {scoredLeaves}/{totalLeaves} vaardigheden beoordeeld
            </p>
          </div>
          <button
            type="button"
            onClick={toggleAll}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            {allExpanded ? "Alles inklappen" : "Alles uitklappen"}
          </button>
        </div>

        {today.length > 0 ? (
          <div className="rounded-lg border border-primary/30 bg-primary-soft/30 p-3">
            <div className="mb-1.5 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Vandaag geoefend ({today.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {today.map((t) => (
                <span
                  key={t.id}
                  className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-0.5 text-xs text-foreground shadow-sm"
                >
                  {t.label}
                  <span className="font-semibold tabular-nums text-primary">
                    {t.score}
                  </span>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        ) : null}

        {totalLeaves === 0 ? (
          <p className="text-sm text-muted-foreground">
            Deze rijschool heeft nog geen vaardigheden in de leskaart.
          </p>
        ) : (
          <ul className="space-y-2">
            {leskaart.categories.map((cat) => {
              const isOpen = Boolean(open[cat.id]);
              // Live per-category aggregates.
              let cScored = 0;
              let cCritBelow = 0;
              const cVals: number[] = [];
              for (const sub of cat.subcategories) {
                for (const leaf of sub.leaves) {
                  const s = live(leaf.id);
                  if (s.current != null) {
                    cScored += 1;
                    cVals.push(s.current);
                  }
                  if (leaf.isCritical && (s.current == null || s.current < 8)) {
                    cCritBelow += 1;
                  }
                }
              }
              const cAvg =
                cVals.length > 0
                  ? Math.round(
                      (cVals.reduce((a, b) => a + b, 0) / cVals.length) * 10,
                    ) / 10
                  : null;

              return (
                <li
                  key={cat.id}
                  className="overflow-hidden rounded-lg border border-border"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setOpen((cur) => ({ ...cur, [cat.id]: !cur[cat.id] }))
                    }
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-3 bg-muted/40 px-4 py-3 text-left hover:bg-muted"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                          isOpen && "rotate-180",
                        )}
                        aria-hidden
                      />
                      <span className="truncate text-sm font-medium text-foreground">
                        {cat.label}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {cCritBelow > 0 ? (
                        <Badge variant="warning" className="gap-1">
                          <ShieldAlert className="h-3 w-3" aria-hidden />
                          {cCritBelow}
                        </Badge>
                      ) : null}
                      {cAvg != null ? (
                        <span className="text-xs font-semibold tabular-nums text-foreground">
                          ⌀ {cAvg.toFixed(1)}
                        </span>
                      ) : null}
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {cScored}/{cat.totalLeaves}
                      </span>
                    </span>
                  </button>

                  {isOpen ? (
                    <div className="divide-y divide-border">
                      {cat.subcategories.map((sub) => (
                        <div key={sub.id} className="px-4 py-3">
                          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            {sub.label}
                          </div>
                          <ul className="space-y-3">
                            {sub.leaves.map((leaf) => {
                              const s = live(leaf.id);
                              const selected = s.today ?? s.current;
                              const isPending = pendingId === leaf.id;
                              return (
                                <li
                                  key={leaf.id}
                                  className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                                >
                                  <div className="flex min-w-0 items-center gap-2">
                                    {leaf.isCritical ? (
                                      <ShieldAlert
                                        className="h-4 w-4 shrink-0 text-warning"
                                        aria-label="Kritieke veiligheidsvaardigheid"
                                      />
                                    ) : null}
                                    <span className="truncate text-sm text-foreground">
                                      {leaf.label}
                                    </span>
                                    {leaf.theoryLink ? (
                                      <BookOpen
                                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                                        aria-label={`Theorie: ${leaf.theoryLink}`}
                                      />
                                    ) : null}
                                    {s.today != null ? (
                                      <Badge variant="primary">vandaag</Badge>
                                    ) : s.current != null ? (
                                      <span className="text-xs text-muted-foreground">
                                        huidig {s.current}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">
                                        nieuw
                                      </span>
                                    )}
                                  </div>
                                  <div
                                    className={cn(
                                      "flex flex-wrap gap-1",
                                      isPending && "opacity-60",
                                    )}
                                  >
                                    {SCORE_VALUES.map(
                                      (n) => {
                                        const active = selected === n;
                                        const isToday = s.today === n;
                                        return (
                                          <button
                                            key={n}
                                            type="button"
                                            disabled={isPending}
                                            onClick={() => score(leaf.id, n)}
                                            aria-pressed={active}
                                            aria-label={`${leaf.label}: ${n}`}
                                            className={cn(
                                              "h-9 w-9 rounded-md border text-sm font-medium tabular-nums transition-colors",
                                              active
                                                ? isToday
                                                  ? "border-primary bg-primary text-primary-foreground"
                                                  : "border-primary bg-primary-soft text-primary"
                                                : "border-border bg-card text-muted-foreground hover:border-muted-foreground/40 hover:bg-muted",
                                            )}
                                          >
                                            {n}
                                          </button>
                                        );
                                      },
                                    )}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
