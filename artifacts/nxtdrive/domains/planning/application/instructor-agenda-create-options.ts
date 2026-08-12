import type {
  BranchOption,
  InstructorOption,
  ServiceAreaOption,
  StudentOption,
  VehicleOption,
} from "@/components/agenda/AppointmentForm";

export type InstructorAgendaCreateOptions = Readonly<{
  branches: readonly BranchOption[];
  ownInstructor: InstructorOption;
  students: readonly StudentOption[];
  vehicles: readonly VehicleOption[];
  serviceAreas: readonly ServiceAreaOption[];
  defaultLessonDurationMinutes: number;
  defaultLessonBufferMinutes: number;
}>;
