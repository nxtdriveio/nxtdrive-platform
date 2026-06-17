import { InstructorStudentsView } from "@/components/instructor/RedesignViews";
import { loadInstructorExperience } from "@/lib/instructor/experience-server";

export const dynamic = "force-dynamic";

export default async function InstructorStudentsPage() {
  const data = await loadInstructorExperience();
  return <InstructorStudentsView data={data} />;
}
