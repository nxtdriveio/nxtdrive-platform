import { InstructorStudentDetailView } from "@/components/instructor/RedesignViews";

export const dynamic = "force-dynamic";

export default async function InstructorStudentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InstructorStudentDetailView studentId={id} />;
}
