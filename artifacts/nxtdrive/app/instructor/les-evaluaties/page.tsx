import { InstructorEvaluationsView } from "@/components/instructor/RedesignViews";
import { loadInstructorExperience } from "@/lib/instructor/experience-server";

export const dynamic = "force-dynamic";

export default async function InstructorLessonEvaluationsPage() {
  const data = await loadInstructorExperience();
  return <InstructorEvaluationsView data={data} />;
}
