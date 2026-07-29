import { RisEvaluationWorkspace } from "@/app/instructor/evaluations/[lessonId]/RisEvaluationWorkspace";

export const dynamic = "force-dynamic";

export default async function InstructorLessonCockpitPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  return <RisEvaluationWorkspace lessonId={lessonId} />;
}
