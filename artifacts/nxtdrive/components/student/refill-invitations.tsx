"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Check, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  STUDENT_ACCENT_SURFACE,
  StudentShowcaseCard,
  StudentShowcaseNotice,
} from "@/components/student/Showcase";
import { respondRefillInvitation } from "@/app/student/actions";
import type { RefillInvitation } from "@/lib/lesson-refill/invitations";

const dateTimeFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "long",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function formatExpiry(iso: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function RefillInvitations({
  invitations,
}: {
  invitations: RefillInvitation[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (invitations.length === 0) return null;

  function respond(id: string, response: "accept" | "decline") {
    const formData = new FormData();
    formData.set("invitation_id", id);
    formData.set("response", response);
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const result = await respondRefillInvitation(formData);
      setBusyId(null);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <StudentShowcaseCard
      title={`Vrijgekomen lesmoment${invitations.length > 1 ? "en" : ""}`}
      eyebrow="Snel reageren"
      info="Als je bevestigt, wordt de les direct ingepland en op je tegoed verwerkt."
      className="border-primary/20"
      style={{
        background: STUDENT_ACCENT_SURFACE,
      }}
    >
      <div className="space-y-3">
        <p className="text-sm leading-6 text-white/60">
          Er is een lesmoment vrijgekomen. Bevestig je de les, dan wordt deze
          direct ingepland en je tegoed verrekend.
        </p>

        {error ? (
          <StudentShowcaseNotice
            tone="danger"
            title="Reageren lukt nu niet"
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
                  <div className="text-xs text-white/48">
                    Reageer voor {formatExpiry(invitation.expiresAt)}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() => respond(invitation.id, "accept")}
                  >
                    <Check className="h-4 w-4" aria-hidden />
                    Bevestig les
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-white/70 hover:bg-white/10 hover:text-white"
                    disabled={busy}
                    onClick={() => respond(invitation.id, "decline")}
                  >
                    <X className="h-4 w-4" aria-hidden />
                    Afwijzen
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
