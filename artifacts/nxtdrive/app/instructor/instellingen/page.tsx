import { InstructorSettingsView } from "@/components/instructor/RedesignViews";
import { loadInstructorExperience } from "@/lib/instructor/experience-server";

export const dynamic = "force-dynamic";

export default async function InstructorSettingsPage() {
  const data = await loadInstructorExperience();
  return <InstructorSettingsView data={data} />;
}
