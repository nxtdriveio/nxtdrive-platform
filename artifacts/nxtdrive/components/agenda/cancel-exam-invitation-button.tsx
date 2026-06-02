"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cancelExamInvitation } from "@/app/backoffice/agenda/actions";

/**
 * Withdraw an open exam invitation (staff-only). Posts to the
 * cancelExamInvitation server action; surfaces the RPC error inline on failure.
 */
export function CancelExamInvitationButton({
  invitationId,
  appointmentId,
}: {
  invitationId: string;
  appointmentId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    const fd = new FormData();
    fd.set("invitation_id", invitationId);
    fd.set("appointment_id", appointmentId);
    setError(null);
    startTransition(async () => {
      const res = await cancelExamInvitation(fd);
      if (!res?.ok) setError(res?.error ?? "Intrekken mislukt.");
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
        <span className="text-right text-xs text-danger">{error}</span>
      ) : null}
    </div>
  );
}
