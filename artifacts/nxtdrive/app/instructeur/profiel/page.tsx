import { InstructorProfileView } from "@/components/instructor/RedesignViews";
import { loadInstructorProfile } from "@/lib/instructor/experience-server";

export const dynamic = "force-dynamic";

export default async function InstructorProfilePage() {
  const data = await loadInstructorProfile();
  return <InstructorProfileView data={data} />;
}
