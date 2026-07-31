import { NextResponse } from "next/server";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { getActiveStudent } from "@/lib/students/access";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { createStudentDocumentDownloadUrl } from "@/lib/students/documents";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  const { user, tenant, roles } = await requireActiveTenant([
    "student",
    "parent",
  ]);
  const { student } = await getActiveStudent(user, tenant.id, roles);
  if (!student) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const signedUrl = await createStudentDocumentDownloadUrl(
    createServiceRoleClient(),
    {
      tenantId: tenant.id,
      studentId: student.id,
      documentId,
    },
  );
  if (!signedUrl) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.redirect(signedUrl);
}
