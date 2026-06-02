import { FileText, Download, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/input";
import {
  uploadStudentDocument,
  deleteStudentDocument,
} from "@/app/backoffice/leerlingen/actions";
import {
  ALLOWED_DOCUMENT_ACCEPT,
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABEL,
  DOCUMENT_VALIDATION_MESSAGE,
  formatFileSize,
  type StudentDocument,
} from "@/lib/students/document-types";

const dtFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const ERROR_MESSAGES: Record<string, string> = {
  ...DOCUMENT_VALIDATION_MESSAGE,
  upload_failed: "Uploaden mislukt. Probeer het opnieuw.",
  delete_failed: "Verwijderen mislukt. Probeer het opnieuw.",
};

/**
 * Documents section on the student dossier. Staff (admin + instructor) can
 * upload, download (via short-lived signed URL) and delete documents. All
 * writes go through guarded, audited server actions; files live in a private
 * Supabase Storage bucket.
 */
export function StudentDocumentsCard({
  studentId,
  documents,
  errorCode,
}: {
  studentId: string;
  documents: StudentDocument[];
  errorCode?: string;
}) {
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documenten</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {errorMessage ? (
          <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {errorMessage}
          </p>
        ) : null}

        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nog geen documenten geüpload.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-start justify-between gap-3 py-3"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <FileText
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {doc.file_name}
                      </span>
                      <Badge variant="outline">
                        {DOCUMENT_CATEGORY_LABEL[doc.category]}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {dtFmt.format(new Date(doc.created_at))}
                      {" · "}
                      {formatFileSize(doc.size_bytes)}
                      {doc.uploaded_by_name ? ` · ${doc.uploaded_by_name}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <a
                    href={`/backoffice/leerlingen/${studentId}/documents/${doc.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`Download ${doc.file_name}`}
                  >
                    <Download className="h-4 w-4" aria-hidden />
                  </a>
                  <form action={deleteStudentDocument}>
                    <input type="hidden" name="student_id" value={studentId} />
                    <input type="hidden" name="document_id" value={doc.id} />
                    <button
                      type="submit"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-danger/10 hover:text-danger"
                      aria-label={`Verwijder ${doc.file_name}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form
          action={uploadStudentDocument}
          className="space-y-3 border-t border-border pt-4"
        >
          <input type="hidden" name="student_id" value={studentId} />
          <div className="space-y-1.5">
            <Label htmlFor="doc-category">Categorie</Label>
            <Select id="doc-category" name="category" defaultValue="id_copy">
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {DOCUMENT_CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-file">Bestand</Label>
            <input
              id="doc-file"
              name="file"
              type="file"
              required
              accept={ALLOWED_DOCUMENT_ACCEPT}
              className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:opacity-90"
            />
            <p className="text-xs text-muted-foreground">
              PDF of afbeelding (PDF, JPG, PNG, WebP, HEIC), max. 10 MB.
            </p>
          </div>
          <Button type="submit" size="sm" className="w-full">
            Document uploaden
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
