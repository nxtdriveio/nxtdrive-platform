import { permanentRedirectToInstructorRoute } from "@/lib/instructor/redirect";
import type { InstructorSearchParams } from "@/lib/instructor/routes";

export default async function InstructorMessageEnglishLegacyPage({
  params,
  searchParams,
}: {
  params: Promise<{ threadId: string }>;
  searchParams: Promise<InstructorSearchParams>;
}) {
  const { threadId } = await params;
  permanentRedirectToInstructorRoute(
    "message",
    { conversationId: threadId },
    await searchParams,
  );
}
