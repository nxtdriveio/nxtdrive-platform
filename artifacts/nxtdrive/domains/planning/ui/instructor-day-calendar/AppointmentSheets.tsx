"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CarFront,
  ClipboardCheck,
  Coffee,
  Flag,
  GraduationCap,
  MapPin,
  Navigation,
  UserRound,
  Wrench,
} from "lucide-react";
import { createInstructorAgendaItem } from "@/app/instructeur/agenda/nieuw/actions";
import { AppointmentForm } from "@/components/agenda/AppointmentForm";
import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { InstructorPlanningType } from "@/lib/agenda/types";
import { cn } from "@/lib/utils";
import type { InstructorAgendaCreateOptions } from "../../application/instructor-agenda-create-options";
import {
  QUICK_ADD_APPOINTMENT_TYPES,
  appointmentTypePresentation,
} from "../../application/appointment-type-catalog";
import type {
  InstructorDayAgendaItem,
  InstructorDayCalendarType,
} from "../../domain/instructor-day-calendar";

const ICONS = {
  car: CarFront,
  graduation: GraduationCap,
  flag: Flag,
  clipboard: ClipboardCheck,
  coffee: Coffee,
  user: UserRound,
  calendar: CalendarDays,
  tools: Wrench,
  book: BookOpen,
};

const SHEET_CLASS =
  "!absolute inset-x-0 bottom-0 mx-0 max-h-[min(88dvh,48rem)] max-w-none rounded-b-none rounded-t-[1.5rem] border-b-0 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:p-5 md:!relative md:inset-auto md:mx-4 md:max-h-[86dvh] md:max-w-xl md:rounded-[1.5rem] md:border-b";

function dispatchCalendarEvent(
  name: string,
  detail: Record<string, string | number> = {},
) {
  window.dispatchEvent(
    new CustomEvent("nxtdrive:analytics", { detail: { name, ...detail } }),
  );
}

export function AppointmentTypePicker({
  open,
  onOpenChange,
  selectedDateLabel,
  selectedTime,
  offline,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDateLabel: string;
  selectedTime: string;
  offline: boolean;
  onSelect: (type: InstructorDayCalendarType) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={SHEET_CLASS} data-appointment-type-picker="">
        <DialogHeader className="pr-9">
          <DialogTitle className="font-black">Nieuwe afspraak</DialogTitle>
          <DialogDescription>
            {selectedDateLabel} · {selectedTime}. Wat wil je toevoegen?
          </DialogDescription>
        </DialogHeader>
        {offline ? (
          <div
            className="mb-3 flex gap-2 rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-xs font-semibold text-amber-950"
            role="status"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            Je bent offline. Nieuwe afspraken kunnen worden toegevoegd zodra je
            weer verbinding hebt.
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {QUICK_ADD_APPOINTMENT_TYPES.map((presentation) => {
            const Icon = ICONS[presentation.icon];
            return (
              <button
                key={presentation.type}
                type="button"
                disabled={offline}
                onClick={() => {
                  dispatchCalendarEvent("appointment_type_selected", {
                    appointment_type: presentation.type,
                  });
                  onSelect(presentation.type);
                }}
                className="flex min-h-14 items-center gap-2 rounded-xl border border-brand-border bg-brand-muted/40 px-3 py-2.5 text-left text-sm font-bold text-foreground transition hover:border-brand-primary/35 hover:bg-brand-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-card text-brand-primary shadow-sm">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 truncate">
                  {presentation.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="mt-3 min-h-11 w-full rounded-xl px-4 text-sm font-bold text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
        >
          Annuleren
        </button>
      </DialogContent>
    </Dialog>
  );
}

export function AppointmentCreateSheet({
  open,
  onOpenChange,
  type,
  selectedDate,
  selectedTime,
  options,
  redirectTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: InstructorDayCalendarType | null;
  selectedDate: string;
  selectedTime: string;
  options?: InstructorAgendaCreateOptions;
  redirectTo: string;
}) {
  const presentation = type ? appointmentTypePresentation(type) : null;
  if (!presentation || presentation.creationFlow === "EXISTING_ONLY")
    return null;
  if (!options) {
    const params = new URLSearchParams({
      type: presentation.type,
      date: selectedDate,
      time: selectedTime,
    });
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={SHEET_CLASS}>
          <DialogHeader>
            <DialogTitle>Nieuwe {presentation.label.toLowerCase()}</DialogTitle>
            <DialogDescription>
              Open de bestaande beveiligde afspraakflow met datum en tijd alvast
              ingevuld.
            </DialogDescription>
          </DialogHeader>
          <Link
            href={`/instructeur/agenda/nieuw?${params.toString()}`}
            className={cn(buttonVariants(), "w-full")}
          >
            Doorgaan
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(SHEET_CLASS, "md:max-w-3xl")}>
        <DialogHeader className="pr-9">
          <DialogTitle className="font-black">
            Nieuwe {presentation.label.toLowerCase()}
          </DialogTitle>
          <DialogDescription>
            Datum en starttijd zijn vanuit de dagagenda ingevuld. De bestaande
            planningcheck wordt bij opslaan uitgevoerd.
          </DialogDescription>
        </DialogHeader>
        <AppointmentForm
          action={createInstructorAgendaItem}
          mode="create"
          redirectTo={redirectTo}
          errorTo={`/instructeur/agenda/nieuw?type=${presentation.type}&date=${selectedDate}&time=${selectedTime}`}
          branches={[...options.branches]}
          ownInstructor={options.ownInstructor}
          students={[...options.students]}
          vehicles={[...options.vehicles]}
          serviceAreas={[...options.serviceAreas]}
          defaults={{
            type: presentation.type as InstructorPlanningType,
            branchId: options.branches[0]?.id ?? null,
            date: selectedDate,
            time: selectedTime,
            durationMin:
              presentation.type === "lesson"
                ? options.defaultLessonDurationMinutes
                : presentation.defaultDurationMinutes,
            bufferMin:
              presentation.type === "lesson"
                ? options.defaultLessonBufferMinutes
                : 0,
          }}
          allowLesson
          lockType
          returnToCalendar
          submitLabel={`${presentation.label} toevoegen`}
        />
      </DialogContent>
    </Dialog>
  );
}

function travelText(item: InstructorDayAgendaItem): string | null {
  const travel = item.travelFromPrevious;
  if (!travel) return null;
  if (travel.durationMinutes === undefined) {
    return "Reistijd niet beschikbaar · controleer route handmatig";
  }
  const available =
    travel.availableMinutes === undefined
      ? "beschikbare tijd onbekend"
      : `${travel.availableMinutes} min beschikbaar`;
  return `${travel.durationMinutes} min reistijd · ${available}`;
}

export function AppointmentQuickView({
  item,
  open,
  onOpenChange,
  dateLabel,
  timeLabel,
}: {
  item: InstructorDayAgendaItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dateLabel: string;
  timeLabel: string;
}) {
  if (!item) return null;
  const presentation = appointmentTypePresentation(item.type);
  const Icon = ICONS[presentation.icon];
  const travel = travelText(item);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!absolute inset-x-0 bottom-0 mx-0 max-h-[82dvh] max-w-none rounded-b-none rounded-t-[1.5rem] border-b-0 p-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[25rem] md:rounded-l-[1.5rem] md:rounded-r-none md:border-b md:border-r-0"
        data-appointment-quick-view=""
      >
        <DialogHeader className="pr-9">
          <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-brand-accent text-brand-primary">
            <Icon className="h-5 w-5" aria-hidden />
          </div>
          <DialogTitle className="font-black">{presentation.label}</DialogTitle>
          <DialogDescription>
            {dateLabel} · {timeLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {item.participantLabel ? (
            <div className="rounded-2xl bg-brand-muted/55 p-3">
              <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">
                Leerling / contact
              </p>
              <p className="mt-1 font-black text-foreground">
                {item.participantLabel}
              </p>
            </div>
          ) : null}
          {item.location?.formattedAddress || item.location?.label ? (
            <div className="flex gap-3 rounded-2xl border border-brand-border p-3">
              <MapPin
                className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary"
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-xs font-black text-foreground">
                  {item.location.label ?? "Locatie"}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {item.location.formattedAddress}
                </p>
              </div>
            </div>
          ) : null}
          {travel ? (
            <div
              className={cn(
                "flex gap-3 rounded-2xl border p-3 text-sm",
                item.travelFromPrevious?.status === "INFEASIBLE"
                  ? "border-rose-300 bg-rose-50 text-rose-950"
                  : item.travelFromPrevious?.status === "TIGHT"
                    ? "border-amber-300 bg-amber-50 text-amber-950"
                    : "border-brand-border bg-brand-muted/40 text-muted-foreground",
              )}
            >
              {item.travelFromPrevious?.status === "INFEASIBLE" ? (
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0"
                  aria-hidden
                />
              ) : (
                <Navigation className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              )}
              <span>{travel}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          {item.permissions.canStartLesson ? (
            <Link
              href={item.evaluationHref ?? item.href}
              className={buttonVariants()}
            >
              Start les
            </Link>
          ) : null}
          {item.permissions.canNavigate ? (
            <Link
              href="/instructeur/dagroute"
              className={buttonVariants({ variant: "outline" })}
            >
              <Navigation className="h-4 w-4" aria-hidden />
              Navigeer
            </Link>
          ) : null}
          {item.permissions.canOpen ? (
            <Link
              href={item.href}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "col-span-2",
              )}
            >
              {item.permissions.canEdit ? "Bekijken / wijzigen" : "Bekijken"}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
