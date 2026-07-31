import { InstructorMessagesView } from "@/components/instructor/RedesignViews";
import { loadInstructorMessages } from "@/lib/instructor/experience-server";

export const dynamic = "force-dynamic";

export default async function InstructorMessagesPage() {
  const data = await loadInstructorMessages();
  return <InstructorMessagesView data={data} />;
}
