"use client";

import * as React from "react";
import { Star, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { markNotificationRead } from "@/lib/notifications/actions";

/**
 * Task #113 — in-app reviewbanner. Verschijnt zodra er een ongelezen
 * review_request-notificatie voor de leerling is. De CTA opent de Google-
 * reviewlink (indien ingesteld door de rijschool) en markeert de notificatie
 * als gelezen, zodat de banner daarna verdwijnt. "Niet nu" sluit de banner
 * eveneens af door de notificatie te markeren.
 */
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

  const dismiss = async () => {
    setPending(true);
    setDismissed(true);
    try {
      await markNotificationRead(notificationId);
    } catch {
      // Best-effort: de banner is lokaal al verborgen.
    } finally {
      setPending(false);
    }
  };

  const onReview = async () => {
    if (reviewUrl) {
      window.open(reviewUrl, "_blank", "noopener,noreferrer");
    }
    await dismiss();
  };

  return (
    <Card className="border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10">
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-amber-700 dark:text-amber-400">
            <Star className="h-4 w-4" aria-hidden />
            Deel je ervaring
          </div>
          <button
            type="button"
            onClick={dismiss}
            disabled={pending}
            aria-label="Sluiten"
            className="text-amber-700/70 hover:text-amber-900 dark:text-amber-400/70 dark:hover:text-amber-200"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <p className="text-sm text-amber-900 dark:text-amber-100">
          Zou je een momentje willen nemen om een review achter te laten? Het
          helpt ons enorm en duurt maar even.
        </p>
        <div className="flex gap-2">
          {reviewUrl ? (
            <Button
              type="button"
              size="sm"
              onClick={onReview}
              disabled={pending}
            >
              <Star className="h-4 w-4" aria-hidden />
              Laat een review achter
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={dismiss}
            disabled={pending}
          >
            Niet nu
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
