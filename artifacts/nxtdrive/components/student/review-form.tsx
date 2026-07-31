"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  StudentShowcaseCard,
  StudentShowcaseNotice,
} from "@/components/student/Showcase";
import { submitStudentReview } from "@/app/leerling/actions";

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

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    if (rating < 1 || rating > 5) {
      setError("Kies een score van 1 tot 5 sterren.");
      return;
    }
    setPending(true);
    try {
      const formData = new FormData();
      formData.set("student_id", studentId);
      formData.set("rating", String(rating));
      formData.set("body", body);
      const result = await submitStudentReview(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
      }
    } catch {
      setError("Er ging iets mis. Probeer het later opnieuw.");
    } finally {
      setPending(false);
    }
  }

  return (
    <StudentShowcaseCard
      title="Jouw beoordeling"
      eyebrow="Feedback"
      info="Je beoordeling helpt je rijschool verbeteren. Heb je al eerder iets ingevuld, dan kun je dat hier gewoon aanpassen."
    >
      <div className="space-y-4">
        <p className="text-sm leading-6 text-white/60">
          {hasExisting
            ? "Bedankt voor je beoordeling. Je kunt deze hier altijd aanpassen."
            : "Hoe tevreden ben je over je rijschool? Je beoordeling helpt het team verbeteren."}
        </p>

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
                  className="rounded p-1 text-amber-400 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
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
              className="text-sm font-medium text-white"
            >
              Toelichting <span className="text-white/42">(optioneel)</span>
            </label>
            <textarea
              id="review-body"
              name="body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              disabled={pending}
              rows={3}
              maxLength={1000}
              placeholder="Wat ging er goed? Wat kan beter?"
              className="w-full resize-y rounded-[1rem] border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-white placeholder:text-white/32 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            />
          </div>

          {error ? (
            <StudentShowcaseNotice
              tone="danger"
              title="Beoordeling nog niet opgeslagen"
              description={error}
            />
          ) : null}
          {saved ? (
            <StudentShowcaseNotice
              tone="success"
              title="Beoordeling opgeslagen"
              description="Bedankt! Je feedback is veilig toegevoegd aan je studentdossier."
            />
          ) : null}

          <Button type="submit" size="sm" disabled={pending || rating < 1}>
            <Star className="h-4 w-4" aria-hidden />
            {hasExisting ? "Beoordeling bijwerken" : "Beoordeling versturen"}
          </Button>
        </form>
      </div>
    </StudentShowcaseCard>
  );
}
