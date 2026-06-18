"use client";

import { useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { submitStudentRisLessonResponseAction } from "@/lib/ris/actions";

export function StudentPostLessonResponseForm({
  lessonCardId,
  lessonId,
}: {
  lessonCardId: string;
  lessonId: string;
}) {
  const [commentText, setCommentText] = useState("");
  const [nextLessonWish, setNextLessonWish] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(skippedResponse: boolean) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await submitStudentRisLessonResponseAction({
        lessonCardId,
        lessonId,
        commentText,
        nextLessonWish,
        skippedResponse,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
    });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-background/70 p-4">
      <div>
        <h3 className="text-base font-black text-foreground">Jouw reactie</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Voeg eventueel toe wat je wilt onthouden of waar je volgende les extra
          op wilt oefenen.
        </p>
      </div>
      <Textarea
        value={commentText}
        onChange={(event) => setCommentText(event.target.value)}
        maxLength={1000}
        rows={3}
        placeholder="Mijn korte reactie op deze les..."
      />
      <Textarea
        value={nextLessonWish}
        onChange={(event) => setNextLessonWish(event.target.value)}
        maxLength={1000}
        rows={2}
        placeholder="Volgende les wil ik graag oefenen met..."
      />
      {error ? (
        <p className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          Je reactie is opgeslagen.
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="primary"
          disabled={isPending}
          onClick={() => submit(false)}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="h-4 w-4" aria-hidden />
          )}
          Reactie opslaan
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => submit(true)}
        >
          Overslaan
        </Button>
      </div>
    </div>
  );
}
