import { InstructorAgendaView } from "@/components/instructor/RedesignViews";
import { loadInstructorAgenda } from "@/lib/instructor/experience-server";

export const dynamic = "force-dynamic";

export default async function InstructorAgendaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const selectedAppointmentId =
    typeof query.afspraak === "string" ? query.afspraak : undefined;
  const data = await loadInstructorAgenda({
    mode: typeof query.weergave === "string" ? query.weergave : undefined,
    date: typeof query.datum === "string" ? query.datum : undefined,
  });
  return (
    <InstructorAgendaView
      data={data}
      selectedAppointmentId={selectedAppointmentId}
    />
  );
}
