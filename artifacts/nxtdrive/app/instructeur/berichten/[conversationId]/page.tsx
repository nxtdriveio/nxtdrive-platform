import { InstructorMessagesView } from "@/components/instructor/RedesignViews";
import { loadInstructorMessages } from "@/lib/instructor/experience-server";

export const dynamic = "force-dynamic";

export default async function InstructorMessageThreadPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const data = await loadInstructorMessages(conversationId);
  return <InstructorMessagesView threadId={conversationId} data={data} />;
}
