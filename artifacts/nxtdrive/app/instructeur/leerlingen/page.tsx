import { InstructorStudentsView } from "@/components/instructor/RedesignViews";
import { loadInstructorStudents } from "@/lib/instructor/experience-server";

export const dynamic = "force-dynamic";

export default async function InstructorStudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const selectedStudentId =
    typeof query.leerling === "string" ? query.leerling : undefined;
  const data = await loadInstructorStudents();
  return (
    <InstructorStudentsView data={data} selectedStudentId={selectedStudentId} />
  );
}
