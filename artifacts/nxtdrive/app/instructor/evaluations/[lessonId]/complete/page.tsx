import { InstructorEvaluationDetailView } from "@/components/instructor/RedesignViews";
import { loadInstructorExperience } from "@/lib/instructor/experience-server";

export const dynamic = "force-dynamic";

export default async function InstructorEvaluationCompletePage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  const data = await loadInstructorExperience();
  return <InstructorEvaluationDetailView lessonId={lessonId} data={data} />;
}
