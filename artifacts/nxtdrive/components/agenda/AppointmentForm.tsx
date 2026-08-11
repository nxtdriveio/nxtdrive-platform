"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  APPOINTMENT_BUFFER_OPTIONS,
  APPOINTMENT_DURATIONS,
  INSTRUCTOR_PLANNING_TYPES,
  INSTRUCTOR_PLANNING_TYPE_LABEL,
  isStudentLinkedPlanningType,
  type InstructorPlanningType,
} from "@/lib/agenda/types";

export type BranchOption = { id: string; name: string };
export type InstructorOption = { id: string; full_name: string | null };
export type StudentOption = { id: string; full_name: string };
export type VehicleOption = {
  id: string;
  label: string;
  license_plate: string | null;
  transmission: "schakel" | "automaat" | null;
  status?: string | null;
  default_instructor_id?: string | null;
};
export type ServiceAreaOption = {
  id: string;
  name: string;
  branch_id?: string | null;
};

export type AppointmentFormDefaults = {
  type?: InstructorPlanningType;
  branchId?: string | null;
  instructorId?: string;
  vehicleId?: string | null;
  pickupServiceAreaId?: string | null;
  studentId?: string | null;
  date?: string;
  time?: string;
  durationMin?: number;
  bufferMin?: number;
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
  branches,
  instructors,
  ownInstructor,
  vehicles,
  serviceAreas,
  students,
  defaults,
  submitLabel,
  allowLesson = false,
  lockType = false,
  returnToCalendar = false,
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
  vehicles?: VehicleOption[];
  serviceAreas?: ServiceAreaOption[];
  students: StudentOption[];
  defaults?: AppointmentFormDefaults;
  submitLabel: string;
  allowLesson?: boolean;
  lockType?: boolean;
  returnToCalendar?: boolean;
}) {
  const [type, setType] = useState<InstructorPlanningType>(
    defaults?.type ?? (allowLesson ? "lesson" : "exam"),
  );
  // In edit mode the type is immutable (the DB RPC does not change it).
  const typeLocked = mode === "edit" || lockType;
  // The instructor is also immutable in edit mode - update_agenda_appointment
  // keeps the original instructor. Show a read-only display instead of a select
  // so the form never offers an affordance the backend ignores.
  const instructorLocked = mode === "edit";
  const lockedInstructorName =
    (instructors?.find((i) => i.id === defaults?.instructorId)?.full_name ??
      ownInstructor?.full_name) ||
    "Instructeur";
  const lockedInstructorId = defaults?.instructorId ?? ownInstructor?.id ?? "";
  const showStudent = isStudentLinkedPlanningType(type);
  const compactQuickAdd =
    lockType &&
    (type === "break" || type === "private_block" || type === "free_block");
  const showVehicle =
    type === "lesson" ||
    type === "exam" ||
    type === "interim_test" ||
    type === "maintenance";
  const showServiceArea =
    type === "lesson" || type === "exam" || type === "interim_test";
  const planningTypes = allowLesson
    ? INSTRUCTOR_PLANNING_TYPES
    : INSTRUCTOR_PLANNING_TYPES.filter(
        (planningType) => planningType !== "lesson",
      );
  const defaultBranchId = defaults?.branchId ?? branches?.[0]?.id ?? "";

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="redirect_to" value={redirectTo} />
      <input type="hidden" name="error_to" value={errorTo} />
      {returnToCalendar ? (
        <input type="hidden" name="return_to_calendar" value="true" />
      ) : null}
      {appointmentId ? (
        <input type="hidden" name="appointment_id" value={appointmentId} />
      ) : null}
      {/* When the type select is disabled it is not submitted - mirror it. */}
      {typeLocked ? <input type="hidden" name="type" value={type} /> : null}
      {(!instructors || instructorLocked) && lockedInstructorId ? (
        <input type="hidden" name="instructor_id" value={lockedInstructorId} />
      ) : null}
      {compactQuickAdd && defaultBranchId ? (
        <input type="hidden" name="branch_id" value={defaultBranchId} />
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="type">Type afspraak</Label>
          <Select
            id="type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as InstructorPlanningType)}
            disabled={typeLocked}
            required
          >
            {planningTypes.map((t) => (
              <option key={t} value={t}>
                {INSTRUCTOR_PLANNING_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </div>

        {branches && branches.length > 0 && !compactQuickAdd ? (
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
                Bij een gekoppelde leerling wordt de vestiging automatisch
                gelijkgezet met het leerlingdossier.
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
        ) : (instructors || ownInstructor) && !compactQuickAdd ? (
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
            <Label htmlFor="student_id">
              Leerling{type === "lesson" ? "" : " (optioneel)"}
            </Label>
            <Select
              id="student_id"
              name="student_id"
              defaultValue={defaults?.studentId ?? ""}
              required={type === "lesson"}
            >
              <option value="">
                {type === "lesson" ? "Kies een leerling" : "Geen leerling"}
              </option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        {vehicles && showVehicle ? (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="vehicle_id">Voertuig</Label>
            <Select
              id="vehicle_id"
              name="vehicle_id"
              defaultValue={defaults?.vehicleId ?? ""}
            >
              <option value="">Geen voertuig</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {[
                    vehicle.license_plate ?? vehicle.label,
                    vehicle.transmission,
                    vehicle.default_instructor_id ? "standaard voertuig" : null,
                    vehicle.status && vehicle.status !== "active"
                      ? vehicle.status
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        {serviceAreas && serviceAreas.length > 0 && showServiceArea ? (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pickup_service_area_id">Rayon</Label>
            <Select
              id="pickup_service_area_id"
              name="pickup_service_area_id"
              defaultValue={defaults?.pickupServiceAreaId ?? ""}
            >
              <option value="">Geen rayon</option>
              {serviceAreas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
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
            step={900}
            required
            defaultValue={defaults?.time}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="duration_min">Lestijd / duur</Label>
          <Select
            id="duration_min"
            name="duration_min"
            defaultValue={String(defaults?.durationMin ?? 50)}
          >
            {APPOINTMENT_DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d} min
              </option>
            ))}
          </Select>
        </div>

        {type === "lesson" ? (
          <div className="space-y-1.5">
            <Label htmlFor="buffer_min">Buffer na afloop</Label>
            <Select
              id="buffer_min"
              name="buffer_min"
              defaultValue={String(defaults?.bufferMin ?? 0)}
            >
              {APPOINTMENT_BUFFER_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d} min
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              Bezet in agenda: duur + buffer.
            </p>
          </div>
        ) : (
          <input type="hidden" name="buffer_min" value="0" />
        )}

        {type !== "lesson" && type !== "break" ? (
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
        ) : null}
      </div>

      {!compactQuickAdd || type === "private_block" ? (
        <div className="space-y-1.5">
          <Label htmlFor="location">
            {type === "lesson" ? "Ophaalpunt" : "Locatie"}
          </Label>
          <Input
            id="location"
            name="location"
            maxLength={200}
            placeholder={
              type === "lesson"
                ? "Standaard ophaalpunt of tijdelijke locatie"
                : "Optioneel"
            }
            defaultValue={defaults?.location ?? ""}
          />
        </div>
      ) : null}

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
        <Link
          href={redirectTo}
          className={buttonVariants({ variant: "ghost" })}
        >
          Annuleren
        </Link>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
