import { permanentRedirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function StudentMessageThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  permanentRedirect(`/leerling/berichten/${threadId}`);
}
