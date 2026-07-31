import { InstructorVehiclesView } from "@/components/instructor/RedesignViews";
import { loadInstructorVehicles } from "@/lib/instructor/experience-server";

export const dynamic = "force-dynamic";

export default async function InstructorVehiclesPage() {
  const data = await loadInstructorVehicles();
  return <InstructorVehiclesView data={data} />;
}
