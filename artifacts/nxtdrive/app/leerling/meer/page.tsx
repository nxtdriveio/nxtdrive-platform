import { MoreHorizontal } from "lucide-react";
import { getStudentPwaContext } from "@/lib/student-pwa/context";
import {
  StudentMoreMenu,
  StudentPageHeader,
  StudentSection,
} from "@/components/student/StudentPwa";

export const dynamic = "force-dynamic";

export default async function StudentMorePage() {
  await getStudentPwaContext();

  return (
    <div className="min-w-0 space-y-4 lg:space-y-6">
      <StudentPageHeader
        eyebrow="Meer"
        title="Alles op een plek"
        subtitle="Account, berichten, hulp, documenten en instellingen, elk op een eigen pagina."
      />
      <StudentSection title="Menu" icon={MoreHorizontal}>
        <StudentMoreMenu />
      </StudentSection>
    </div>
  );
}
