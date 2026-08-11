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
import {
  INSTRUCTOR_PLANNING_TYPES,
  type InstructorPlanningType,
} from "@/lib/agenda/types";
import { cn } from "@/lib/utils";
import type { InstructorAgendaCreateOptions } from "../../application/instructor-agenda-create-options";
import { appointmentTypePresentation } from "../../application/appointment-type-catalog";
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
  "!absolute inset-x-2 bottom-2 mx-0 !w-auto max-h-[min(80dvh,48rem)] max-w-none scroll-py-6 overscroll-contain rounded-[1.5rem] border p-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-6 sm:inset-x-4 sm:p-6 md:!relative md:inset-auto md:mx-4 md:!w-full md:max-h-[86dvh] md:max-w-xl md:rounded-[1.5rem]";

const QUICK_ADD_DURATION_BY_TYPE = Object.fromEntries(
  INSTRUCTOR_PLANNING_TYPES.map((type) => [
    type,
    appointmentTypePresentation(type).defaultDurationMinutes,
  ]),
) as Partial<Record<InstructorPlanningType, number>>;

function dispatchCalendarEvent(
  name: string,
  detail: Record<string, string | number> = {},
) {
  window.dispatchEvent(
    new CustomEvent("nxtdrive:analytics", { detail: { name, ...detail } }),
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
  offline,
  createAction = createInstructorAgendaItem,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: InstructorDayCalendarType | null;
  selectedDate: string;
  selectedTime: string;
  options?: InstructorAgendaCreateOptions;
  redirectTo: string;
  offline: boolean;
  createAction?: (formData: FormData) => void | Promise<void>;
}) {
  const presentation = type ? appointmentTypePresentation(type) : null;
  if (!presentation || presentation.creationFlow === "EXISTING_ONLY")
    return null;
  if (offline) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={SHEET_CLASS} data-appointment-create-sheet="">
          <DialogHeader className="pr-9 pb-1">
            <DialogTitle autoFocus tabIndex={-1} className="outline-none">
              Nieuwe afspraak
            </DialogTitle>
            <DialogDescription>
              Datum en starttijd blijven geselecteerd in je dagagenda.
            </DialogDescription>
          </DialogHeader>
          <div
            className="flex gap-2 rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-sm font-semibold text-amber-950"
            role="status"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            Je bent offline. Nieuwe afspraken kunnen worden toegevoegd zodra je
            weer verbinding hebt.
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  if (!options) {
    const params = new URLSearchParams({
      type: presentation.type,
      date: selectedDate,
      time: selectedTime,
    });
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={SHEET_CLASS} data-appointment-create-sheet="">
          <DialogHeader>
            <DialogTitle autoFocus tabIndex={-1}>
              Nieuwe afspraak
            </DialogTitle>
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
      <DialogContent
        className={cn(SHEET_CLASS, "md:max-w-3xl")}
        data-appointment-create-sheet=""
      >
        <DialogHeader className="pr-9 pb-1">
          <DialogTitle
            autoFocus
            tabIndex={-1}
            className="scroll-mt-6 font-black outline-none"
          >
            Nieuwe afspraak
          </DialogTitle>
          <DialogDescription>
            Datum en starttijd zijn vanuit de dagagenda ingevuld. De bestaande
            planningcheck wordt bij opslaan uitgevoerd.
          </DialogDescription>
        </DialogHeader>
        <AppointmentForm
          action={createAction}
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
          returnToCalendar
          submitLabel="Afspraak toevoegen"
          durationByType={{
            ...QUICK_ADD_DURATION_BY_TYPE,
            lesson: options.defaultLessonDurationMinutes,
          }}
          onTypeChange={(appointmentType) =>
            dispatchCalendarEvent("appointment_type_selected", {
              appointment_type: appointmentType,
            })
          }
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
