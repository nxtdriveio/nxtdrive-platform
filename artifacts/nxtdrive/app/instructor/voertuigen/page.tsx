import { permanentRedirectToInstructorRoute } from "@/lib/instructor/redirect";
import type { InstructorSearchParams } from "@/lib/instructor/routes";

export default async function InstructorVehiclesLegacyPage({
  searchParams,
}: {
  searchParams: Promise<InstructorSearchParams>;
}) {
  permanentRedirectToInstructorRoute("vehicles", {}, await searchParams);
}
