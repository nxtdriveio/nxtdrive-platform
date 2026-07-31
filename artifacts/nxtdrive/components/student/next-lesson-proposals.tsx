"use client";

import { useState, useTransition } from "react";
import { CalendarCheck2, Check, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  STUDENT_ACCENT_SURFACE,
  StudentShowcaseCard,
  StudentShowcaseNotice,
} from "@/components/student/Showcase";
import { respondInstructorNextLessonProposalAction } from "@/app/leerling/actions";
import type { StudentNextLessonProposal } from "@/lib/end-of-lesson-scheduling/proposals";

const dateTimeFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "long",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function NextLessonProposals({
  proposals,
}: {
  proposals: StudentNextLessonProposal[];
}) {
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (proposals.length === 0) return null;

  function respond(proposal: StudentNextLessonProposal, response: "accept" | "decline") {
    const formData = new FormData();
    formData.set("booking_confirmation_id", proposal.confirmationId);
    formData.set("booking_candidate_id", proposal.candidateId);
    formData.set("response", response);
    setError(null);
    setBusyKey(`${proposal.confirmationId}:${response}`);
    startTransition(async () => {
      const result = await respondInstructorNextLessonProposalAction(formData);
      setBusyKey(null);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <StudentShowcaseCard
      title={`Voorstel volgende les${proposals.length > 1 ? "sen" : ""}`}
      eyebrow="Planning"
      info="Bevestig het moment of wijs het af. Na bevestiging staat de les direct in je agenda."
      className="border-primary/20"
      style={{ background: STUDENT_ACCENT_SURFACE }}
    >
      <div className="space-y-3">
        {error ? (
          <StudentShowcaseNotice
            tone="danger"
            title="Reactie opslaan lukt nu niet"
            description={error}
            icon={<CalendarCheck2 className="h-5 w-5" aria-hidden />}
          />
        ) : null}

        <ol className="space-y-2">
          {proposals.map((proposal) => {
            const acceptBusy =
              pending && busyKey === `${proposal.confirmationId}:accept`;
            const declineBusy =
              pending && busyKey === `${proposal.confirmationId}:decline`;
            return (
              <li
                key={proposal.confirmationId}
                className="rounded-[1.15rem] border border-white/10 bg-white/[0.03] p-3"
              >
                <div className="space-y-1">
                  <div className="text-sm font-medium capitalize text-white">
                    {dateTimeFmt.format(new Date(proposal.startsAt))}
                  </div>
                  <div className="text-xs text-white/48">
                    Duur: {proposal.durationMin} min
                  </div>
                  {proposal.location ? (
                    <div className="flex items-center gap-1.5 text-xs text-white/48">
                      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {proposal.location}
                    </div>
                  ) : null}
                  {proposal.reason ? (
                    <div className="text-xs text-white/48">{proposal.reason}</div>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={acceptBusy || declineBusy}
                    onClick={() => respond(proposal, "accept")}
                  >
                    <Check className="h-4 w-4" aria-hidden />
                    Bevestigen
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={acceptBusy || declineBusy}
                    onClick={() => respond(proposal, "decline")}
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
