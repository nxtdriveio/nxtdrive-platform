import { permanentRedirect } from "next/navigation";

export default async function LegacyStudentLessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  permanentRedirect(`/leerling/lessen/${lessonId}`);
}
