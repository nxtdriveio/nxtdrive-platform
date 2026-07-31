import { InstructorAgendaView } from "@/components/instructor/RedesignViews";
import { instructorVisualFixture } from "../fixture-data";

export default async function InstructorAgendaVisualFixturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  return (
    <InstructorAgendaView
      data={instructorVisualFixture}
      selectedAppointmentId={
        typeof query.afspraak === "string" ? query.afspraak : undefined
      }
      selectionBasePath="/visual-fixtures/instructeur/agenda"
    />
  );
}
