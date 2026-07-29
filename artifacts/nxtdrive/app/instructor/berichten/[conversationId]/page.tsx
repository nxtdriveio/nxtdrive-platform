import { permanentRedirectToInstructorRoute } from "@/lib/instructor/redirect";
import type { InstructorSearchParams } from "@/lib/instructor/routes";

export default async function InstructorMessageLegacyPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<InstructorSearchParams>;
}) {
  const { conversationId } = await params;
  permanentRedirectToInstructorRoute(
    "message",
    { conversationId },
    await searchParams,
  );
}
