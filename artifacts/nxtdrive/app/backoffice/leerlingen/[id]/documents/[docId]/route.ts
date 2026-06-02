import { NextResponse } from "next/server";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { STUDENT_DOCUMENT_BUCKET } from "@/lib/students/document-types";

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
  const { data: doc, error } = await service
    .from("student_documents")
    .select("storage_path, file_name, student_id, tenant_id")
    .eq("id", docId)
    .eq("tenant_id", tenant.id)
    .eq("student_id", studentId)
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
