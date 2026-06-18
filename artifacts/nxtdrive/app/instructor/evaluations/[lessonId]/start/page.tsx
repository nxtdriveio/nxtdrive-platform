import { RisEvaluationWorkspace } from "../RisEvaluationWorkspace";

export const dynamic = "force-dynamic";

export default async function InstructorEvaluationStartPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  return <RisEvaluationWorkspace lessonId={lessonId} />;
}
