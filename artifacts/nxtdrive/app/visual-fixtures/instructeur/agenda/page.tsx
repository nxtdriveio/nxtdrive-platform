import { InstructorAgendaView } from "@/components/instructor/RedesignViews";
import { resolveInstructorAgendaPeriod } from "@/lib/instructor/agenda-period";
import {
  instructorAgendaCreateOptionsFixture,
  instructorVisualFixture,
  fixtureAppointment,
} from "../fixture-data";
import { createFixtureCalendarAppointment } from "./actions";

export default async function InstructorAgendaVisualFixturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const fixture = typeof query.fixture === "string" ? query.fixture : "filled";
  const baseAppointments =
    fixture === "empty"
      ? []
      : fixture === "overlap"
        ? instructorVisualFixture.appointments.filter((appointment) =>
            ["appointment-2", "appointment-overlap"].includes(appointment.id),
          )
        : instructorVisualFixture.appointments;
  const createdAppointment =
    query.created === "lesson" &&
    typeof query.date === "string" &&
    typeof query.time === "string"
      ? fixtureAppointment({
          id: "appointment-created",
          displayType: "lesson",
          calendarType: "lesson",
          title: "Rijles",
          studentName:
            query.student === "student-2" ? "Mila Bakker" : "Noah Jansen",
          startsAtIso: new Date(
            `${query.date}T${query.time}:00+02:00`,
          ).toISOString(),
          endsAtIso: new Date(
            new Date(`${query.date}T${query.time}:00+02:00`).getTime() +
              60 * 60 * 1000,
          ).toISOString(),
          startsAt: query.time,
          endsAt: new Date(
            new Date(`2026-08-11T${query.time}:00Z`).getTime() + 60 * 60 * 1000,
          )
            .toISOString()
            .slice(11, 16),
          location: "Standaard ophaalpunt leerling",
        })
      : null;
  const appointments = createdAppointment
    ? [...baseAppointments, createdAppointment]
    : baseAppointments;
  const agendaPeriod = resolveInstructorAgendaPeriod({
    mode: typeof query.weergave === "string" ? query.weergave : undefined,
    date: typeof query.datum === "string" ? query.datum : undefined,
    now: new Date("2026-08-11T11:47:00.000Z"),
    timeZone: "Europe/Amsterdam",
  });
  return (
    <InstructorAgendaView
      data={{
        ...instructorVisualFixture,
        appointments,
        agendaPeriod,
        agendaNowIso: "2026-08-11T11:47:00.000Z",
      }}
      selectedAppointmentId={
        typeof query.afspraak === "string" ? query.afspraak : undefined
      }
      selectionBasePath="/visual-fixtures/instructeur/agenda"
      createOptions={instructorAgendaCreateOptionsFixture}
      createAction={createFixtureCalendarAppointment}
    />
  );
}
