import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function InstructorEvaluationAliasPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  redirect(`/instructor/les-evaluaties/${lessonId}`);
}
