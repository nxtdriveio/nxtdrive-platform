"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  HeartHandshake,
  Brain,
  Info,
  AlertTriangle,
  Target,
  Gauge,
  CalendarPlus,
  Package as PackageIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { analyzeRetakeAction } from "@/app/instructor/ai-actions";
import type { ProgressAnalysis } from "@/lib/ai/leskaart-advisor";

const KANS_VARIANT: Record<string, "success" | "warning" | "danger"> = {
  Hoog: "success",
  Gemiddeld: "warning",
  Laag: "danger",
};

/**
 * Examenflow C — backoffice herexamen-kaart na een gezakt/niet-verschenen
 * examen. Toont het vervolgadvies, een on-demand AI-analyse (niets wordt
 * opgeslagen) en snelkoppelingen naar planning en pakketten.
 */
export function BackofficeRetakeCard({
  studentId,
  lastExamNote,
}: {
  studentId: string;
  lastExamNote: string | null;
}) {
  const [analysis, setAnalysis] = useState<ProgressAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      const res = await analyzeRetakeAction(studentId);
      if (res.error) setError(res.error);
      else setAnalysis(res.analysis ?? null);
    });
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HeartHandshake className="h-4 w-4 text-muted-foreground" aria-hidden />
          Gezakt — herexamen
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          De leerling is niet geslaagd. Bespreek de uitslag, plan gericht verder
          en stel zo nodig een aanvullend pakket voor.
        </p>

        {lastExamNote ? (
          <div className="rounded-md border border-border bg-card/60 px-3 py-2 text-sm text-foreground">
            <span className="font-medium">Vervolgadvies: </span>
            {lastExamNote}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Link
            href="/backoffice/agenda"
            className={buttonVariants({ size: "sm", variant: "outline" })}
          >
            <CalendarPlus className="h-4 w-4" aria-hidden />
            Plan herexamen
          </Link>
          <Link
            href="/backoffice/packages"
            className={buttonVariants({ size: "sm", variant: "outline" })}
          >
            <PackageIcon className="h-4 w-4" aria-hidden />
            Pakket voorstellen
          </Link>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Brain className="h-4 w-4" aria-hidden />
              AI-herexamenanalyse
            </div>
            <Badge variant="default">Advies</Badge>
          </div>

          <p className="text-xs text-muted-foreground">
            Op-aanvraag analyse van zwakke onderdelen en focus richting het
            herexamen — op basis van de leskaartcijfers. Niets wordt opgeslagen.
          </p>

          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={run}
            disabled={pending}
            className="w-full"
          >
            <Brain className="h-4 w-4" aria-hidden />
            {pending
              ? "Analyseren…"
              : analysis
                ? "Opnieuw analyseren"
                : "Analyseer voor herexamen"}
          </Button>

          {error ? (
            <div className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          ) : null}

          {analysis ? (
            <div className="space-y-4">
              <section className="space-y-1.5 rounded-lg border border-border bg-card/60 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <Gauge className="h-3.5 w-3.5" aria-hidden />
                    Slagingskans (indicatie)
                  </div>
                  <Badge
                    variant={
                      KANS_VARIANT[analysis.slagingskans.indicatie] ?? "warning"
                    }
                  >
                    {analysis.slagingskans.indicatie}
                  </Badge>
                </div>
                {analysis.slagingskans.onderbouwing ? (
                  <p className="text-sm text-foreground">
                    {analysis.slagingskans.onderbouwing}
                  </p>
                ) : null}
              </section>

              {analysis.zwakkePunten.length > 0 ? (
                <section className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                    Zwakke onderdelen
                  </div>
                  <ul className="space-y-2">
                    {analysis.zwakkePunten.map((p, i) => (
                      <li
                        key={i}
                        className="rounded-md border border-border bg-card/50 p-3"
                      >
                        <div className="text-sm font-medium text-foreground">
                          {p.onderdeel}
                        </div>
                        {p.observatie ? (
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {p.observatie}
                          </p>
                        ) : null}
                        {p.advies ? (
                          <p className="mt-1 text-sm text-foreground">
                            <span className="font-medium">Advies: </span>
                            {p.advies}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {analysis.planning.length > 0 ? (
                <section className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <Target className="h-3.5 w-3.5" aria-hidden />
                    Planningssuggesties
                  </div>
                  <ul className="space-y-1 text-sm text-foreground">
                    {analysis.planning.map((s, i) => (
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
            AI-gegenereerd advies. Niet bindend — de instructeur bepaalt de
            planning en het examenmoment.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
