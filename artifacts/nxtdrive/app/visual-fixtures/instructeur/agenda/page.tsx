import { InstructorAgendaView } from "@/components/instructor/RedesignViews";
import { resolveInstructorAgendaPeriod } from "@/lib/instructor/agenda-period";
import {
  instructorAgendaWizardBootstrapFixture,
  instructorVisualFixture,
  fixtureAppointment,
} from "../fixture-data";
import {
  createFixtureSmartAppointment,
  previewFixtureSmartAppointment,
  resolveFixtureAppointmentContext,
  searchFixtureStudents,
} from "./actions";

export default async function InstructorAgendaVisualFixturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const fixture = typeof query.fixture === "string" ? query.fixture : "filled";
  const fixtureNowIso =
    query.clock === "late"
      ? "2026-08-11T21:04:00.000Z"
      : "2026-08-11T11:47:00.000Z";
  const baseAppointments =
    fixture === "empty"
      ? []
      : fixture === "overlap"
        ? instructorVisualFixture.appointments.filter((appointment) =>
            ["appointment-2", "appointment-overlap"].includes(appointment.id),
          )
        : instructorVisualFixture.appointments;
  const createdType =
    typeof query.created === "string" &&
    ["lesson", "private_block", "exam", "break"].includes(query.created)
      ? query.created
      : null;
  const createdAppointment =
    createdType &&
    typeof query.date === "string" &&
    typeof query.time === "string"
      ? fixtureAppointment({
          id: "appointment-created",
          displayType: createdType === "lesson" ? "lesson" : "private",
          calendarType: createdType as
            | "lesson"
            | "private_block"
            | "exam"
            | "break",
          title:
            createdType === "lesson"
              ? "Rijles"
              : createdType === "exam"
                ? "Praktijkexamen"
                : createdType === "break"
                  ? "Pauze"
                  : "Privé",
          studentName:
            createdType === "lesson" || createdType === "exam"
              ? query.student === "student-2"
                ? "Milan de Vries"
                : "Noah Jansen"
              : undefined,
          startsAtIso: new Date(
            `${query.date}T${query.time}:00+02:00`,
          ).toISOString(),
          endsAtIso: new Date(
            new Date(`${query.date}T${query.time}:00+02:00`).getTime() +
              Math.max(15, Number(query.duration) || 60) * 60 * 1000,
          ).toISOString(),
          startsAt: query.time,
          endsAt: new Date(
            new Date(`2026-08-11T${query.time}:00Z`).getTime() +
              Math.max(15, Number(query.duration) || 60) * 60 * 1000,
          )
            .toISOString()
            .slice(11, 16),
          location:
            createdType === "lesson" || createdType === "exam"
              ? "Standaard ophaalpunt leerling"
              : "Privé",
        })
      : null;
  const appointments = createdAppointment
    ? [...baseAppointments, createdAppointment]
    : baseAppointments;
  const agendaPeriod = resolveInstructorAgendaPeriod({
    mode: typeof query.weergave === "string" ? query.weergave : undefined,
    date: typeof query.datum === "string" ? query.datum : undefined,
    now: new Date(fixtureNowIso),
    timeZone: "Europe/Amsterdam",
  });
  return (
    <InstructorAgendaView
      data={{
        ...instructorVisualFixture,
        appointments,
        agendaPeriod,
        agendaNowIso: fixtureNowIso,
      }}
      selectedAppointmentId={
        typeof query.afspraak === "string" ? query.afspraak : undefined
      }
      selectionBasePath="/visual-fixtures/instructeur/agenda"
      wizardBootstrap={instructorAgendaWizardBootstrapFixture}
      wizardActions={{
        search: searchFixtureStudents,
        resolve: resolveFixtureAppointmentContext,
        preview: previewFixtureSmartAppointment,
        create: createFixtureSmartAppointment,
      }}
    />
  );
}
