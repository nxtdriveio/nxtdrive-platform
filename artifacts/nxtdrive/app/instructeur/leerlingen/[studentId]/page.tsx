import { InstructorStudentDetailView } from "@/components/instructor/RedesignViews";
import { loadInstructorStudent } from "@/lib/instructor/experience-server";

export const dynamic = "force-dynamic";

export default async function InstructorStudentPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const data = await loadInstructorStudent();
  return <InstructorStudentDetailView studentId={studentId} data={data} />;
}
