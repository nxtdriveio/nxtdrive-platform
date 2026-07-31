import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isDocumentCategory,
  STUDENT_DOCUMENT_BUCKET,
  type DocumentCategory,
  type StudentDocument,
} from "@/lib/students/document-types";

export type StudentDocumentMetadata = {
  id: string;
  fileName: string;
  category: DocumentCategory;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

type RawStudentDocument = {
  id: string;
  tenant_id: string;
  student_id: string;
  storage_path: string;
  file_name: string;
  category: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string | null;
  created_at: string;
};

const DOCUMENT_COLUMNS =
  "id, tenant_id, student_id, storage_path, file_name, category, mime_type, size_bytes, uploaded_by, created_at";
const DOCUMENT_METADATA_COLUMNS =
  "id, file_name, category, mime_type, size_bytes, created_at";

export async function loadStudentDocumentMetadata(
  client: SupabaseClient,
  tenantId: string,
  studentId: string,
): Promise<StudentDocumentMetadata[]> {
  const { data, error } = await client
    .from("student_documents")
    .select(DOCUMENT_METADATA_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(
      `documents: metadata load failed (tenant=${tenantId} student=${studentId}): ${error.message}`,
    );
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    fileName: row.file_name as string,
    category: isDocumentCategory(row.category as string)
      ? (row.category as DocumentCategory)
      : "other",
    mimeType: row.mime_type as string,
    sizeBytes: Number(row.size_bytes),
    createdAt: row.created_at as string,
  }));
}

export async function loadStudentDocuments(
  rls: SupabaseClient,
  service: SupabaseClient,
  tenantId: string,
  studentId: string,
): Promise<StudentDocument[]> {
  const { data, error } = await rls
    .from("student_documents")
    .select(DOCUMENT_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(
      `documents: load failed (tenant=${tenantId} student=${studentId}): ${error.message}`,
    );
  }

  const rows = (data ?? []) as RawStudentDocument[];
  const uploaderIds = Array.from(
    new Set(rows.map((row) => row.uploaded_by).filter(Boolean)),
  ) as string[];
  const uploaderById = new Map<string, string | null>();
  if (uploaderIds.length > 0) {
    const { data: profiles, error: profilesError } = await service
      .from("profiles")
      .select("id, full_name")
      .in("id", uploaderIds);
    if (profilesError) {
      throw new Error(
        `documents: uploader load failed (tenant=${tenantId}): ${profilesError.message}`,
      );
    }
    for (const profile of profiles ?? []) {
      uploaderById.set(
        profile.id as string,
        (profile.full_name as string | null) ?? null,
      );
    }
  }

  return rows.map((row) => ({
    id: row.id,
    tenant_id: row.tenant_id,
    student_id: row.student_id,
    storage_path: row.storage_path,
    file_name: row.file_name,
    category: isDocumentCategory(row.category) ? row.category : "other",
    mime_type: row.mime_type,
    size_bytes: Number(row.size_bytes),
    uploaded_by: row.uploaded_by,
    uploaded_by_name: row.uploaded_by
      ? (uploaderById.get(row.uploaded_by) ?? null)
      : null,
    created_at: row.created_at,
  }));
}

export async function createStudentDocumentDownloadUrl(
  service: SupabaseClient,
  params: {
    tenantId: string;
    studentId: string;
    documentId: string;
  },
): Promise<string | null> {
  const { data: document, error } = await service
    .from("student_documents")
    .select("storage_path, file_name")
    .eq("id", params.documentId)
    .eq("tenant_id", params.tenantId)
    .eq("student_id", params.studentId)
    .maybeSingle();
  if (error) {
    throw new Error(`documents: download lookup failed: ${error.message}`);
  }
  if (!document) return null;

  const { data: signed, error: signError } = await service.storage
    .from(STUDENT_DOCUMENT_BUCKET)
    .createSignedUrl(document.storage_path as string, 60, {
      download: document.file_name as string,
    });
  if (signError) {
    throw new Error(`documents: signing failed: ${signError.message}`);
  }
  return signed?.signedUrl ?? null;
}
