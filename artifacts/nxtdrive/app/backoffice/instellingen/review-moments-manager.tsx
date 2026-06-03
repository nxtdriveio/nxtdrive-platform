"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  REVIEW_MOMENTS,
  REVIEW_MOMENT_LABEL,
  REVIEW_MOMENT_DESCRIPTION,
  type ReviewMoment,
  type ReviewMomentsSettings,
} from "@/lib/notifications/settings";
import { saveReviewMomentsPolicy } from "./actions";

export function ReviewMomentsManager({
  settings,
}: {
  settings: ReviewMomentsSettings;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [active, setActive] = useState<Record<ReviewMoment, boolean>>(
    settings.activeMoments,
  );
  const [threshold, setThreshold] = useState(String(settings.lessonThreshold));
  const [reviewUrl, setReviewUrl] = useState(settings.googleReviewUrl ?? "");

  const thresholdNum = Number(threshold);
  const thresholdBad =
    threshold.trim() === "" ||
    !Number.isInteger(thresholdNum) ||
    thresholdNum < 1 ||
    thresholdNum > 1000;

  function submit() {
    setError(null);
    setSaved(false);
    if (thresholdBad) {
      setError("De lesdrempel moet een heel getal tussen 1 en 1000 zijn.");
      return;
    }
    const fd = new FormData();
    for (const moment of REVIEW_MOMENTS) {
      fd.set(`moment_${moment}`, active[moment] ? "true" : "false");
    }
    fd.set("lesson_threshold", threshold.trim());
    fd.set("google_review_url", reviewUrl.trim());

    startTransition(async () => {
      const res = await saveReviewMomentsPolicy(fd);
      if (!res.ok) {
        setError(res.error ?? "Er ging iets mis.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Bepaal op welke momenten automatisch een reviewverzoek wordt verstuurd.
        Verzoeken zijn idempotent: een leerling krijgt per moment hooguit één
        verzoek.
      </p>

      <div className="space-y-3">
        {REVIEW_MOMENTS.map((moment) => (
          <label
            key={moment}
            className="flex items-start gap-3 rounded-md border p-3"
          >
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={active[moment]}
              onChange={(e) =>
                setActive((prev) => ({ ...prev, [moment]: e.target.checked }))
              }
            />
            <span className="space-y-0.5">
              <span className="block text-sm font-medium text-foreground">
                {REVIEW_MOMENT_LABEL[moment]}
              </span>
              <span className="block text-xs text-muted-foreground">
                {REVIEW_MOMENT_DESCRIPTION[moment]}
              </span>
            </span>
          </label>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="lesson_threshold">
            Aantal lessen voor &quot;na een aantal lessen&quot;
          </Label>
          <Input
            id="lesson_threshold"
            type="number"
            min={1}
            max={1000}
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            aria-invalid={thresholdBad}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="google_review_url">Google-review-URL (optioneel)</Label>
          <Input
            id="google_review_url"
            type="url"
            placeholder="https://g.page/r/..."
            value={reviewUrl}
            onChange={(e) => setReviewUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Laat leeg om naar de app te verwijzen in plaats van een externe
            reviewpagina.
          </p>
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          Reviewmomenten opgeslagen.
        </p>
      ) : null}

      <Button type="button" onClick={submit} disabled={pending || thresholdBad}>
        {pending ? "Opslaan…" : "Opslaan"}
      </Button>
    </div>
  );
}
