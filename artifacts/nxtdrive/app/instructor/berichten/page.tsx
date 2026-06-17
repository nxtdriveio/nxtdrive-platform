import { InstructorMessagesView } from "@/components/instructor/RedesignViews";
import { loadInstructorExperience } from "@/lib/instructor/experience-server";

export const dynamic = "force-dynamic";

export default async function InstructorMessagesPage() {
  const data = await loadInstructorExperience();
  return <InstructorMessagesView data={data} />;
}
