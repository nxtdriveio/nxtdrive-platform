import { InstructorStudentDetailView } from "@/components/instructor/RedesignViews";
import { instructorVisualFixture } from "../../fixture-data";

export default function InstructorStudentVisualFixturePage() {
  return (
    <InstructorStudentDetailView
      studentId="student-1"
      data={instructorVisualFixture}
    />
  );
}
