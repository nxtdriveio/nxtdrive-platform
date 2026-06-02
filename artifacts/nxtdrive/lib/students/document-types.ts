/** Student document storage — shared types, categories and validation. */

export const STUDENT_DOCUMENT_BUCKET = "student-documents";

export const DOCUMENT_CATEGORIES = [
  "id_copy",
  "authorization",
  "health_declaration",
  "terms",
  "other",
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_CATEGORY_LABEL: Record<DocumentCategory, string> = {
  id_copy: "ID-kopie",
  authorization: "Machtiging",
  health_declaration: "Gezondheidsverklaring",
  terms: "Getekende voorwaarden",
  other: "Overig",
};

export function isDocumentCategory(value: string): value is DocumentCategory {
  return (DOCUMENT_CATEGORIES as readonly string[]).includes(value);
}

/** A student document metadata row, with the uploader's resolved name. */
export type StudentDocument = {
  id: string;
  tenant_id: string;
  student_id: string;
  storage_path: string;
  file_name: string;
  category: DocumentCategory;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  created_at: string;
};

// Validation -----------------------------------------------------------------

/** Max upload size: 10 MB. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Accepted MIME types — PDFs and common image formats. */
export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const ALLOWED_DOCUMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif";

export type DocumentValidationError =
  | "empty"
  | "too_large"
  | "bad_type";

export const DOCUMENT_VALIDATION_MESSAGE: Record<DocumentValidationError, string> = {
  empty: "Geen bestand geselecteerd.",
  too_large: "Bestand is te groot (maximaal 10 MB).",
  bad_type: "Bestandstype niet toegestaan. Toegestaan: PDF, JPG, PNG, WebP, HEIC.",
};

/** Validate a file's size and MIME type. Returns an error code, or null when ok. */
export function validateDocument(
  sizeBytes: number,
  mimeType: string,
): DocumentValidationError | null {
  if (!sizeBytes || sizeBytes <= 0) return "empty";
  if (sizeBytes > MAX_DOCUMENT_BYTES) return "too_large";
  if (!(ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return "bad_type";
  }
  return null;
}

/** Strip a filename to a safe storage-path segment (keep extension). */
export function sanitizeFileName(name: string): string {
  const trimmed = name.trim().slice(-200);
  const safe = trimmed
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+/, "");
  return safe.length > 0 ? safe : "bestand";
}

const SIZE_FMT = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 });

/** Human-readable file size (e.g. 1536 => "1,5 KB"). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${SIZE_FMT.format(bytes / 1024)} KB`;
  return `${SIZE_FMT.format(bytes / (1024 * 1024))} MB`;
}
