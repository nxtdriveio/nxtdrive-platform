"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { StudentLessonCard } from "@/components/student/LessonCard";
import type { Lesson } from "@/lib/lessons/types";

const dayFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const monthFmt = new Intl.DateTimeFormat("nl-NL", {
  month: "long",
  year: "numeric",
});

type Group = { key: string; label: string; lessons: Lesson[] };

function groupBy(
  lessons: Lesson[],
  keyOf: (d: Date) => string,
  labelOf: (d: Date) => string,
): Group[] {
  const map = new Map<string, Group>();
  for (const l of lessons) {
    const d = new Date(l.starts_at);
    const key = keyOf(d);
    const existing = map.get(key);
    if (existing) existing.lessons.push(l);
    else map.set(key, { key, label: labelOf(d), lessons: [l] });
  }
  return Array.from(map.values());
}

/**
 * Planning tab UI: a "Komende" / "Geschiedenis" toggle. Upcoming lessons are
 * grouped per day, history per month. Status badges come from the shared
 * LessonCard. Names are passed as a plain record (Maps aren't serializable).
 */
export function PlanningTabs({
  upcoming,
  past,
  instructorNames,
}: {
  upcoming: Lesson[];
  past: Lesson[];
  instructorNames: Record<string, string>;
}) {
  const [tab, setTab] = useState<"upcoming" | "history">("upcoming");

  const upcomingGroups = useMemo(
    () =>
      groupBy(
        upcoming,
        (d) => d.toISOString().slice(0, 10),
        (d) => dayFmt.format(d),
      ),
    [upcoming],
  );
  const historyGroups = useMemo(
    () =>
      groupBy(
        past,
        (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        (d) => monthFmt.format(d),
      ),
    [past],
  );

  const groups = tab === "upcoming" ? upcomingGroups : historyGroups;
  const emptyText =
    tab === "upcoming"
      ? "Geen geplande lessen."
      : "Nog geen eerdere lessen.";

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Lessen"
        className="inline-flex rounded-lg border border-border bg-muted/40 p-1"
      >
        <TabButton
          active={tab === "upcoming"}
          onClick={() => setTab("upcoming")}
          count={upcoming.length}
        >
          Komende
        </TabButton>
        <TabButton
          active={tab === "history"}
          onClick={() => setTab("history")}
          count={past.length}
        >
          Geschiedenis
        </TabButton>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground">
            {emptyText}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.key} className="space-y-2">
              <h2 className="text-xs font-medium capitalize text-muted-foreground">
                {g.label}
              </h2>
              <ol className="space-y-2">
                {g.lessons.map((l) => (
                  <li key={l.id}>
                    <StudentLessonCard
                      lesson={l}
                      showDate
                      instructorName={instructorNames[l.instructor_id] ?? null}
                    />
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
        {count}
      </span>
    </button>
  );
}
