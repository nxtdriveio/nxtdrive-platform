import { InstructorAppointmentDetailManager } from "@/components/instructor/AppointmentManagers";

export const dynamic = "force-dynamic";

export default async function InstructorAgendaDetailPage({
  params,
}: {
  params: Promise<{ appointmentId: string }>;
}) {
  const { appointmentId } = await params;
  return (
    <InstructorAppointmentDetailManager
      appointmentId={appointmentId}
      formPath={`/instructeur/agenda/${appointmentId}`}
      redirectTo="/instructeur/agenda"
    />
  );
}
