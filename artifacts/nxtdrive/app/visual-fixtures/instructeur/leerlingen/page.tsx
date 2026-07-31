import { InstructorStudentsView } from "@/components/instructor/RedesignViews";
import { instructorVisualFixture } from "../fixture-data";

export default async function InstructorStudentsVisualFixturePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  return (
    <InstructorStudentsView
      data={instructorVisualFixture}
      selectedStudentId={
        typeof query.leerling === "string" ? query.leerling : undefined
      }
      selectionBasePath="/visual-fixtures/instructeur/leerlingen"
    />
  );
}
