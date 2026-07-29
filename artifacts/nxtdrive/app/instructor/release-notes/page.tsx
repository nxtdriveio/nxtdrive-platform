import { permanentRedirectToInstructorRoute } from "@/lib/instructor/redirect";
import type { InstructorSearchParams } from "@/lib/instructor/routes";

export default async function InstructorReleaseNotesLegacyPage({
  searchParams,
}: {
  searchParams: Promise<InstructorSearchParams>;
}) {
  permanentRedirectToInstructorRoute("releaseNotes", {}, await searchParams);
}
