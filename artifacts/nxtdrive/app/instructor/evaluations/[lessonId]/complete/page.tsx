import { InstructorEvaluationDetailView } from "@/components/instructor/RedesignViews";

export const dynamic = "force-dynamic";

export default async function InstructorEvaluationCompletePage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  return <InstructorEvaluationDetailView lessonId={lessonId} />;
}
