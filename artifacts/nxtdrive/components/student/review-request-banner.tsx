"use client";

import * as React from "react";
import { Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StudentShowcaseNotice } from "@/components/student/Showcase";
import { markNotificationRead } from "@/lib/notifications/actions";

export function ReviewRequestBanner({
  notificationId,
  reviewUrl,
}: {
  notificationId: string;
  reviewUrl: string | null;
}) {
  const [dismissed, setDismissed] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  if (dismissed) return null;

  async function dismiss() {
    setPending(true);
    setDismissed(true);
    try {
      await markNotificationRead(notificationId);
    } catch {
      // Best-effort: the banner is already hidden locally.
    } finally {
      setPending(false);
    }
  }

  async function onReview() {
    if (reviewUrl) {
      window.open(reviewUrl, "_blank", "noopener,noreferrer");
    }
    await dismiss();
  }

  return (
    <StudentShowcaseNotice
      tone="warning"
      icon={<Star className="h-5 w-5" aria-hidden />}
      title="Deel je ervaring"
      description="Wil je een review achterlaten? Het helpt je rijschool enorm en duurt maar even."
      className="relative"
    >
      <button
        type="button"
        onClick={dismiss}
        disabled={pending}
        aria-label="Sluiten"
        className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/10 text-white/58 transition hover:text-white"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
      <div className="flex gap-2">
        {reviewUrl ? (
          <Button type="button" size="sm" onClick={onReview} disabled={pending}>
            <Star className="h-4 w-4" aria-hidden />
            Laat een review achter
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-white/70 hover:bg-white/10 hover:text-white"
          onClick={dismiss}
          disabled={pending}
        >
          Niet nu
        </Button>
      </div>
    </StudentShowcaseNotice>
  );
}
