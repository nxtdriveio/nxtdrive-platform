import { permanentRedirectToInstructorRoute } from "@/lib/instructor/redirect";
import type { InstructorSearchParams } from "@/lib/instructor/routes";

export default async function InstructorWeekLegacyPage({
  searchParams,
}: {
  searchParams: Promise<InstructorSearchParams>;
}) {
  permanentRedirectToInstructorRoute("agenda", {}, await searchParams);
}
