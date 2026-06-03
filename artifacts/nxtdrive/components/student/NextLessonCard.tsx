"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Clock, MapPin, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const timeFmt = new Intl.DateTimeFormat("nl-NL", {
  hour: "2-digit",
  minute: "2-digit",
});

function countdownLabel(target: number, now: number): string {
  const ms = target - now;
  if (ms <= 0) return "Begint nu";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days >= 1) {
    return `over ${days} ${days === 1 ? "dag" : "dagen"}${
      hours > 0 ? ` ${hours} uur` : ""
    }`;
  }
  if (hours >= 1) {
    return `over ${hours} uur ${String(mins).padStart(2, "0")} min`;
  }
  return `over ${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Home "volgende les" card with a live countdown. Re-renders every second so the
 * countdown stays accurate; falls back to a static call-to-action when no lesson
 * is planned. The whole card links through to the lesson detail.
 */
export function NextLessonCard({
  lessonId,
  startsAt,
  endsAt,
  location,
  instructorName,
}: {
  lessonId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  instructorName: string | null;
}) {
  const target = startsAt ? new Date(startsAt).getTime() : null;
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (target === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (!lessonId || !startsAt || target === null) {
    return (
      <Card>
        <CardContent className="space-y-2 pt-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <CalendarDays className="h-4 w-4" aria-hidden />
            Volgende les
          </div>
          <p className="text-sm text-muted-foreground">
            Er staat geen les gepland. Neem contact op met je rijschool om een
            les in te plannen.
          </p>
        </CardContent>
      </Card>
    );
  }

  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;
  const durMin = end
    ? Math.round((end.getTime() - start.getTime()) / 60000)
    : null;

  return (
    <Link href={`/student/lessons/${lessonId}`} className="block">
      <Card className="border-primary/40 bg-primary-soft/40 transition-colors hover:border-primary/60">
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary">
              <CalendarDays className="h-4 w-4" aria-hidden />
              Volgende les
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold tabular-nums text-primary-foreground">
              <Clock className="h-3 w-3" aria-hidden />
              {countdownLabel(target, now)}
            </span>
          </div>

          <div>
            <div className="text-lg font-semibold capitalize text-foreground">
              {dateFmt.format(start)}
            </div>
            <div className="text-sm font-medium text-foreground tabular-nums">
              {timeFmt.format(start)}
              {end ? `–${timeFmt.format(end)}` : ""}
              {durMin ? ` · ${durMin} min` : ""}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4" aria-hidden />
              {location ?? "Locatie volgt"}
            </span>
            {instructorName ? (
              <span className="inline-flex items-center gap-1.5">
                <User className="h-4 w-4" aria-hidden />
                {instructorName}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
