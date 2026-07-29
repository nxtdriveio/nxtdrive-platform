import { permanentRedirectToInstructorRoute } from "@/lib/instructor/redirect";
import type { InstructorSearchParams } from "@/lib/instructor/routes";

export default async function InstructorStudentsLegacyPage({
  searchParams,
}: {
  searchParams: Promise<InstructorSearchParams>;
}) {
  permanentRedirectToInstructorRoute("students", {}, await searchParams);
}
