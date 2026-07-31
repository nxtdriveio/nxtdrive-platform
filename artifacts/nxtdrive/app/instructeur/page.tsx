import { InstructorCockpitView } from "@/components/instructor/RedesignViews";
import { loadInstructorCockpit } from "@/lib/instructor/experience-server";

export const dynamic = "force-dynamic";

export default async function InstructorIndexPage() {
  const data = await loadInstructorCockpit();
  return <InstructorCockpitView data={data} />;
}
