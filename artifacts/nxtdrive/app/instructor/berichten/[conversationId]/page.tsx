import { InstructorMessagesView } from "@/components/instructor/RedesignViews";

export const dynamic = "force-dynamic";

export default async function InstructorMessageThreadPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  return <InstructorMessagesView threadId={conversationId} />;
}
