import { InstructorProfileView } from "@/components/instructor/RedesignViews";
import { loadInstructorExperience } from "@/lib/instructor/experience-server";

export const dynamic = "force-dynamic";

export default async function InstructorProfileDutchPage() {
  const data = await loadInstructorExperience();
  return <InstructorProfileView data={data} />;
}
