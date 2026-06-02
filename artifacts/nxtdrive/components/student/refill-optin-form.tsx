"use client";

import { useState, useTransition } from "react";
import { BellRing, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toggleRefillAvailability } from "@/app/student/actions";
import {
  INTAKE_DAYPARTS,
  INTAKE_DAYPART_LABEL,
  type IntakeDaypart,
} from "@/lib/leads/types";

export function RefillOptInForm({
  studentId,
  optIn,
  preferredDayparts,
}: {
  studentId: string;
  optIn: boolean;
  preferredDayparts: string[];
}) {
  const [enabled, setEnabled] = useState(optIn);
  const [dayparts, setDayparts] = useState<Set<string>>(
    new Set(preferredDayparts),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function toggleDaypart(d: IntakeDaypart) {
    setSaved(false);
    setDayparts((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  function save(nextEnabled: boolean) {
    const fd = new FormData();
    fd.set("student_id", studentId);
    fd.set("opt_in", String(nextEnabled));
    if (nextEnabled) {
      for (const d of dayparts) fd.append("dayparts", d);
    }
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await toggleRefillAvailability(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setEnabled(nextEnabled);
      if (!nextEnabled) setDayparts(new Set());
      setSaved(true);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <BellRing className="h-4 w-4" aria-hidden />
          Extra lessen bij vrijgekomen tijd
        </div>

        <p className="text-sm text-muted-foreground">
          Geef aan of we je mogen uitnodigen wanneer er onverwacht een lesmoment
          vrijkomt. Je bevestigt elke uitnodiging altijd zelf — er wordt nooit
          automatisch een les geboekt.
        </p>

        {error ? (
          <div className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        ) : null}

        {saved ? (
          <div className="flex items-center gap-1.5 rounded-md border border-success/40 bg-success/5 px-3 py-2 text-xs text-success">
            <Check className="h-3.5 w-3.5" aria-hidden />
            Voorkeuren opgeslagen.
          </div>
        ) : null}

        {enabled ? (
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 text-xs font-medium text-foreground">
                Voorkeursmomenten (optioneel)
              </div>
              <div className="flex flex-wrap gap-2">
                {INTAKE_DAYPARTS.map((d) => {
                  const active = dayparts.has(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={pending}
                      onClick={() => toggleDaypart(d)}
                      className={
                        active
                          ? "rounded-full border border-primary bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                          : "rounded-full border border-border bg-card/50 px-3 py-1 text-xs text-foreground hover:border-primary/50"
                      }
                      aria-pressed={active}
                    >
                      {INTAKE_DAYPART_LABEL[d]}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Laat leeg om voor alle momenten in aanmerking te komen.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() => save(true)}
              >
                <Check className="h-4 w-4" aria-hidden />
                Voorkeuren opslaan
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => save(false)}
              >
                Uitschrijven
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => save(true)}
          >
            <BellRing className="h-4 w-4" aria-hidden />
            Ja, houd me op de hoogte
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
