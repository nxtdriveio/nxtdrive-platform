"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StudentShowcaseNotice } from "@/components/student/Showcase";
import { rescheduleLesson } from "@/app/student/actions";

function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function RescheduleLessonButton({
  lessonId,
  currentStartsAt,
  canReschedule,
  minNoticeHours,
  blockedReason,
}: {
  lessonId: string;
  currentStartsAt: string;
  canReschedule: boolean;
  minNoticeHours: number;
  blockedReason?: string | null;
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
      <StudentShowcaseNotice
        tone="success"
        title="Je les is verzet"
        description="Je nieuwe moment is opgeslagen. Het oude moment kan nu door je rijschool worden herbezet."
        icon={<CheckCircle2 className="h-5 w-5" aria-hidden />}
      />
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
    const formData = new FormData();
    formData.set("lesson_id", lessonId);
    formData.set("new_starts_at", parsed.toISOString());
    startTransition(async () => {
      const result = await rescheduleLesson(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDone(true);
      router.refresh();
    });
  }

  if (!canReschedule) {
    return (
      <StudentShowcaseNotice
        tone="warning"
        title="Zelf verzetten niet meer mogelijk"
        description={
          blockedReason ??
          `Een les verzetten kan tot uiterlijk ${minNoticeHours} uur van tevoren. Neem contact op met je rijschool als je deze les wilt verzetten.`
        }
        icon={<AlertTriangle className="h-5 w-5" aria-hidden />}
      />
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
    <StudentShowcaseNotice
      tone="info"
      title="Kies een nieuw moment voor deze les"
      description="Je tegoed blijft behouden en je houdt dezelfde instructeur en lesduur. Het oude moment komt vrij voor herbezetting zodra de verplaatsing lukt."
      icon={<CalendarClock className="h-5 w-5" aria-hidden />}
    >
      <label className="block space-y-1">
        <span className="text-xs uppercase text-white/42">
          Nieuwe datum en tijd
        </span>
        <input
          type="datetime-local"
          value={value}
          min={nowMin}
          onChange={(event) => setValue(event.target.value)}
          className="w-full rounded-[1rem] border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      {error ? <p className="mt-3 text-sm text-rose-200">{error}</p> : null}

      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          className="flex-1"
          disabled={pending}
          onClick={submit}
        >
          {pending ? "Bezig..." : "Les verzetten"}
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
    </StudentShowcaseNotice>
  );
}
