"use client";

import { useState, useTransition } from "react";
import { Check, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inviteStudentToSlot } from "@/app/backoffice/agenda/actions";

export function InviteCandidateButton({
  studentId,
  instructorId,
  startsAt,
  durationMin,
  sourceLessonId,
  location,
  score,
  reason,
}: {
  studentId: string;
  instructorId: string;
  startsAt: string;
  durationMin: number;
  sourceLessonId: string;
  location?: string | null;
  score?: number;
  reason?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function invite() {
    const fd = new FormData();
    fd.set("student_id", studentId);
    fd.set("instructor_id", instructorId);
    fd.set("starts_at", startsAt);
    fd.set("duration_min", String(durationMin));
    fd.set("source_lesson_id", sourceLessonId);
    if (location) fd.set("location", location);
    if (typeof score === "number") fd.set("score", String(score));
    if (reason) fd.set("reason", reason);
    setError(null);
    startTransition(async () => {
      const res = await inviteStudentToSlot(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
        <Check className="h-4 w-4" aria-hidden />
        Uitgenodigd
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={invite}
      >
        <UserPlus className="h-4 w-4" aria-hidden />
        Uitnodigen
      </Button>
      {error ? (
        <span className="max-w-[12rem] text-right text-xs text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
