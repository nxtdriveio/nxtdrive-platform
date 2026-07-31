import { NextResponse } from "next/server";
import { loadPortalContext } from "@/lib/parent-portal/context";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { createStudentDocumentDownloadUrl } from "@/lib/students/documents";

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
  const signedUrl = await createStudentDocumentDownloadUrl(service, {
    tenantId: ctx.tenant.id,
    studentId: ctx.student.id,
    documentId: docId,
  });
  if (!signedUrl) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.redirect(signedUrl);
}
