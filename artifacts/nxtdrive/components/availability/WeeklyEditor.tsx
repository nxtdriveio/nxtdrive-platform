"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  WEEKDAY_LABEL,
  WEEKDAY_ORDER,
  hhmmToMinutes,
  minutesToHHMM,
  type WeeklyAvailability,
} from "@/lib/availability/types";

type Row = { weekday: number; start: string; end: string };

export function WeeklyEditor({
  initial,
  instructorId,
  branchId = null,
  redirectTo,
  action,
}: {
  initial: WeeklyAvailability[];
  instructorId: string;
  branchId?: string | null;
  redirectTo: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial
      .map((b) => ({
        weekday: b.weekday,
        start: minutesToHHMM(b.start_min),
        end: minutesToHHMM(b.end_min),
      }))
      .sort(byWeekdayThenStart),
  );

  const blocksJson = useMemo(() => {
    const blocks = rows
      .map((r) => {
        const start_min = hhmmToMinutes(r.start);
        const end_min = hhmmToMinutes(r.end);
        return start_min !== null && end_min !== null
          ? { weekday: r.weekday, start_min, end_min }
          : null;
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);
    return JSON.stringify(blocks);
  }, [rows]);

  const invalid = rows.some((r) => {
    const s = hhmmToMinutes(r.start);
    const e = hhmmToMinutes(r.end);
    return s === null || e === null || s >= e;
  });

  function addRow(weekday: number) {
    setRows((prev) =>
      [...prev, { weekday, start: "09:00", end: "17:00" }].sort(
        byWeekdayThenStart,
      ),
    );
  }

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="instructor_id" value={instructorId} />
      <input type="hidden" name="branch_id" value={branchId ?? ""} />
      <input type="hidden" name="redirect_to" value={redirectTo} />
      <input type="hidden" name="blocks" value={blocksJson} />

      <div className="space-y-3">
        {WEEKDAY_ORDER.map((weekday) => {
          const dayRows = rows
            .map((r, i) => ({ r, i }))
            .filter(({ r }) => r.weekday === weekday);
          return (
            <div
              key={weekday}
              className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-start"
            >
              <div className="w-28 shrink-0 pt-2 text-sm font-medium text-foreground">
                {WEEKDAY_LABEL[weekday]}
              </div>
              <div className="flex-1 space-y-2">
                {dayRows.length === 0 ? (
                  <p className="pt-2 text-sm text-muted-foreground">
                    Niet beschikbaar
                  </p>
                ) : (
                  dayRows.map(({ r, i }) => {
                    const s = hhmmToMinutes(r.start);
                    const e = hhmmToMinutes(r.end);
                    const rowInvalid = s === null || e === null || s >= e;
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={r.start}
                          aria-label="Starttijd"
                          className="w-32"
                          onChange={(ev) =>
                            updateRow(i, { start: ev.target.value })
                          }
                        />
                        <span className="text-muted-foreground">–</span>
                        <Input
                          type="time"
                          value={r.end}
                          aria-label="Eindtijd"
                          className="w-32"
                          onChange={(ev) =>
                            updateRow(i, { end: ev.target.value })
                          }
                        />
                        {rowInvalid && (
                          <span className="text-xs text-destructive">
                            Ongeldig
                          </span>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label="Blok verwijderen"
                          onClick={() => removeRow(i)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => addRow(weekday)}
                >
                  <Plus className="mr-1 h-4 w-4" /> Blok toevoegen
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={invalid}>
          Wekelijkse beschikbaarheid opslaan
        </Button>
        {invalid && (
          <span className="text-sm text-destructive">
            Corrigeer de gemarkeerde tijden om op te slaan.
          </span>
        )}
      </div>
    </form>
  );
}

function byWeekdayThenStart(a: Row, b: Row): number {
  const ai = WEEKDAY_ORDER.indexOf(a.weekday);
  const bi = WEEKDAY_ORDER.indexOf(b.weekday);
  if (ai !== bi) return ai - bi;
  return a.start.localeCompare(b.start);
}
