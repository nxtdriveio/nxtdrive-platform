"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AGENDA_APPOINTMENT_TYPES,
  AGENDA_VISIBILITY_SCOPES,
  APPOINTMENT_VISIBILITY_LABEL,
  APPOINTMENT_DURATIONS,
  APPOINTMENT_TYPE_LABEL,
  isStudentLinkedType,
  type AgendaAppointmentType,
  type AgendaVisibilityScope,
} from "@/lib/agenda/types";

type BranchOption = { id: string; name: string };
type InstructorOption = { id: string; full_name: string | null };
type StudentOption = { id: string; full_name: string };
type TeamOption = { id: string; name: string; branch_id?: string | null };
type StaffOption = { id: string; full_name: string | null; roleLabel?: string | null };

export type AppointmentFormDefaults = {
  type?: AgendaAppointmentType;
  branchId?: string | null;
  instructorId?: string;
  studentId?: string | null;
  date?: string;
  time?: string;
  durationMin?: number;
  title?: string | null;
  location?: string | null;
  notes?: string | null;
  teamId?: string | null;
  visibilityScope?: AgendaVisibilityScope;
  participantUserIds?: string[];
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
  branches,
  instructors,
  ownInstructor,
  students,
  teams,
  staffOptions,
  defaults,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  mode: "create" | "edit";
  redirectTo: string;
  errorTo: string;
  appointmentId?: string;
  // When provided, the appointment can be assigned to a branch explicitly.
  branches?: BranchOption[];
  // When provided, the instructor is selectable (admin/planner). Otherwise pinned.
  instructors?: InstructorOption[];
  ownInstructor?: InstructorOption;
  students: StudentOption[];
  teams?: TeamOption[];
  staffOptions?: StaffOption[];
  defaults?: AppointmentFormDefaults;
  submitLabel: string;
}) {
  const [type, setType] = useState<AgendaAppointmentType>(
    defaults?.type ?? "exam",
  );
  // In edit mode the type is immutable (the DB RPC does not change it).
  const typeLocked = mode === "edit";
  // The instructor is also immutable in edit mode - update_agenda_appointment
  // keeps the original instructor. Show a read-only display instead of a select
  // so the form never offers an affordance the backend ignores.
  const instructorLocked = mode === "edit";
  const lockedInstructorName =
    (instructors?.find((i) => i.id === defaults?.instructorId)?.full_name ??
      ownInstructor?.full_name) ||
    "Instructeur";
  const lockedInstructorId = defaults?.instructorId ?? ownInstructor?.id ?? "";
  const showStudent = isStudentLinkedType(type);
  const defaultBranchId = defaults?.branchId ?? branches?.[0]?.id ?? "";
  const defaultVisibilityScope = defaults?.visibilityScope ?? "personal";

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="redirect_to" value={redirectTo} />
      <input type="hidden" name="error_to" value={errorTo} />
      {appointmentId ? (
        <input type="hidden" name="appointment_id" value={appointmentId} />
      ) : null}
      {/* When the type select is disabled it is not submitted - mirror it. */}
      {typeLocked ? <input type="hidden" name="type" value={type} /> : null}
      {(!instructors || instructorLocked) && lockedInstructorId ? (
        <input type="hidden" name="instructor_id" value={lockedInstructorId} />
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

        {branches && branches.length > 0 ? (
          <div className="space-y-1.5">
            <Label htmlFor="branch_id">Vestiging</Label>
            <Select
              id="branch_id"
              name="branch_id"
              defaultValue={defaultBranchId}
              required
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
            {showStudent ? (
              <p className="text-xs text-muted-foreground">
                Bij een gekoppelde leerling wordt de vestiging automatisch gelijkgezet met het leerlingdossier.
              </p>
            ) : null}
          </div>
        ) : null}

        {instructors && !instructorLocked ? (
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
        ) : instructors || ownInstructor ? (
          <div className="space-y-1.5">
            <Label>Instructeur</Label>
            <div className="flex h-10 items-center rounded-md border border-border bg-muted/40 px-3 text-sm text-muted-foreground">
              {instructorLocked
                ? lockedInstructorName
                : (ownInstructor?.full_name ?? "Jij")}
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
              <option value="">Geen leerling</option>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="visibility_scope">Zichtbaarheid</Label>
          <Select
            id="visibility_scope"
            name="visibility_scope"
            defaultValue={defaultVisibilityScope}
          >
            {AGENDA_VISIBILITY_SCOPES.map((scope) => (
              <option key={scope} value={scope}>
                {APPOINTMENT_VISIBILITY_LABEL[scope]}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            Persoonlijk voor jezelf, gedeeld met geselecteerde collega's of als teamblok zichtbaar.
          </p>
        </div>

        {teams && teams.length > 0 ? (
          <div className="space-y-1.5">
            <Label htmlFor="team_id">Team (optioneel)</Label>
            <Select
              id="team_id"
              name="team_id"
              defaultValue={defaults?.teamId ?? ""}
            >
              <option value="">Geen team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
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

      {staffOptions && staffOptions.length > 0 ? (
        <div className="space-y-2.5">
          <Label>Extra collega's (optioneel)</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {staffOptions.map((staff) => {
              const checked = defaults?.participantUserIds?.includes(staff.id) ?? false;
              return (
                <label
                  key={staff.id}
                  className="flex items-start gap-3 rounded-2xl border border-border/70 bg-background px-3 py-2.5 text-sm"
                >
                  <input
                    type="checkbox"
                    name="participant_user_ids"
                    value={staff.id}
                    defaultChecked={checked}
                    className="mt-1 h-4 w-4 rounded border-border"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">
                      {staff.full_name ?? "Medewerker"}
                    </span>
                    {staff.roleLabel ? (
                      <span className="block text-xs text-muted-foreground">
                        {staff.roleLabel}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Link href={redirectTo} className={buttonVariants({ variant: "ghost" })}>
          Annuleren
        </Link>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
