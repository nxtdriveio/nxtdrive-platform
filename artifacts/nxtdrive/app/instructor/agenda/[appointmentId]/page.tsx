import { InstructorAppointmentDetailView } from "@/components/instructor/RedesignViews";

export const dynamic = "force-dynamic";

export default async function InstructorAgendaDetailPage({
  params,
}: {
  params: Promise<{ appointmentId: string }>;
}) {
  const { appointmentId } = await params;
  return <InstructorAppointmentDetailView appointmentId={appointmentId} />;
}
