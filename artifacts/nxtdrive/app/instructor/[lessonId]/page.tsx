import { permanentRedirectToInstructorRoute } from "@/lib/instructor/redirect";
import type { InstructorSearchParams } from "@/lib/instructor/routes";

export default async function InstructorLessonLegacyPage({
  params,
  searchParams,
}: {
  params: Promise<{ lessonId: string }>;
  searchParams: Promise<InstructorSearchParams>;
}) {
  const { lessonId } = await params;
  permanentRedirectToInstructorRoute(
    "lesson",
    { lessonId },
    await searchParams,
  );
}
