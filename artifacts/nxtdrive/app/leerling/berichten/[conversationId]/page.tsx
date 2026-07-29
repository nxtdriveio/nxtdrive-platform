import StudentMessagePage from "@/app/student/messages/[threadId]/page";

export default async function LearnerMessagePage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  return StudentMessagePage({
    params: Promise.resolve({ threadId: conversationId }),
  });
}
