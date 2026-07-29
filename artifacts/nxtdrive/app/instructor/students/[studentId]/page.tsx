import { permanentRedirectToInstructorRoute } from "@/lib/instructor/redirect";
import type { InstructorSearchParams } from "@/lib/instructor/routes";

export default async function InstructorStudentEnglishLegacyPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<InstructorSearchParams>;
}) {
  const { studentId } = await params;
  permanentRedirectToInstructorRoute(
    "student",
    { studentId },
    await searchParams,
  );
}
