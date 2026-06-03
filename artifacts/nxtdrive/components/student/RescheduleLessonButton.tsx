"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { rescheduleLesson } from "@/app/student/actions";

/** Format an ISO timestamp as a `datetime-local` input value in the browser's
 * local timezone (YYYY-MM-DDThh:mm). */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/**
 * Student self-rescheduling for a planned, future lesson. The student picks a
 * new date/time (same instructor, same duration → credits are preserved). The
 * value is converted from the student's local timezone to a UTC ISO string
 * before being sent. The server action re-validates everything (ownership,
 * notice window, slot availability) and the RPC is the source of truth.
 */
export function RescheduleLessonButton({
  lessonId,
  currentStartsAt,
  canReschedule,
  minNoticeHours,
}: {
  lessonId: string;
  currentStartsAt: string;
  canReschedule: boolean;
  minNoticeHours: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(() => toLocalInputValue(currentStartsAt));
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const nowMin = toLocalInputValue(new Date(Date.now() + 60_000).toISOString());

  if (done) {
    return (
      <Card className="border-success/40 bg-success/5">
        <CardContent className="flex items-center gap-2 pt-5 text-sm text-foreground">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden />
          Je les is verzet naar het nieuwe moment.
        </CardContent>
      </Card>
    );
  }

  function submit() {
    setError(null);
    if (!value) {
      setError("Kies een nieuwe datum en tijd.");
      return;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      setError("Ongeldige datum of tijd.");
      return;
    }
    if (parsed.getTime() <= Date.now()) {
      setError("Kies een moment in de toekomst.");
      return;
    }
    const fd = new FormData();
    fd.set("lesson_id", lessonId);
    fd.set("new_starts_at", parsed.toISOString());
    startTransition(async () => {
      const res = await rescheduleLesson(fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      setDone(true);
      router.refresh();
    });
  }

  if (!canReschedule) {
    return (
      <Card>
        <CardContent className="space-y-1 pt-5">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
            Zelf verzetten niet meer mogelijk
          </div>
          <p className="text-sm text-muted-foreground">
            Een les verzetten kan tot uiterlijk {minNoticeHours} uur van
            tevoren. Neem contact op met je rijschool als je deze les wilt
            verzetten.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        <CalendarClock className="h-4 w-4" aria-hidden />
        Les verzetten
      </Button>
    );
  }

  return (
    <Card className="border-info/40">
      <CardContent className="space-y-3 pt-5">
        <div className="text-sm font-medium text-foreground">
          Kies een nieuw moment voor deze les
        </div>
        <p className="text-sm text-muted-foreground">
          Je tegoed blijft behouden — verzetten kost je niets extra. Je houdt
          dezelfde instructeur en lesduur.
        </p>

        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">
            Nieuwe datum en tijd
          </span>
          <input
            type="datetime-local"
            value={value}
            min={nowMin}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <div className="flex gap-2">
          <Button
            type="button"
            className="flex-1"
            disabled={pending}
            onClick={submit}
          >
            {pending ? "Bezig…" : "Les verzetten"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={pending}
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
          >
            Terug
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
