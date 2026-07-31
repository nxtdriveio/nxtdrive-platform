import { NextResponse } from "next/server";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { createStudentDocumentDownloadUrl } from "@/lib/students/documents";

export const dynamic = "force-dynamic";

/**
 * Generates a short-lived signed download URL for a student document and
 * redirects the browser to it. Staff (tenant_admin / instructor) only; the
 * document must belong to the active tenant and the given student. Files are
 * never publicly accessible — this is the only download path.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { id: studentId, docId } = await params;
  const { tenant } = await requireActiveTenant(["tenant_admin", "instructor"]);

  const service = createServiceRoleClient();
  const signedUrl = await createStudentDocumentDownloadUrl(service, {
    tenantId: tenant.id,
    studentId,
    documentId: docId,
  });
  if (!signedUrl) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.redirect(signedUrl);
}
