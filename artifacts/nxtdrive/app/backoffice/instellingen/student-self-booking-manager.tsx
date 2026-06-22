"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  DEFAULT_STUDENT_SELF_BOOKING_POLICY,
  type StudentSelfBookingPolicy,
} from "@/lib/student-booking/policy-shared";
import {
  resetStudentSelfBookingPolicy,
  saveStudentSelfBookingPolicy,
} from "./actions";

type ToggleKey =
  | "self_booking_enabled"
  | "students_can_book_lessons"
  | "students_can_reschedule_lessons"
  | "students_can_cancel_lessons"
  | "manual_approval_required"
  | "instructor_approval_required"
  | "student_final_confirmation_required"
  | "allow_booking_with_unpaid_invoice"
  | "allow_booking_without_sufficient_credit";

type NumberKey =
  | "max_future_bookings_per_student"
  | "max_lessons_per_week"
  | "min_notice_hours_for_booking"
  | "booking_window_days";

const TOGGLES: Array<{
  key: ToggleKey;
  label: string;
  description: string;
}> = [
  {
    key: "self_booking_enabled",
    label: "Zelf boeken inschakelen",
    description: "Hoofdschakelaar voor de leerlingapp.",
  },
  {
    key: "students_can_book_lessons",
    label: "Leerlingen mogen rijlessen boeken",
    description: "Toont beschikbare momenten en laat leerlingen boeken of aanvragen.",
  },
  {
    key: "students_can_reschedule_lessons",
    label: "Leerlingen mogen lessen verzetten",
    description: "Blijft gekoppeld aan de bestaande verzetregels en min. notice.",
  },
  {
    key: "students_can_cancel_lessons",
    label: "Leerlingen mogen lessen annuleren",
    description: "Gebruikt het annuleringsbeleid voor refunds en deadlines.",
  },
  {
    key: "manual_approval_required",
    label: "Backoffice-goedkeuring vereist",
    description: "Elke keuze wordt een aanvraag in plaats van direct geboekt.",
  },
  {
    key: "instructor_approval_required",
    label: "Instructeur-goedkeuring vereist",
    description: "De instructeur bevestigt voordat de les definitief wordt.",
  },
  {
    key: "student_final_confirmation_required",
    label: "Leerlingbevestiging registreren",
    description: "Legt expliciet vast dat de leerling dit moment heeft gekozen.",
  },
  {
    key: "allow_booking_with_unpaid_invoice",
    label: "Boeken met open factuur toestaan",
    description: "Laat open facturen niet blokkeren, tenzij pakketregels strenger zijn.",
  },
  {
    key: "allow_booking_without_sufficient_credit",
    label: "Aanvraag toestaan bij onvoldoende tegoed",
    description: "De leerling kan geen directe boeking maken, maar wel een aanvraag sturen.",
  },
];

const NUMBERS: Array<{
  key: NumberKey;
  label: string;
  min: number;
  max: number;
  suffix: string;
}> = [
  {
    key: "max_future_bookings_per_student",
    label: "Max. toekomstige lessen",
    min: 1,
    max: 50,
    suffix: "lessen",
  },
  {
    key: "max_lessons_per_week",
    label: "Max. lessen per week",
    min: 1,
    max: 21,
    suffix: "lessen",
  },
  {
    key: "min_notice_hours_for_booking",
    label: "Minimale boekingstermijn",
    min: 0,
    max: 8760,
    suffix: "uur",
  },
  {
    key: "booking_window_days",
    label: "Boekingsvenster",
    min: 1,
    max: 365,
    suffix: "dagen",
  },
];

function toNumberState(policy: StudentSelfBookingPolicy): Record<NumberKey, string> {
  return {
    max_future_bookings_per_student: String(
      policy.max_future_bookings_per_student,
    ),
    max_lessons_per_week: String(policy.max_lessons_per_week),
    min_notice_hours_for_booking: String(policy.min_notice_hours_for_booking),
    booking_window_days: String(policy.booking_window_days),
  };
}

export function StudentSelfBookingManager({
  policy,
}: {
  policy: StudentSelfBookingPolicy;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [toggleState, setToggleState] = useState<Record<ToggleKey, boolean>>({
    self_booking_enabled: policy.self_booking_enabled,
    students_can_book_lessons: policy.students_can_book_lessons,
    students_can_reschedule_lessons: policy.students_can_reschedule_lessons,
    students_can_cancel_lessons: policy.students_can_cancel_lessons,
    manual_approval_required: policy.manual_approval_required,
    instructor_approval_required: policy.instructor_approval_required,
    student_final_confirmation_required:
      policy.student_final_confirmation_required,
    allow_booking_with_unpaid_invoice:
      policy.allow_booking_with_unpaid_invoice,
    allow_booking_without_sufficient_credit:
      policy.allow_booking_without_sufficient_credit,
  });
  const [numberState, setNumberState] = useState(toNumberState(policy));

  function validationMessage(): string | null {
    for (const item of NUMBERS) {
      const value = Number(numberState[item.key]);
      if (
        numberState[item.key].trim() === "" ||
        !Number.isFinite(value) ||
        value < item.min ||
        value > item.max
      ) {
        return `${item.label} moet tussen ${item.min} en ${item.max} liggen.`;
      }
    }
    if (
      toggleState.self_booking_enabled &&
      !toggleState.students_can_book_lessons
    ) {
      return "Schakel ook 'Leerlingen mogen rijlessen boeken' in om de flow zichtbaar te maken.";
    }
    return null;
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "Er ging iets mis.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  function onSave() {
    const msg = validationMessage();
    if (msg) {
      setError(msg);
      return;
    }
    const fd = new FormData();
    for (const item of TOGGLES) {
      fd.set(item.key, toggleState[item.key] ? "true" : "false");
    }
    for (const item of NUMBERS) {
      fd.set(item.key, numberState[item.key]);
    }
    run(() => saveStudentSelfBookingPolicy(fd));
  }

  function onReset() {
    run(async () => {
      const result = await resetStudentSelfBookingPolicy();
      if (result.ok) {
        setToggleState({
          self_booking_enabled:
            DEFAULT_STUDENT_SELF_BOOKING_POLICY.self_booking_enabled,
          students_can_book_lessons:
            DEFAULT_STUDENT_SELF_BOOKING_POLICY.students_can_book_lessons,
          students_can_reschedule_lessons:
            DEFAULT_STUDENT_SELF_BOOKING_POLICY.students_can_reschedule_lessons,
          students_can_cancel_lessons:
            DEFAULT_STUDENT_SELF_BOOKING_POLICY.students_can_cancel_lessons,
          manual_approval_required:
            DEFAULT_STUDENT_SELF_BOOKING_POLICY.manual_approval_required,
          instructor_approval_required:
            DEFAULT_STUDENT_SELF_BOOKING_POLICY.instructor_approval_required,
          student_final_confirmation_required:
            DEFAULT_STUDENT_SELF_BOOKING_POLICY.student_final_confirmation_required,
          allow_booking_with_unpaid_invoice:
            DEFAULT_STUDENT_SELF_BOOKING_POLICY.allow_booking_with_unpaid_invoice,
          allow_booking_without_sufficient_credit:
            DEFAULT_STUDENT_SELF_BOOKING_POLICY.allow_booking_without_sufficient_credit,
        });
        setNumberState(toNumberState(DEFAULT_STUDENT_SELF_BOOKING_POLICY));
      }
      return result;
    });
  }

  return (
    <div className="space-y-5">
      <p className="text-sm leading-6 text-muted-foreground">
        Bepaal of bestaande leerlingen zelf een rijles kunnen plannen. De
        uiteindelijke boeking blijft server-side gevalideerd op pakketregels,
        tegoed, open facturen, instructeurscope en planningconflicten.
      </p>

      {error ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          Zelfboekingsbeleid opgeslagen.
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {TOGGLES.map((item) => (
          <label
            key={item.key}
            className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 px-3 py-3"
          >
            <input
              type="checkbox"
              checked={toggleState[item.key]}
              onChange={(event) =>
                setToggleState((current) => ({
                  ...current,
                  [item.key]: event.target.checked,
                }))
              }
              className="mt-1 h-4 w-4 rounded border-border"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">
                {item.label}
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                {item.description}
              </span>
            </span>
          </label>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {NUMBERS.map((item) => (
          <div key={item.key} className="space-y-1.5">
            <Label htmlFor={item.key}>{item.label}</Label>
            <div className="flex items-center gap-2">
              <Input
                id={item.key}
                type="number"
                min={item.min}
                max={item.max}
                value={numberState[item.key]}
                onChange={(event) =>
                  setNumberState((current) => ({
                    ...current,
                    [item.key]: event.target.value,
                  }))
                }
                className="w-28 tabular-nums"
              />
              <span className="text-xs text-muted-foreground">
                {item.suffix}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={onSave}>
          Zelfboekingsbeleid opslaan
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={onReset}
        >
          Terug naar standaard
        </Button>
      </div>
    </div>
  );
}
