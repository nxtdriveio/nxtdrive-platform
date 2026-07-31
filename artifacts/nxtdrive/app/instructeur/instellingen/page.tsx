import { InstructorSettingsView } from "@/components/instructor/RedesignViews";
import { loadInstructorProfile } from "@/lib/instructor/experience-server";

export const dynamic = "force-dynamic";

export default async function InstructorSettingsPage() {
  const data = await loadInstructorProfile();
  return <InstructorSettingsView data={data} />;
}
