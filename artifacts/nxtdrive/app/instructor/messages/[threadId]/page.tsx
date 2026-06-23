import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function InstructorMessageAliasPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  redirect(`/instructor/berichten/${threadId}`);
}
