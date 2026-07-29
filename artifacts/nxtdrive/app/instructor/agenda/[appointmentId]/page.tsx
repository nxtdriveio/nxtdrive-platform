import { permanentRedirectToInstructorRoute } from "@/lib/instructor/redirect";
import type { InstructorSearchParams } from "@/lib/instructor/routes";

export default async function InstructorAppointmentLegacyPage({
  params,
  searchParams,
}: {
  params: Promise<{ appointmentId: string }>;
  searchParams: Promise<InstructorSearchParams>;
}) {
  const { appointmentId } = await params;
  permanentRedirectToInstructorRoute(
    "appointment",
    { appointmentId },
    await searchParams,
  );
}
