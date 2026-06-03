"use client";

import { useState, useTransition } from "react";
import { Sparkles, Info, Package, CheckCircle2, CalendarClock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { generatePackageAdviceAction } from "@/app/backoffice/leads/actions";
import type { PackageAdvice } from "@/lib/ai/leskaart-advisor";

/**
 * Module 15 — AI-pakketadvies. On-demand advisory proposal combining the lead's
 * intake-analysis profile with the rijschool's real active packages. Nothing is
 * persisted; the backoffice still chooses the package manually. Degrades to a
 * friendly NL message when AI is not configured.
 */
export function AiPackageAdvice({ leadId }: { leadId: string }) {
  const [advice, setAdvice] = useState<PackageAdvice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      const res = await generatePackageAdviceAction(leadId);
      if (res.error) setError(res.error);
      else setAdvice(res.advice ?? null);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-4 w-4" aria-hidden />
            AI-pakketadvies
          </div>
          <Badge variant="default">Advies</Badge>
        </div>

        <p className="text-xs text-muted-foreground">
          Adviserend voorstel voor een passend pakket — op basis van het
          intake-profiel en jullie eigen actieve pakketten. Niet bindend: je
          kiest zelf bij het aanmaken van de leerling.
        </p>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={run}
          disabled={pending}
          className="w-full"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          {pending
            ? "Adviseren…"
            : advice
              ? "Opnieuw adviseren"
              : "Genereer pakketadvies"}
        </Button>

        {error ? (
          <div className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        ) : null}

        {advice ? (
          <div className="space-y-4">
            <section className="space-y-1.5 rounded-lg border border-primary/30 bg-primary-soft/50 p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-primary">
                <Package className="h-3.5 w-3.5" aria-hidden />
                Aanbevolen pakket
              </div>
              {advice.aanbevolenPakket ? (
                <div className="text-sm font-semibold text-foreground">
                  {advice.aanbevolenPakket}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Geen eenduidig pakket — zie toelichting.
                </div>
              )}
              {advice.onderbouwing ? (
                <p className="text-sm text-foreground">{advice.onderbouwing}</p>
              ) : null}
            </section>

            {advice.alternatief ? (
              <section className="space-y-1 rounded-md border border-border bg-muted/40 p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  Alternatief: {advice.alternatief.pakket}
                </div>
                {advice.alternatief.onderbouwing ? (
                  <p className="text-sm text-foreground">
                    {advice.alternatief.onderbouwing}
                  </p>
                ) : null}
              </section>
            ) : null}

            {advice.evaluatiemoment ? (
              <section className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                  Evaluatiemoment
                </div>
                <p className="text-sm text-foreground">
                  {advice.evaluatiemoment}
                </p>
              </section>
            ) : null}
          </div>
        ) : null}

        <p className="flex gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
          AI-gegenereerd advies. Controleer en beslis zelf — er wordt niets
          automatisch toegekend.
        </p>
      </CardContent>
    </Card>
  );
}
