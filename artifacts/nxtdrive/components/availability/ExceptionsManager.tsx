"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  EXCEPTION_KIND_LABEL,
  formatInterval,
  type AvailabilityException,
} from "@/lib/availability/types";

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "short",
  day: "numeric",
  month: "long",
  year: "numeric",
});

function formatDate(dateKey: string): string {
  return dateFmt.format(new Date(`${dateKey}T00:00:00Z`));
}

export function ExceptionsManager({
  exceptions,
  instructorId,
  redirectTo,
  addAction,
  deleteAction,
}: {
  exceptions: AvailabilityException[];
  instructorId: string;
  redirectTo: string;
  addAction: (formData: FormData) => void | Promise<void>;
  deleteAction: (formData: FormData) => void | Promise<void>;
}) {
  const [kind, setKind] = useState<"available" | "blocked">("blocked");
  const [wholeDay, setWholeDay] = useState(true);
  const showTimes = !(kind === "blocked" && wholeDay);

  return (
    <div className="space-y-5">
      <form
        action={addAction}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        <input type="hidden" name="instructor_id" value={instructorId} />
        <input type="hidden" name="redirect_to" value={redirectTo} />

        <div className="space-y-1.5">
          <Label htmlFor="exc-date">Datum</Label>
          <Input id="exc-date" name="exception_date" type="date" required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="exc-kind">Type</Label>
          <Select
            id="exc-kind"
            name="kind"
            value={kind}
            onChange={(e) =>
              setKind(e.target.value as "available" | "blocked")
            }
          >
            <option value="blocked">{EXCEPTION_KIND_LABEL.blocked}</option>
            <option value="available">{EXCEPTION_KIND_LABEL.available}</option>
          </Select>
        </div>

        {kind === "blocked" && (
          <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
            <input
              type="checkbox"
              name="whole_day"
              checked={wholeDay}
              onChange={(e) => setWholeDay(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Hele dag
          </label>
        )}

        {showTimes && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="exc-start">Van</Label>
              <Input
                id="exc-start"
                name="start_time"
                type="time"
                defaultValue="09:00"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exc-end">Tot</Label>
              <Input
                id="exc-end"
                name="end_time"
                type="time"
                defaultValue="17:00"
                required
              />
            </div>
          </>
        )}

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="exc-note">Notitie (optioneel)</Label>
          <Input
            id="exc-note"
            name="note"
            placeholder="bv. vakantie, examen, extra avond"
          />
        </div>

        <div className="sm:col-span-2">
          <Button type="submit" size="sm">
            Uitzondering toevoegen
          </Button>
        </div>
      </form>

      {exceptions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nog geen uitzonderingen ingesteld.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {exceptions.map((exc) => (
            <li
              key={exc.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {formatDate(exc.exception_date)}
                  </span>
                  <span
                    className={
                      exc.kind === "available"
                        ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : "rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                    }
                  >
                    {EXCEPTION_KIND_LABEL[exc.kind]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {exc.start_min === null || exc.end_min === null
                      ? "Hele dag"
                      : formatInterval({
                          start_min: exc.start_min,
                          end_min: exc.end_min,
                        })}
                  </span>
                </div>
                {exc.note && (
                  <p className="truncate text-xs text-muted-foreground">
                    {exc.note}
                  </p>
                )}
              </div>
              <form action={deleteAction}>
                <input type="hidden" name="redirect_to" value={redirectTo} />
                <input type="hidden" name="exception_id" value={exc.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  aria-label="Uitzondering verwijderen"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
