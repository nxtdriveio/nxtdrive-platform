import { InstructorMessagesView } from "@/components/instructor/RedesignViews";
import { instructorChatVisualFixture } from "../../fixture-data";

export default async function InstructorMessageVisualFixturePage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  return (
    <InstructorMessagesView
      threadId={conversationId}
      data={instructorChatVisualFixture}
      messagesBasePath="/visual-fixtures/instructeur/berichten"
    />
  );
}
