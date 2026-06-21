"use client";

import { useMemo, useState } from "react";
import { Ban, CalendarDays, Clock3, Repeat, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  EXCEPTION_KIND_LABEL,
  formatInterval,
  type AvailabilityException,
} from "@/lib/availability/types";
import type { ResolvedAvailabilityDay } from "@/lib/availability/service";

const fullDateFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

function formatDate(dateKey: string): string {
  return fullDateFmt.format(new Date(`${dateKey}T00:00:00Z`));
}

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0 uur";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} uur`;
  return `${hours}u ${rest}m`;
}

export function AvailabilityCalendar({
  days,
  exceptions,
  instructorId,
  branchId = null,
  redirectTo,
  addAction,
  deleteAction,
}: {
  days: ResolvedAvailabilityDay[];
  exceptions: AvailabilityException[];
  instructorId: string;
  branchId?: string | null;
  redirectTo: string;
  addAction: (formData: FormData) => void | Promise<void>;
  deleteAction: (formData: FormData) => void | Promise<void>;
}) {
  const [selectedDate, setSelectedDate] = useState(days[0]?.date ?? "");
  const [kind, setKind] = useState<"available" | "blocked">("blocked");
  const [wholeDay, setWholeDay] = useState(true);
  const [repeatMode, setRepeatMode] = useState("none");
  const selectedDay = days.find((day) => day.date === selectedDate) ?? days[0];
  const showTimes = !(kind === "blocked" && wholeDay);
  const selectedExceptions = useMemo(
    () => exceptions.filter((exception) => exception.exception_date === selectedDate),
    [exceptions, selectedDate],
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(19rem,0.9fr)]">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black text-foreground">Dagkalender</p>
            <p className="text-xs font-semibold text-muted-foreground">
              Basisweek plus uitzonderingen, direct zoals planning dit gebruikt.
            </p>
          </div>
          <Badge variant="primary">{days.length} dagen</Badge>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {days.map((day) => (
            <button
              key={day.date}
              type="button"
              onClick={() => setSelectedDate(day.date)}
              className={cn(
                "rounded-2xl border p-3 text-left transition hover:border-brand-primary/45 hover:bg-brand-muted/40",
                selectedDate === day.date
                  ? "border-brand-primary bg-brand-accent/70 shadow-sm"
                  : "border-brand-border bg-white/80",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-foreground">{day.dayLabel}</p>
                  <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
                    {day.sourceLabel}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-black",
                    day.status === "open"
                      ? "bg-emerald-100 text-emerald-700"
                      : day.status === "adjusted"
                        ? "bg-violet-100 text-violet-700"
                        : "bg-slate-100 text-slate-600",
                  )}
                >
                  {day.active ? "Open" : "Dicht"}
                </span>
              </div>
              <p className="mt-3 truncate text-xs font-bold text-foreground">
                {day.intervalLabel}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-muted-foreground">
                {formatMinutes(day.availableMinutes)}
                {day.exceptionCount > 0 ? ` - ${day.exceptionCount} wijziging(en)` : ""}
              </p>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-brand-border bg-white/86 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black text-foreground">
              {selectedDay ? formatDate(selectedDay.date) : "Kies een dag"}
            </p>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">
              {selectedDay?.intervalLabel ?? "Geen dag geselecteerd"}
            </p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-accent text-brand-primary">
            <CalendarDays className="h-4 w-4" aria-hidden />
          </span>
        </div>

        <form action={addAction} className="mt-4 grid gap-3">
          <input type="hidden" name="instructor_id" value={instructorId} />
          <input type="hidden" name="branch_id" value={branchId ?? ""} />
          <input type="hidden" name="redirect_to" value={redirectTo} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="calendar-date">Datum</Label>
              <Input
                id="calendar-date"
                name="exception_date"
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="calendar-kind">Type</Label>
              <Select
                id="calendar-kind"
                name="kind"
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as "available" | "blocked")
                }
              >
                <option value="blocked">{EXCEPTION_KIND_LABEL.blocked}</option>
                <option value="available">{EXCEPTION_KIND_LABEL.available}</option>
              </Select>
            </div>
          </div>

          {kind === "blocked" ? (
            <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <input
                type="checkbox"
                name="whole_day"
                checked={wholeDay}
                onChange={(event) => setWholeDay(event.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Hele dag blokkeren
            </label>
          ) : null}

          {showTimes ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="calendar-start">Van</Label>
                <Input
                  id="calendar-start"
                  name="start_time"
                  type="time"
                  defaultValue="09:00"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="calendar-end">Tot</Label>
                <Input
                  id="calendar-end"
                  name="end_time"
                  type="time"
                  defaultValue="17:00"
                  required
                />
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="calendar-repeat">Herhaling</Label>
              <Select
                id="calendar-repeat"
                name="repeat_mode"
                value={repeatMode}
                onChange={(event) => setRepeatMode(event.target.value)}
              >
                <option value="none">Eenmalig</option>
                <option value="daily">Dagelijks</option>
                <option value="weekdays">Elke werkdag</option>
                <option value="weekly">Wekelijks</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="calendar-repeat-until">Tot en met</Label>
              <Input
                id="calendar-repeat-until"
                name="repeat_until"
                type="date"
                disabled={repeatMode === "none"}
                required={repeatMode !== "none"}
                min={selectedDate}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="calendar-note">Notitie (optioneel)</Label>
            <Input
              id="calendar-note"
              name="note"
              placeholder="bv. vakantie, extra avond, examenblok"
            />
          </div>

          <Button type="submit" className="w-full">
            <Repeat className="h-4 w-4" aria-hidden />
            Beschikbaarheid opslaan
          </Button>
        </form>

        <div className="mt-5 space-y-2">
          <div className="flex items-center gap-2 text-sm font-black text-foreground">
            <Clock3 className="h-4 w-4 text-brand-primary" aria-hidden />
            Wijzigingen op deze dag
          </div>
          {selectedExceptions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-brand-border bg-brand-muted/35 px-3 py-2 text-sm font-semibold text-muted-foreground">
              Geen uitzonderingen voor deze dag.
            </p>
          ) : (
            <ul className="space-y-2">
              {selectedExceptions.map((exception) => (
                <li
                  key={exception.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-brand-border bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-black text-foreground">
                      {EXCEPTION_KIND_LABEL[exception.kind]}
                    </p>
                    <p className="truncate text-xs font-semibold text-muted-foreground">
                      {exception.start_min === null || exception.end_min === null
                        ? "Hele dag"
                        : formatInterval({
                            start_min: exception.start_min,
                            end_min: exception.end_min,
                          })}
                      {exception.note ? ` - ${exception.note}` : ""}
                    </p>
                  </div>
                  <form action={deleteAction}>
                    <input type="hidden" name="redirect_to" value={redirectTo} />
                    <input type="hidden" name="exception_id" value={exception.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon"
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

        <div className="mt-4 flex gap-2 rounded-xl bg-brand-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground">
          <Ban className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" aria-hidden />
          Gesloten of geblokkeerde dagen worden niet als vrije ruimte aan planning aangeboden.
        </div>
      </div>
    </div>
  );
}
