"use client";

import { useState, useTransition } from "react";
import { Lock, Info, Repeat, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { analyzeInternalAttentionAction } from "@/app/instructeur/ai-actions";
import type { InternalAttention } from "@/lib/ai/leskaart-advisor";

/**
 * Module 15 — AI interne aandachtspunten (alleen voor begeleiders). Summarizes
 * recurring attention points across recent lessons + advice for the next lesson.
 * Visually distinct (amber, lock badge) from the student-facing lesson report so
 * it is never mistaken for output that the student sees. On-demand; nothing is
 * persisted.
 */
export function AiInternalAttention({ lessonId }: { lessonId: string }) {
  const [attention, setAttention] = useState<InternalAttention | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("lesson_id", lessonId);
      const res = await analyzeInternalAttentionAction(fd);
      if (res.error) setError(res.error);
      else setAttention(res.attention ?? null);
    });
  }

  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs uppercase text-warning">
            <Lock className="h-4 w-4" aria-hidden />
            Interne aandachtspunten
          </div>
          <Badge variant="warning">Alleen intern</Badge>
        </div>

        <p className="text-xs text-muted-foreground">
          Interne samenvatting van terugkerende aandachtspunten en advies voor de
          volgende les. Niet zichtbaar voor de leerling — los van het lesverslag.
        </p>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={run}
          disabled={pending}
          className="w-full"
        >
          <Repeat className="h-4 w-4" aria-hidden />
          {pending
            ? "Analyseren…"
            : attention
              ? "Opnieuw analyseren"
              : "Analyseer aandachtspunten"}
        </Button>

        {error ? (
          <div className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        ) : null}

        {attention ? (
          <div className="space-y-4">
            {attention.samenvatting ? (
              <p className="text-sm text-foreground">{attention.samenvatting}</p>
            ) : null}

            {attention.terugkerendePunten.length > 0 ? (
              <section className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-medium uppercase text-muted-foreground">
                  <Repeat className="h-3.5 w-3.5" aria-hidden />
                  Terugkerende punten
                </div>
                <ul className="space-y-2">
                  {attention.terugkerendePunten.map((p, i) => (
                    <li
                      key={i}
                      className="rounded-md border border-border bg-card/60 p-3"
                    >
                      <div className="text-sm font-medium text-foreground">
                        {p.thema}
                      </div>
                      {p.observatie ? (
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          {p.observatie}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {attention.adviesVolgendeLes.length > 0 ? (
              <section className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-medium uppercase text-muted-foreground">
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  Advies volgende les
                </div>
                <ul className="space-y-1 text-sm text-foreground">
                  {attention.adviesVolgendeLes.map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-muted-foreground">•</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}

        <p className="flex gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
          AI-gegenereerd advies voor intern gebruik. Niet bindend — de
          instructeur beslist.
        </p>
      </CardContent>
    </Card>
  );
}
