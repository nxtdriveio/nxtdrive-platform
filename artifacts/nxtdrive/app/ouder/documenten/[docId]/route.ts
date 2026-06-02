import { NextResponse } from "next/server";
import { loadPortalContext } from "@/lib/parent-portal/context";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { STUDENT_DOCUMENT_BUCKET } from "@/lib/students/document-types";

export const dynamic = "force-dynamic";

/**
 * Parent-facing download for a child's document. Generates a short-lived signed
 * URL and redirects to it. Authorization is layered:
 *   1. loadPortalContext resolves the parent's active child (guardian-linked,
 *      tenant-scoped) and enforces the documenten section being enabled.
 *   2. We then confirm the document belongs to that exact tenant + child before
 *      signing. The storage path never leaves the server.
 * Files are never publicly accessible — this is the only parent download path.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ docId: string }> },
) {
  const { docId } = await params;
  const ctx = await loadPortalContext();

  if (!ctx.student || !ctx.visibility.documenten) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const service = createServiceRoleClient();
  const { data: doc, error } = await service
    .from("student_documents")
    .select("storage_path, file_name, student_id, tenant_id")
    .eq("id", docId)
    .eq("tenant_id", ctx.tenant.id)
    .eq("student_id", ctx.student.id)
    .maybeSingle();

  if (error || !doc) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: signed, error: signError } = await service.storage
    .from(STUDENT_DOCUMENT_BUCKET)
    .createSignedUrl(doc.storage_path as string, 60, {
      download: doc.file_name as string,
    });

  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: "sign_failed" }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
