"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AGENDA_APPOINTMENT_TYPES,
  APPOINTMENT_DURATIONS,
  APPOINTMENT_TYPE_LABEL,
  isStudentLinkedType,
  type AgendaAppointmentType,
} from "@/lib/agenda/types";

type InstructorOption = { id: string; full_name: string | null };
type StudentOption = { id: string; full_name: string };

export type AppointmentFormDefaults = {
  type?: AgendaAppointmentType;
  instructorId?: string;
  studentId?: string | null;
  date?: string;
  time?: string;
  durationMin?: number;
  title?: string | null;
  location?: string | null;
  notes?: string | null;
};

// Shared create/edit form for agenda appointments. Used by both the backoffice
// agenda (instructor selectable) and the instructor PWA (instructor pinned to
// self). The student field only appears for student-linked types.
export function AppointmentForm({
  action,
  mode,
  redirectTo,
  errorTo,
  appointmentId,
  instructors,
  ownInstructor,
  students,
  defaults,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  mode: "create" | "edit";
  redirectTo: string;
  errorTo: string;
  appointmentId?: string;
  // When provided, the instructor is selectable (admin). Otherwise pinned.
  instructors?: InstructorOption[];
  ownInstructor?: InstructorOption;
  students: StudentOption[];
  defaults?: AppointmentFormDefaults;
  submitLabel: string;
}) {
  const [type, setType] = useState<AgendaAppointmentType>(
    defaults?.type ?? "exam",
  );
  // In edit mode the type is immutable (the DB RPC does not change it).
  const typeLocked = mode === "edit";
  const showStudent = isStudentLinkedType(type);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="redirect_to" value={redirectTo} />
      <input type="hidden" name="error_to" value={errorTo} />
      {appointmentId ? (
        <input type="hidden" name="appointment_id" value={appointmentId} />
      ) : null}
      {/* When the type select is disabled it is not submitted — mirror it. */}
      {typeLocked ? <input type="hidden" name="type" value={type} /> : null}
      {!instructors && ownInstructor ? (
        <input type="hidden" name="instructor_id" value={ownInstructor.id} />
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="type">Type afspraak</Label>
          <Select
            id="type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as AgendaAppointmentType)}
            disabled={typeLocked}
            required
          >
            {AGENDA_APPOINTMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {APPOINTMENT_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </div>

        {instructors ? (
          <div className="space-y-1.5">
            <Label htmlFor="instructor_id">Instructeur</Label>
            <Select
              id="instructor_id"
              name="instructor_id"
              defaultValue={defaults?.instructorId ?? instructors[0]?.id ?? ""}
              required
            >
              {instructors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.full_name ?? "Instructeur"}
                </option>
              ))}
            </Select>
          </div>
        ) : ownInstructor ? (
          <div className="space-y-1.5">
            <Label>Instructeur</Label>
            <div className="flex h-10 items-center rounded-md border border-border bg-muted/40 px-3 text-sm text-muted-foreground">
              {ownInstructor.full_name ?? "Jij"}
            </div>
          </div>
        ) : null}

        {showStudent ? (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="student_id">Leerling (optioneel)</Label>
            <Select
              id="student_id"
              name="student_id"
              defaultValue={defaults?.studentId ?? ""}
            >
              <option value="">— Geen leerling —</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="date">Datum</Label>
          <Input
            id="date"
            name="date"
            type="date"
            required
            defaultValue={defaults?.date}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="time">Starttijd</Label>
          <Input
            id="time"
            name="time"
            type="time"
            required
            defaultValue={defaults?.time}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="duration_min">Duur (minuten)</Label>
          <Select
            id="duration_min"
            name="duration_min"
            defaultValue={String(defaults?.durationMin ?? 60)}
          >
            {APPOINTMENT_DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="title">Titel / omschrijving</Label>
          <Input
            id="title"
            name="title"
            maxLength={200}
            placeholder="Optioneel"
            defaultValue={defaults?.title ?? ""}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="location">Locatie</Label>
        <Input
          id="location"
          name="location"
          maxLength={200}
          placeholder="Optioneel"
          defaultValue={defaults?.location ?? ""}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notities</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          maxLength={1000}
          placeholder="Optioneel"
          defaultValue={defaults?.notes ?? ""}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Link href={redirectTo} className={buttonVariants({ variant: "ghost" })}>
          Annuleren
        </Link>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
