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
import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { InstructorAgendaWizardBootstrap } from "../../application/smart-appointment-contracts";
import { appointmentTypePresentation } from "../../application/appointment-type-catalog";
import type { InstructorDayAgendaItem } from "../../domain/instructor-day-calendar";
import {
  SmartAppointmentWizard,
  type SmartAppointmentWizardActions,
} from "../appointment-wizard/SmartAppointmentWizard";

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

export function AppointmentCreateSheet({
  open,
  onOpenChange,
  selectedDate,
  selectedTime,
  bootstrap,
  offline,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: string;
  selectedTime: string;
  bootstrap?: InstructorAgendaWizardBootstrap;
  offline: boolean;
  actions?: SmartAppointmentWizardActions;
}) {
  if (!bootstrap) return null;
  return (
    <SmartAppointmentWizard
      open={open}
      onOpenChange={onOpenChange}
      selectedDate={selectedDate}
      selectedTime={selectedTime}
      bootstrap={bootstrap}
      offline={offline}
      actions={actions}
    />
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
