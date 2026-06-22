"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarX, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  StudentShowcaseNotice,
} from "@/components/student/Showcase";
import { cancelLesson } from "@/app/student/actions";
import { formatTegoed } from "@/lib/students/types";

export function CancelLessonButton({
  lessonId,
  lessonCredits,
  refundCredits,
  refundPct,
  canCancel,
  minNoticeHours,
  blockedReason,
}: {
  lessonId: string;
  lessonCredits: number;
  refundCredits: number;
  refundPct: number;
  canCancel: boolean;
  minNoticeHours: number;
  blockedReason?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <StudentShowcaseNotice
        tone="success"
        title="Je les is geannuleerd"
        description="Je planning is bijgewerkt. Het vrijgekomen moment kan nu door je rijschool worden herbezet."
        icon={<CheckCircle2 className="h-5 w-5" aria-hidden />}
      />
    );
  }

  function submit() {
    setError(null);
    const formData = new FormData();
    formData.set("lesson_id", lessonId);
    formData.set("reason", reason);
    startTransition(async () => {
      const result = await cancelLesson(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDone(true);
      router.refresh();
    });
  }

  if (!canCancel) {
    return (
      <StudentShowcaseNotice
        tone="warning"
        title="Zelf annuleren niet meer mogelijk"
        description={
          blockedReason ??
          `Een les afzeggen kan tot uiterlijk ${minNoticeHours} uur van tevoren. Neem contact op met je rijschool als je deze les wilt annuleren.`
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
        <CalendarX className="h-4 w-4" aria-hidden />
        Les annuleren
      </Button>
    );
  }

  return (
    <StudentShowcaseNotice
      tone="warning"
      title="Weet je zeker dat je deze les wilt annuleren?"
      description={
        refundCredits > 0
          ? `Je krijgt ${formatTegoed(refundCredits)} tegoed terug (${refundPct}% van ${formatTegoed(lessonCredits)}). Het oude moment komt vrij voor herbezetting.`
          : `Bij dit moment krijg je geen tegoed terug van de ${formatTegoed(lessonCredits)} voor deze les. Het oude moment komt wel vrij voor herbezetting.`
      }
      icon={<CalendarX className="h-5 w-5" aria-hidden />}
    >
      <label className="block space-y-1">
        <span className="text-xs uppercase text-white/42">
          Reden (optioneel)
        </span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          maxLength={500}
          className="w-full resize-none rounded-[1rem] border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Bijvoorbeeld ziek of een andere afspraak"
        />
      </label>

      {error ? <p className="mt-3 text-sm text-rose-200">{error}</p> : null}

      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant="danger"
          className="flex-1"
          disabled={pending}
          onClick={submit}
        >
          {pending ? "Bezig..." : "Ja, annuleren"}
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
