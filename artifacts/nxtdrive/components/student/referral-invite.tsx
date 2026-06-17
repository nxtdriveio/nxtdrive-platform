"use client";

import * as React from "react";
import { Check, Copy, Gift, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  STUDENT_ACCENT_SURFACE,
  StudentShowcaseCard,
  StudentShowcaseNotice,
} from "@/components/student/Showcase";
import type { StudentReferralSummary } from "@/lib/referrals/data";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
  }).format(date);
}

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

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // If the clipboard is unavailable, the student can still copy the link manually.
    }
  }

  async function share() {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: `Leer rijden bij ${schoolName}`,
          text: `Schrijf je in bij ${schoolName} via mijn persoonlijke link!`,
          url,
        });
        return;
      } catch {
        // Ignore cancellations and fall back to copying.
      }
    }
    await copy();
  }

  return (
    <StudentShowcaseCard
      title="Nodig een vriend uit"
      eyebrow="Persoonlijke link"
      info="Deel je eigen link. Zodra iemand daarmee inschrijft, wordt die aanmelding automatisch aan jou gekoppeld."
      className="border-primary/20"
      style={{
        background: STUDENT_ACCENT_SURFACE,
      }}
    >
      <div className="space-y-3">
        <p className="text-sm leading-6 text-white/60">
          Ken je iemand die zijn rijbewijs wil halen? Deel je persoonlijke link.
          Schrijft iemand zich via jouw link in, dan koppelen we die aanmelding
          automatisch aan jou.
        </p>

        <div className="flex items-center gap-2 rounded-[1rem] border border-white/10 bg-black/20 px-3 py-2.5">
          <Gift className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm text-white">{url}</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-white/72 hover:bg-white/10 hover:text-white"
            onClick={copy}
            aria-label="Kopieer link"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-300" aria-hidden />
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
          <div className="space-y-2 border-t border-white/8 pt-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs uppercase tracking-wider text-white/42">
                Jouw aandragingen
              </span>
              <span className="text-xs text-white/46">
                {summary.total} totaal · {summary.convertedCount} gestart
              </span>
            </div>
            <ul className="space-y-1.5">
              {summary.referrals.map((referral) => (
                <li
                  key={referral.leadId}
                  className="flex items-center justify-between gap-2 rounded-[1rem] border border-white/10 bg-white/[0.03] px-3 py-2.5"
                >
                  <span className="min-w-0 truncate text-sm text-white">
                    {referral.fullName ?? "Aanmelding"}
                    <span className="ml-2 text-xs text-white/44">
                      {formatWhen(referral.createdAt)}
                    </span>
                  </span>
                  {referral.rewardHandled ? (
                    <Badge variant="success">Beloning ontvangen</Badge>
                  ) : referral.converted ? (
                    <Badge variant="primary">Gestart</Badge>
                  ) : (
                    <Badge variant="default">Aangemeld</Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : summary ? (
          <StudentShowcaseNotice
            title="Nog geen aandragingen"
            description="Deel je link om vrienden uit te nodigen en je eerste aanmelding te verzamelen."
            icon={<Gift className="h-5 w-5" aria-hidden />}
          />
        ) : null}
      </div>
    </StudentShowcaseCard>
  );
}
