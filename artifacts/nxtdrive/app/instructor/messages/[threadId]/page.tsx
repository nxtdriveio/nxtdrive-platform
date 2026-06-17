import { InstructorMessagesView } from "@/components/instructor/RedesignViews";

export const dynamic = "force-dynamic";

export default async function InstructorMessageAliasPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  return <InstructorMessagesView threadId={threadId} />;
}
