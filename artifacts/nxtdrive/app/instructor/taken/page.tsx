import { InstructorTasksView } from "@/components/instructor/RedesignViews";
import { loadInstructorExperience } from "@/lib/instructor/experience-server";

export const dynamic = "force-dynamic";

export default async function InstructorTasksPage() {
  const data = await loadInstructorExperience();
  return <InstructorTasksView data={data} />;
}
