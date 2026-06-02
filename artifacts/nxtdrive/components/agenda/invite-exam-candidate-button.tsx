"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inviteExamCandidate } from "@/app/backoffice/agenda/actions";

/**
 * One-click invite of a single suitable student to an open exam moment. Posts to
 * the inviteExamCandidate server action; surfaces the RPC error inline on
 * failure (e.g. moment no longer open, max candidates reached, duplicate).
 */
export function InviteExamCandidateButton({
  appointmentId,
  studentId,
  score,
  reason,
}: {
  appointmentId: string;
  studentId: string;
  score: number;
  reason: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function invite() {
    const fd = new FormData();
    fd.set("appointment_id", appointmentId);
    fd.set("student_id", studentId);
    fd.set("score", String(score));
    fd.set("reason", reason);
    setError(null);
    startTransition(async () => {
      const res = await inviteExamCandidate(fd);
      if (res?.ok) {
        setDone(true);
      } else {
        setError(res?.error ?? "Uitnodigen mislukt.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        disabled={pending || done}
        onClick={invite}
      >
        <Send className="h-4 w-4" aria-hidden />
        {done ? "Uitgenodigd" : "Nodig uit"}
      </Button>
      {error ? (
        <span className="text-right text-xs text-danger">{error}</span>
      ) : null}
    </div>
  );
}
