"use client";

import * as React from "react";
import { Check, Copy, Gift, Share2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { StudentReferralSummary } from "@/lib/referrals/data";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
  }).format(d);
}

/**
 * Task #113 — "Nodig een vriend uit". Toont de persoonlijke referrallink van de
 * leerling met een kopieer- en deelknop, plus de status van de eigen aandragingen.
 * De link verwijst naar het intakeformulier van de rijschool met de code als
 * `?ref=`, zodat een nieuwe aanmelding aan deze leerling wordt toegeschreven.
 */
export function ReferralInvite({
  url,
  schoolName,
  summary,
}: {
  url: string;
  schoolName: string;
  summary?: StudentReferralSummary;
}) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Klembord niet beschikbaar — de leerling kan de link handmatig selecteren.
    }
  };

  const share = async () => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: `Leer rijden bij ${schoolName}`,
          text: `Schrijf je in bij ${schoolName} via mijn persoonlijke link!`,
          url,
        });
        return;
      } catch {
        // Gebruiker annuleerde of delen mislukte — val terug op kopiëren.
      }
    }
    await copy();
  };

  return (
    <Card className="border-primary/40 bg-primary-soft/30">
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary">
          <Gift className="h-4 w-4" aria-hidden />
          Nodig een vriend uit
        </div>
        <p className="text-sm text-muted-foreground">
          Ken je iemand die zijn rijbewijs wil halen? Deel je persoonlijke link.
          Schrijft iemand zich in via jouw link, dan koppelen we die aanmelding
          automatisch aan jou.
        </p>
        <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">
            {url}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={copy}
            aria-label="Kopieer link"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-600" aria-hidden />
            ) : (
              <Copy className="h-4 w-4" aria-hidden />
            )}
          </Button>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={share}>
            <Share2 className="h-4 w-4" aria-hidden />
            Delen
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={copy}>
            {copied ? "Gekopieerd!" : "Kopieer link"}
          </Button>
        </div>

        {summary && summary.total > 0 ? (
          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                Jouw aandragingen
              </span>
              <span className="text-xs text-muted-foreground">
                {summary.total} totaal · {summary.convertedCount} gestart
              </span>
            </div>
            <ul className="space-y-1.5">
              {summary.referrals.map((r) => (
                <li
                  key={r.leadId}
                  className="flex items-center justify-between gap-2 rounded-md bg-background/60 px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm text-foreground">
                    {r.fullName ?? "Aanmelding"}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {formatWhen(r.createdAt)}
                    </span>
                  </span>
                  {r.rewardHandled ? (
                    <Badge variant="success">Beloning ontvangen</Badge>
                  ) : r.converted ? (
                    <Badge variant="primary">Gestart</Badge>
                  ) : (
                    <Badge variant="default">Aangemeld</Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : summary ? (
          <p className="border-t pt-3 text-xs text-muted-foreground">
            Nog geen aandragingen. Deel je link om vrienden uit te nodigen!
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
