"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { submitStudentReview } from "@/app/student/actions";

/**
 * In-app reviewformulier (intern reviewsysteem, migration 0080). De leerling
 * (of voogd) geeft een sterbeoordeling (1–5) + optionele tekst. Eén review per
 * leerling: bestaat er al één, dan toont het formulier de huidige score en is
 * die bewerkbaar. De score voedt de rapportagekaart van de rijschool.
 *
 * Dit is het INTERNE reviewmoment. Het staat los van de Google-reviewbanner
 * (#113) — die spoort aan tot een EXTERNE review en blijft ongemoeid.
 */
export function ReviewForm({
  studentId,
  initialRating,
  initialBody,
}: {
  studentId: string;
  initialRating: number | null;
  initialBody: string | null;
}) {
  const [rating, setRating] = React.useState<number>(initialRating ?? 0);
  const [hover, setHover] = React.useState<number>(0);
  const [body, setBody] = React.useState<string>(initialBody ?? "");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const hasExisting = initialRating !== null;
  const shown = hover || rating;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (rating < 1 || rating > 5) {
      setError("Kies een score van 1 tot 5 sterren.");
      return;
    }
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("student_id", studentId);
      fd.set("rating", String(rating));
      fd.set("body", body);
      const res = await submitStudentReview(fd);
      if (res.error) {
        setError(res.error);
      } else {
        setSaved(true);
      }
    } catch {
      setError("Er ging iets mis. Probeer het later opnieuw.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Jouw beoordeling
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasExisting
              ? "Bedankt voor je beoordeling! Je kunt deze altijd aanpassen."
              : "Hoe tevreden ben je over je rijschool? Je beoordeling helpt ze verbeteren."}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div
            className="flex items-center gap-1"
            role="radiogroup"
            aria-label="Sterbeoordeling van 1 tot 5"
          >
            {[1, 2, 3, 4, 5].map((value) => {
              const filled = value <= shown;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={rating === value}
                  aria-label={`${value} ${value === 1 ? "ster" : "sterren"}`}
                  onClick={() => setRating(value)}
                  onMouseEnter={() => setHover(value)}
                  onMouseLeave={() => setHover(0)}
                  onFocus={() => setHover(value)}
                  onBlur={() => setHover(0)}
                  disabled={pending}
                  className="rounded p-1 text-amber-500 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                  <Star
                    className="h-7 w-7"
                    aria-hidden
                    fill={filled ? "currentColor" : "none"}
                    strokeWidth={filled ? 1 : 1.5}
                  />
                </button>
              );
            })}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="review-body"
              className="text-sm font-medium text-foreground"
            >
              Toelichting <span className="text-muted-foreground">(optioneel)</span>
            </label>
            <textarea
              id="review-body"
              name="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={pending}
              rows={3}
              maxLength={1000}
              placeholder="Wat ging er goed? Wat kan beter?"
              className="w-full resize-y rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            />
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          {saved ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              Je beoordeling is opgeslagen. Bedankt!
            </p>
          ) : null}

          <Button type="submit" size="sm" disabled={pending || rating < 1}>
            <Star className="h-4 w-4" aria-hidden />
            {hasExisting ? "Beoordeling bijwerken" : "Beoordeling versturen"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
