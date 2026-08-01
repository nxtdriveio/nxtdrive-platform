import { InstructorAgendaView } from "@/components/instructor/RedesignViews";
import { resolveInstructorAgendaPeriod } from "@/lib/instructor/agenda-period";
import { instructorVisualFixture } from "../fixture-data";

export default async function InstructorAgendaVisualFixturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const agendaPeriod = resolveInstructorAgendaPeriod({
    mode: typeof query.weergave === "string" ? query.weergave : undefined,
    date: typeof query.datum === "string" ? query.datum : undefined,
    now: new Date("2026-07-31T12:00:00.000Z"),
    timeZone: "Europe/Amsterdam",
  });
  return (
    <InstructorAgendaView
      data={{ ...instructorVisualFixture, agendaPeriod }}
      selectedAppointmentId={
        typeof query.afspraak === "string" ? query.afspraak : undefined
      }
      selectionBasePath="/visual-fixtures/instructeur/agenda"
    />
  );
}
