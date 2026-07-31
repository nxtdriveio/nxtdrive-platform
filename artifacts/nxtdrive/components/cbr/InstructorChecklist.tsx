"use client";

import { useState, useTransition } from "react";
import { ClipboardCheck, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toggleStudentCbrCompetencyAction } from "@/app/instructeur/actions";
import type { CbrChecklistItem } from "@/lib/cbr/types";
import { readinessPct } from "@/lib/cbr/types";

export function InstructorCbrChecklist({
  studentId,
  studentName,
  items: initialItems,
}: {
  studentId: string;
  studentName: string;
  items: CbrChecklistItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const pct = readinessPct(items);
  const done = items.filter((i) => i.achieved).length;

  function toggle(competencyId: string, nextAchieved: boolean) {
    setError(null);
    setPendingId(competencyId);
    const prev = items;
    // Optimistic update.
    setItems((cur) =>
      cur.map((it) =>
        it.competency.id === competencyId
          ? {
              ...it,
              achieved: nextAchieved,
              achieved_at: nextAchieved ? new Date().toISOString() : null,
            }
          : it,
      ),
    );
    startTransition(async () => {
      const fd = new FormData();
      fd.set("student_id", studentId);
      fd.set("competency_id", competencyId);
      fd.set("achieved", nextAchieved ? "1" : "0");
      const res = await toggleStudentCbrCompetencyAction(fd);
      if (res?.error) {
        setError(res.error);
        setItems(prev);
      }
      setPendingId(null);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <ClipboardCheck className="h-4 w-4" aria-hidden />
            Examenklaar — {studentName}
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            {done} / {items.length} · {pct}%
          </span>
        </div>

        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>

        {error ? (
          <div className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        ) : null}

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Geen onderdelen geconfigureerd voor deze rijschool.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((item) => {
              const isPending = pendingId === item.competency.id;
              return (
                <li key={item.competency.id}>
                  <button
                    type="button"
                    onClick={() => toggle(item.competency.id, !item.achieved)}
                    disabled={isPending}
                    aria-pressed={item.achieved}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                      item.achieved
                        ? "border-primary/40 bg-primary-soft/40 text-foreground"
                        : "border-border bg-card text-foreground hover:bg-muted",
                      isPending && "opacity-60",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-full border",
                          item.achieved
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card",
                        )}
                        aria-hidden
                      >
                        {item.achieved ? <Check className="h-3 w-3" /> : null}
                      </span>
                      <span
                        className={cn(
                          item.achieved ? "font-medium" : "",
                        )}
                      >
                        {item.competency.label}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {item.achieved ? "Afgevinkt" : "Tik om af te vinken"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
