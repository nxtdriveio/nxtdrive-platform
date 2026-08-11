import { InstructorAgendaView } from "@/components/instructor/RedesignViews";
import { resolveInstructorAgendaPeriod } from "@/lib/instructor/agenda-period";
import {
  instructorAgendaCreateOptionsFixture,
  instructorVisualFixture,
} from "../fixture-data";

export default async function InstructorAgendaVisualFixturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const fixture = typeof query.fixture === "string" ? query.fixture : "filled";
  const appointments =
    fixture === "empty"
      ? []
      : fixture === "overlap"
        ? instructorVisualFixture.appointments.filter((appointment) =>
            ["appointment-2", "appointment-overlap"].includes(appointment.id),
          )
        : instructorVisualFixture.appointments;
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
    />
  );
}
