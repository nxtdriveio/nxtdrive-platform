import { InstructorCockpitView } from "@/components/instructor/RedesignViews";
import { loadInstructorExperience } from "@/lib/instructor/experience-server";

export const dynamic = "force-dynamic";

export default async function InstructorIndexPage() {
  const data = await loadInstructorExperience();
  return <InstructorCockpitView data={data} />;
}
