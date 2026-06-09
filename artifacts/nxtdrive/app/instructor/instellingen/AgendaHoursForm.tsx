"use client";

import { useState, useTransition } from "react";
import { Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateInstructorAgendaPreferences } from "./actions";

const START_OPTIONS = Array.from({ length: 24 }, (_, hour) => hour);
const END_OPTIONS = Array.from({ length: 24 }, (_, index) => index + 1);

function hourLabel(hour: number) {
  if (hour === 24) return "24:00";
  return `${String(hour).padStart(2, "0")}:00`;
}

export function AgendaHoursForm({
  initialStartHour,
  initialEndHour,
}: {
  initialStartHour: number;
  initialEndHour: number;
}) {
  const [startHour, setStartHour] = useState(initialStartHour);
  const [endHour, setEndHour] = useState(initialEndHour);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    const formData = new FormData();
    formData.set("calendar_start_hour", String(startHour));
    formData.set("calendar_end_hour", String(endHour));
    startTransition(async () => {
      const result = await updateInstructorAgendaPreferences(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-background/70 px-4 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Clock3 className="h-4 w-4" aria-hidden />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">
            Zichtbare agenda-uren
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            Kies welk tijdsbereik je standaard ziet in je dagkolom en agenda.
            Deze voorkeur blijft bewaard voor later gebruik in de instructeurapp.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Vanaf</span>
          <select
            value={startHour}
            onChange={(event) => {
              const next = Number(event.target.value);
              setStartHour(next);
              if (next >= endHour) {
                setEndHour(Math.min(24, next + 1));
              }
            }}
            disabled={pending}
            className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
          >
            {START_OPTIONS.map((hour) => (
              <option key={hour} value={hour}>
                {hourLabel(hour)}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Tot</span>
          <select
            value={endHour}
            onChange={(event) => setEndHour(Number(event.target.value))}
            disabled={pending}
            className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
          >
            {END_OPTIONS.filter((hour) => hour > startHour).map((hour) => (
              <option key={hour} value={hour}>
                {hourLabel(hour)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Default bereik: 06:00 - 22:00. Je kunt dit later altijd opnieuw aanpassen.
        </p>
        <Button
          type="button"
          onClick={save}
          disabled={pending}
          className="min-w-32"
        >
          {pending ? "Opslaan..." : "Agenda bewaren"}
        </Button>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {saved ? (
        <p className="text-sm text-success">Agenda-uren opgeslagen.</p>
      ) : null}
    </div>
  );
}
