import { InstructorAppointmentDetailManager } from "@/components/instructor/AppointmentManagers";

export const dynamic = "force-dynamic";

export default async function InstructorAppointmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <InstructorAppointmentDetailManager
      appointmentId={id}
      formPath={`/instructor/afspraak/${id}`}
      redirectTo="/instructor/agenda"
    />
  );
}
