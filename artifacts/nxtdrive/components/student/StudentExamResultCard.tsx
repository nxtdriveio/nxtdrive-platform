"use client";

import { useState, useTransition } from "react";
import {
  Check,
  Gift,
  HeartHandshake,
  PartyPopper,
  Share2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  StudentShowcaseCard,
  StudentShowcaseNotice,
} from "@/components/student/Showcase";
import { setOwnReviewConsent } from "@/app/student/post-exam-actions";
import { createNlDateTimeFormatter } from "@/lib/datetime";

const dateFmt = createNlDateTimeFormatter({
  day: "2-digit",
  month: "long",
  year: "numeric",
});

type ResultKind = "passed" | "failed" | "no_show";

export function StudentExamResultCard({
  result,
  examAt,
  studentName,
  tenantName,
  lastExamNote,
  initialConsent,
}: {
  result: ResultKind;
  examAt: string | null;
  studentName: string;
  tenantName: string;
  lastExamNote: string | null;
  initialConsent: boolean;
}) {
  if (result === "passed") {
    return (
      <PassedCard
        examAt={examAt}
        studentName={studentName}
        tenantName={tenantName}
        initialConsent={initialConsent}
      />
    );
  }

  return (
    <FailedCard result={result} examAt={examAt} lastExamNote={lastExamNote} />
  );
}

function PassedCard({
  examAt,
  studentName,
  tenantName,
  initialConsent,
}: {
  examAt: string | null;
  studentName: string;
  tenantName: string;
  initialConsent: boolean;
}) {
  const firstName = studentName.split(" ")[0] ?? studentName;
  const [shared, setShared] = useState(false);
  const [referralCopied, setReferralCopied] = useState(false);
  const [consent, setConsent] = useState(initialConsent);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const shareText = `Ik ben geslaagd voor mijn rijexamen bij ${tenantName}!`;
  const referralText = `Op zoek naar een rijschool? Ik heb mijn rijbewijs gehaald bij ${tenantName} - een aanrader!`;

  async function shareBadge() {
    const nav =
      typeof navigator !== "undefined"
        ? (navigator as Navigator & {
            share?: (data: { title?: string; text?: string }) => Promise<void>;
          })
        : null;
    try {
      if (nav?.share) {
        await nav.share({ title: "Geslaagd!", text: shareText });
      } else if (nav?.clipboard) {
        await nav.clipboard.writeText(shareText);
      }
      setShared(true);
      window.setTimeout(() => setShared(false), 2500);
    } catch {
      // User cancelled the share flow.
    }
  }

  async function copyReferral() {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(referralText);
        setReferralCopied(true);
        window.setTimeout(() => setReferralCopied(false), 2500);
      }
    } catch {
      // Clipboard not available.
    }
  }

  function toggleConsent() {
    setConsentError(null);
    const next = !consent;
    setConsent(next);
    startTransition(async () => {
      const result = await setOwnReviewConsent(next);
      if (!result.ok) {
        setConsent(!next);
        setConsentError(result.error);
      }
    });
  }

  return (
    <StudentShowcaseCard
      title={`Top ${firstName}, je bent geslaagd!`}
      eyebrow="Gefeliciteerd"
      className="border-emerald-400/20 bg-[linear-gradient(180deg,rgba(22,53,43,0.92),rgba(10,10,22,0.98))]"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs uppercase text-emerald-300">
            <PartyPopper className="h-4 w-4" aria-hidden />
            Geslaagd
          </div>
          <Badge variant="success">Gefeliciteerd!</Badge>
        </div>

        <p className="text-sm leading-6 text-white/62">
          {examAt ? `Je examen van ${dateFmt.format(new Date(examAt))} is gehaald. ` : ""}
          Geniet ervan en veilig op weg.
        </p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button type="button" size="sm" onClick={shareBadge} className="w-full">
            {shared ? <Check className="h-4 w-4" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />}
            {shared ? "Gedeeld!" : "Deel je succes"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={copyReferral} className="w-full">
            {referralCopied ? <Check className="h-4 w-4" aria-hidden /> : <Gift className="h-4 w-4" aria-hidden />}
            {referralCopied ? "Link gekopieerd!" : "Tip een vriend"}
          </Button>
        </div>

        <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.03] p-3">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={toggleConsent}
              disabled={pending}
              className="mt-0.5 h-4 w-4 rounded border-white/18 bg-transparent"
            />
            <span className="text-sm text-white">
              Ik geef {tenantName} toestemming om mijn naam en resultaat te gebruiken voor reviews en social media.
              <span className="mt-0.5 block text-xs text-white/46">
                Vrijwillig en altijd weer uit te zetten. Standaard staat dit uit.
              </span>
            </span>
          </label>
          {consentError ? (
            <p className="mt-2 text-xs text-rose-300">{consentError}</p>
          ) : null}
        </div>
      </div>
    </StudentShowcaseCard>
  );
}

function FailedCard({
  result,
  examAt,
  lastExamNote,
}: {
  result: "failed" | "no_show";
  examAt: string | null;
  lastExamNote: string | null;
}) {
  const heading =
    result === "no_show"
      ? "Je examen is niet doorgegaan"
      : "Helaas, deze keer niet gelukt";
  const body =
    result === "no_show"
      ? "Je bent niet verschenen op je examen. Geen zorgen, we plannen samen een nieuw moment in."
      : "Balen, maar het zegt niets over wat je al kunt. We bespreken de uitslag en gaan gericht verder richting een herexamen.";

  return (
    <StudentShowcaseCard title={heading} eyebrow="Na het examen">
      <div className="space-y-3">
        <StudentShowcaseNotice
          tone="warning"
          title="Vervolg"
          description={`${examAt ? `Examen van ${dateFmt.format(new Date(examAt))}. ` : ""}${body}`}
          icon={<HeartHandshake className="h-5 w-5" aria-hidden />}
        />
        {lastExamNote ? (
          <StudentShowcaseNotice
            tone="info"
            title="Vervolgadvies van je instructeur"
            description={lastExamNote}
          />
        ) : null}
      </div>
    </StudentShowcaseCard>
  );
}
