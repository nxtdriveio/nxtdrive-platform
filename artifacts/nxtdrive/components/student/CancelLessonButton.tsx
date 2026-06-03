"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarX, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cancelLesson } from "@/app/student/actions";
import { formatTegoed } from "@/lib/students/types";

/**
 * Student self-cancellation for a planned, future lesson. Shows the consequence
 * (refund preview per the tenant policy) before committing. When the notice
 * window has passed (`canCancel=false`) it explains the lesson can no longer be
 * self-cancelled. The server action re-validates everything and the RPC is the
 * source of truth.
 */
export function CancelLessonButton({
  lessonId,
  lessonCredits,
  refundCredits,
  refundPct,
  canCancel,
  minNoticeHours,
}: {
  lessonId: string;
  lessonCredits: number;
  refundCredits: number;
  refundPct: number;
  canCancel: boolean;
  minNoticeHours: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <Card className="border-success/40 bg-success/5">
        <CardContent className="flex items-center gap-2 pt-5 text-sm text-foreground">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden />
          Je les is geannuleerd.
        </CardContent>
      </Card>
    );
  }

  function submit() {
    setError(null);
    const fd = new FormData();
    fd.set("lesson_id", lessonId);
    fd.set("reason", reason);
    startTransition(async () => {
      const res = await cancelLesson(fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      setDone(true);
      router.refresh();
    });
  }

  if (!canCancel) {
    return (
      <Card>
        <CardContent className="space-y-1 pt-5">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
            Zelf annuleren niet meer mogelijk
          </div>
          <p className="text-sm text-muted-foreground">
            Een les afzeggen kan tot uiterlijk {minNoticeHours} uur van tevoren.
            Neem contact op met je rijschool als je deze les wilt annuleren.
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
        <CalendarX className="h-4 w-4" aria-hidden />
        Les annuleren
      </Button>
    );
  }

  return (
    <Card className="border-warning/40">
      <CardContent className="space-y-3 pt-5">
        <div className="text-sm font-medium text-foreground">
          Weet je zeker dat je deze les wilt annuleren?
        </div>
        <p className="text-sm text-muted-foreground">
          {refundCredits > 0 ? (
            <>
              Je krijgt <strong>{formatTegoed(refundCredits)}</strong> tegoed
              terug ({refundPct}% van {formatTegoed(lessonCredits)}).
            </>
          ) : (
            <>
              Bij dit moment krijg je <strong>geen tegoed</strong> terug van de{" "}
              {formatTegoed(lessonCredits)} voor deze les.
            </>
          )}
        </p>

        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">
            Reden (optioneel)
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={500}
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Bijv. ziek, andere afspraak…"
          />
        </label>

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="danger"
            className="flex-1"
            disabled={pending}
            onClick={submit}
          >
            {pending ? "Bezig…" : "Ja, annuleren"}
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
