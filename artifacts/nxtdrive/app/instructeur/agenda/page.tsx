import { InstructorAgendaView } from "@/components/instructor/RedesignViews";
import { loadInstructorAgenda } from "@/lib/instructor/experience-server";
import { loadInstructorAgendaCreateOptions } from "@/lib/instructor/agenda-create-options-server";

export const dynamic = "force-dynamic";

export default async function InstructorAgendaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const selectedAppointmentId =
    typeof query.afspraak === "string" ? query.afspraak : undefined;
  const requestedMode =
    typeof query.weergave === "string" ? query.weergave : undefined;
  const [data, createOptions] = await Promise.all([
    loadInstructorAgenda({
      mode: requestedMode,
      date: typeof query.datum === "string" ? query.datum : undefined,
    }),
    !requestedMode || requestedMode === "day"
      ? loadInstructorAgendaCreateOptions()
      : Promise.resolve(undefined),
  ]);
  return (
    <InstructorAgendaView
      data={data}
      selectedAppointmentId={selectedAppointmentId}
      createOptions={createOptions}
    />
  );
}
