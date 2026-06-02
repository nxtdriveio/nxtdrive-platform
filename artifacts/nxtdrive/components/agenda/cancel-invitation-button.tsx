"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cancelRefillInvitation } from "@/app/backoffice/agenda/actions";

export function CancelInvitationButton({
  invitationId,
  sourceLessonId,
}: {
  invitationId: string;
  sourceLessonId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    const fd = new FormData();
    fd.set("invitation_id", invitationId);
    fd.set("source_lesson_id", sourceLessonId);
    setError(null);
    startTransition(async () => {
      const res = await cancelRefillInvitation(fd);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={cancel}
      >
        <X className="h-4 w-4" aria-hidden />
        Intrekken
      </Button>
      {error ? (
        <span className="max-w-[12rem] text-right text-xs text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
