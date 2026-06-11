"use client";

import { useState, useTransition } from "react";
import { BellRing, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  StudentShowcaseCard,
  StudentShowcaseNotice,
} from "@/components/student/Showcase";
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

  function toggleDaypart(daypart: IntakeDaypart) {
    setSaved(false);
    setDayparts((prev) => {
      const next = new Set(prev);
      if (next.has(daypart)) next.delete(daypart);
      else next.add(daypart);
      return next;
    });
  }

  function save(nextEnabled: boolean) {
    const formData = new FormData();
    formData.set("student_id", studentId);
    formData.set("opt_in", String(nextEnabled));
    if (nextEnabled) {
      for (const daypart of dayparts) formData.append("dayparts", daypart);
    }
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await toggleRefillAvailability(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setEnabled(nextEnabled);
      if (!nextEnabled) setDayparts(new Set());
      setSaved(true);
    });
  }

  return (
    <StudentShowcaseCard
      title="Extra lessen bij vrijgekomen tijd"
      eyebrow="Beschikbaarheid"
      info="Geef aan of je uitnodigingen wilt ontvangen wanneer er onverwacht een lesmoment vrijkomt."
    >
      <div className="space-y-3">
        <p className="text-sm leading-6 text-white/60">
          Geef aan of we je mogen uitnodigen wanneer er onverwacht een lesmoment
          vrijkomt. Je bevestigt elke uitnodiging altijd zelf — er wordt nooit
          automatisch een les geboekt.
        </p>

        {error ? (
          <StudentShowcaseNotice
            tone="danger"
            title="Opslaan lukt nu niet"
            description={error}
            icon={<BellRing className="h-5 w-5" aria-hidden />}
          />
        ) : null}

        {saved ? (
          <StudentShowcaseNotice
            tone="success"
            title="Voorkeuren opgeslagen"
            description="Je voorkeursmomenten zijn bijgewerkt en worden vanaf nu gebruikt voor nieuwe uitnodigingen."
            icon={<Check className="h-5 w-5" aria-hidden />}
          />
        ) : null}

        {enabled ? (
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 text-xs font-medium uppercase tracking-[0.18em] text-white/42">
                Voorkeursmomenten (optioneel)
              </div>
              <div className="flex flex-wrap gap-2">
                {INTAKE_DAYPARTS.map((daypart) => {
                  const active = dayparts.has(daypart);
                  return (
                    <button
                      key={daypart}
                      type="button"
                      disabled={pending}
                      onClick={() => toggleDaypart(daypart)}
                      className={
                        active
                          ? "rounded-full border border-primary/60 bg-primary/18 px-3 py-1.5 text-xs font-medium text-primary"
                          : "rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 hover:border-primary/40 hover:text-white"
                      }
                      aria-pressed={active}
                    >
                      {INTAKE_DAYPART_LABEL[daypart]}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-white/46">
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
                className="text-white/70 hover:bg-white/10 hover:text-white"
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
      </div>
    </StudentShowcaseCard>
  );
}
