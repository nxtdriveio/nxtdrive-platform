import { RisEvaluationWorkspace } from "../../evaluations/[lessonId]/RisEvaluationWorkspace";

export const dynamic = "force-dynamic";

export default async function InstructorLessonEvaluationDetailPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  return <RisEvaluationWorkspace lessonId={lessonId} />;
}
