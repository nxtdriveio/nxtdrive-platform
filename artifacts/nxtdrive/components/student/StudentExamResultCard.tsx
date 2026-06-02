"use client";

import { useState, useTransition } from "react";
import {
  PartyPopper,
  Share2,
  Gift,
  HeartHandshake,
  Check,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { setOwnReviewConsent } from "@/app/student/post-exam-actions";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

type ResultKind = "passed" | "failed" | "no_show";

/**
 * Examenflow C — leerling-zicht op de na-examen flow. Geslaagd: felicitatie,
 * deelbare badge (Web Share met clipboard-fallback), tip-een-vriend en de
 * AVG-expliciete self-service toestemming voor reviews/social media. Gezakt of
 * niet verschenen: empathisch bericht met het vervolgadvies van de instructeur.
 */
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
    <FailedCard
      result={result}
      examAt={examAt}
      lastExamNote={lastExamNote}
    />
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

  const shareText = `Ik ben geslaagd voor mijn rijexamen bij ${tenantName}! 🎉🚗`;
  const referralText = `Op zoek naar een rijschool? Ik heb mijn rijbewijs gehaald bij ${tenantName} — een aanrader!`;

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
      // Gebruiker annuleerde het delen — geen foutmelding nodig.
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
      // Klembord niet beschikbaar — stil falen.
    }
  }

  function toggleConsent() {
    setConsentError(null);
    const next = !consent;
    setConsent(next); // optimistisch
    startTransition(async () => {
      const res = await setOwnReviewConsent(next);
      if (!res.ok) {
        setConsent(!next); // rollback
        setConsentError(res.error);
      }
    });
  }

  return (
    <Card className="border-success/40 bg-success/5">
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-success">
            <PartyPopper className="h-4 w-4" aria-hidden />
            Geslaagd
          </div>
          <Badge variant="success">Gefeliciteerd!</Badge>
        </div>

        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">
            Top {firstName}, je bent geslaagd! 🎉
          </h2>
          <p className="text-sm text-muted-foreground">
            {examAt
              ? `Je examen van ${dateFmt.format(new Date(examAt))} is gehaald. `
              : ""}
            Geniet ervan — en veilig op weg!
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            type="button"
            size="sm"
            variant="primary"
            onClick={shareBadge}
            className="w-full"
          >
            {shared ? (
              <Check className="h-4 w-4" aria-hidden />
            ) : (
              <Share2 className="h-4 w-4" aria-hidden />
            )}
            {shared ? "Gedeeld!" : "Deel je succes"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={copyReferral}
            className="w-full"
          >
            {referralCopied ? (
              <Check className="h-4 w-4" aria-hidden />
            ) : (
              <Gift className="h-4 w-4" aria-hidden />
            )}
            {referralCopied ? "Link gekopieerd!" : "Tip een vriend"}
          </Button>
        </div>

        <div className="rounded-lg border border-border bg-card/60 p-3">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={toggleConsent}
              disabled={pending}
              className="mt-0.5 h-4 w-4 rounded border-border"
            />
            <span className="text-sm text-foreground">
              Ik geef {tenantName} toestemming om mijn naam en resultaat te
              gebruiken voor reviews en social media.
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Vrijwillig en altijd intrekbaar. Standaard staat dit uit.
              </span>
            </span>
          </label>
          {consentError ? (
            <p className="mt-2 text-xs text-danger">{consentError}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
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
      ? "Je bent niet verschenen op je examen. Geen zorgen — we plannen samen een nieuw moment in."
      : "Balen, maar het zegt niets over wat je al kunt. We bespreken de uitslag en gaan samen gericht verder richting een herexamen.";

  return (
    <Card className="border-border bg-muted/30">
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <HeartHandshake className="h-4 w-4" aria-hidden />
          Na het examen
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">{heading}</h2>
          <p className="text-sm text-muted-foreground">
            {examAt
              ? `Examen van ${dateFmt.format(new Date(examAt))}. `
              : ""}
            {body}
          </p>
        </div>
        {lastExamNote ? (
          <div className="rounded-md border border-border bg-card/60 px-3 py-2 text-sm text-foreground">
            <span className="font-medium">Vervolgadvies van je instructeur: </span>
            {lastExamNote}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
