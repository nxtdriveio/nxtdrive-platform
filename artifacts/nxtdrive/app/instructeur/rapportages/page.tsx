import { InstructorReportsView } from "@/components/instructor/RedesignViews";
import { loadInstructorReports } from "@/lib/instructor/experience-server";

export const dynamic = "force-dynamic";

export default async function InstructorReportsPage() {
  const data = await loadInstructorReports();
  return <InstructorReportsView data={data} />;
}
