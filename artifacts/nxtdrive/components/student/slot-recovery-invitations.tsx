"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Check, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  STUDENT_ACCENT_SURFACE,
  StudentShowcaseCard,
  StudentShowcaseNotice,
} from "@/components/student/Showcase";
import { expressSlotRecoveryInterestAction } from "@/app/student/actions";
import type { SlotRecoveryInvitation } from "@/lib/slot-recovery/invitations";

const dateTimeFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "long",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const shortDateTimeFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function SlotRecoveryInvitations({
  invitations,
}: {
  invitations: SlotRecoveryInvitation[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (invitations.length === 0) return null;

  function showInterest(id: string) {
    const formData = new FormData();
    formData.set("booking_candidate_id", id);
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const result = await expressSlotRecoveryInterestAction(formData);
      setBusyId(null);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <StudentShowcaseCard
      title={`Vrijgekomen herstelmoment${invitations.length > 1 ? "en" : ""}`}
      eyebrow="Slot recovery"
      info="Toon interesse; je rijschool bevestigt daarna wie het moment krijgt."
      className="border-primary/20"
      style={{ background: STUDENT_ACCENT_SURFACE }}
    >
      <div className="space-y-3">
        <p className="text-sm leading-6 text-white/60">
          Er is een lesmoment vrijgekomen. Laat weten dat je kunt, dan bevestigt
          je rijschool de definitieve planning.
        </p>

        {error ? (
          <StudentShowcaseNotice
            tone="danger"
            title="Interesse doorgeven lukt nu niet"
            description={error}
            icon={<CalendarClock className="h-5 w-5" aria-hidden />}
          />
        ) : null}

        <ol className="space-y-2">
          {invitations.map((invitation) => {
            const busy = pending && busyId === invitation.id;
            return (
              <li
                key={invitation.id}
                className="rounded-[1.15rem] border border-white/10 bg-white/[0.03] p-3"
              >
                <div className="space-y-1">
                  <div className="text-sm font-medium capitalize text-white">
                    {dateTimeFmt.format(new Date(invitation.startsAt))}
                  </div>
                  <div className="text-xs text-white/48">
                    Duur: {invitation.durationMin} min
                  </div>
                  {invitation.location ? (
                    <div className="flex items-center gap-1.5 text-xs text-white/48">
                      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {invitation.location}
                    </div>
                  ) : null}
                  {invitation.expiresAt ? (
                    <div className="text-xs text-white/48">
                      Reageer voor{" "}
                      {shortDateTimeFmt.format(new Date(invitation.expiresAt))}
                    </div>
                  ) : null}
                </div>

                <div className="mt-3">
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy || invitation.interestShown}
                    onClick={() => showInterest(invitation.id)}
                  >
                    <Check className="h-4 w-4" aria-hidden />
                    {invitation.interestShown ? "Interesse doorgegeven" : "Ik kan dit moment"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </StudentShowcaseCard>
  );
}
