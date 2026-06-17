import { InstructorAppointmentDetailView } from "@/components/instructor/RedesignViews";

export const dynamic = "force-dynamic";

export default async function InstructorAppointmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InstructorAppointmentDetailView appointmentId={id} />;
}
