import { InstructorVehiclesView } from "@/components/instructor/RedesignViews";
import { loadInstructorExperience } from "@/lib/instructor/experience-server";

export const dynamic = "force-dynamic";

export default async function InstructorVehiclesAliasPage() {
  const data = await loadInstructorExperience();
  return <InstructorVehiclesView data={data} />;
}
