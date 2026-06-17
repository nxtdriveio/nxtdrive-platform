import { InstructorMessagesView } from "@/components/instructor/RedesignViews";
import { loadInstructorExperience } from "@/lib/instructor/experience-server";

export const dynamic = "force-dynamic";

export default async function InstructorMessageAliasPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const data = await loadInstructorExperience();
  return <InstructorMessagesView threadId={threadId} data={data} />;
}
