import { InstructorAgendaView } from "@/components/instructor/RedesignViews";
import { loadInstructorExperience } from "@/lib/instructor/experience-server";

export const dynamic = "force-dynamic";

export default async function InstructorAgendaPage() {
  const data = await loadInstructorExperience();
  return <InstructorAgendaView data={data} />;
}
