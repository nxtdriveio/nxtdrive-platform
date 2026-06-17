import { FileText } from "lucide-react";
import { getStudentPwaContext } from "@/lib/student-pwa/context";
import {
  StudentDocumentList,
  StudentPageHeader,
  StudentSection,
} from "@/components/student/StudentPwa";

export const dynamic = "force-dynamic";

export default async function StudentDocumentsPage() {
  const { experience } = await getStudentPwaContext();

  return (
    <div className="min-w-0 space-y-4 lg:space-y-6">
      <StudentPageHeader
        eyebrow="Documenten"
        title="Jouw documenten"
        subtitle="Facturen, lesoverzichten, CBR-documenten en overige bestanden die voor jou klaarstaan."
      />

      <StudentSection title="Beschikbaar" icon={FileText}>
        <StudentDocumentList documents={experience.documents} />
      </StudentSection>
    </div>
  );
}
