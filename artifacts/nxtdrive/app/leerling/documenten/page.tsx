import { FileText } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { getActiveStudent } from "@/lib/students/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadStudentDocumentMetadata } from "@/lib/students/documents";
import {
  DOCUMENT_CATEGORY_LABEL,
  formatFileSize,
} from "@/lib/students/document-types";
import { PWAPage, PWAPageHeader } from "@/components/pwa/primitives";
import {
  StudentInitialBadge,
  StudentListRow,
  StudentShowcaseCard,
  StudentShowcaseEmptyState,
} from "@/components/student/Showcase";

export const dynamic = "force-dynamic";

export default async function StudentDocumentsPage() {
  const { user, tenant, roles } = await requireActiveTenant([
    "student",
    "parent",
  ]);
  const { student } = await getActiveStudent(user, tenant.id, roles);
  const supabase = await createServerSupabaseClient();
  const documents = student
    ? await loadStudentDocumentMetadata(supabase, tenant.id, student.id)
    : [];

  return (
    <PWAPage app="student" contentClassName="space-y-4">
      <PWAPageHeader
        eyebrow="Meer"
        title="Documenten"
        subtitle="Open bestanden die je rijschool veilig aan je dossier heeft toegevoegd."
        icon={<FileText className="h-4 w-4" aria-hidden />}
      />

      <StudentShowcaseCard
        title="Mijn documenten"
        eyebrow="Veilige downloads"
        info="Downloads worden via een tijdelijke, beveiligde link geopend en staan los van je accountgegevens."
      >
        {documents.length > 0 ? (
          <div className="space-y-2">
            {documents.map((document) => (
              <StudentListRow
                key={document.id}
                href={`/leerling/documenten/${document.id}`}
                title={document.fileName}
                subtitle={`${DOCUMENT_CATEGORY_LABEL[document.category]} · ${formatFileSize(document.sizeBytes)}`}
                badge="Download"
                badgeVariant="primary"
                leading={<StudentInitialBadge label="DOC" tone="blue" />}
              />
            ))}
          </div>
        ) : (
          <StudentShowcaseEmptyState
            icon={<FileText className="h-5 w-5" aria-hidden />}
            title={
              student ? "Nog geen documenten" : "Nog geen leerling gekoppeld"
            }
            description={
              student
                ? "Zodra je rijschool een bestand deelt, verschijnt het hier."
                : "Documenten verschijnen zodra je leerlingdossier is gekoppeld."
            }
          />
        )}
      </StudentShowcaseCard>
    </PWAPage>
  );
}
