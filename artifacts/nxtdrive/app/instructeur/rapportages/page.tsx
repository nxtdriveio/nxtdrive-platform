import { InstructorReportsView } from "@/components/instructor/RedesignViews";
import { loadInstructorExperience } from "@/lib/instructor/experience-server";

export const dynamic = "force-dynamic";

export default async function InstructorReportsPage() {
  const data = await loadInstructorExperience();
  return <InstructorReportsView data={data} />;
}
