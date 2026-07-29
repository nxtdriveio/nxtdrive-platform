import { permanentRedirectToInstructorRoute } from "@/lib/instructor/redirect";
import type { InstructorSearchParams } from "@/lib/instructor/routes";

export default async function InstructorStudentLegacyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<InstructorSearchParams>;
}) {
  const { id } = await params;
  permanentRedirectToInstructorRoute(
    "student",
    { studentId: id },
    await searchParams,
  );
}
