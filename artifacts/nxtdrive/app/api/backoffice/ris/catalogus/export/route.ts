import { NextResponse } from "next/server";
import { requireOrganizationPermission } from "@/lib/organization";
import { loadRisCatalogReview } from "@/lib/ris/catalog-review";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { STUDENT_BACKOFFICE_READ_ROLES } from "@/lib/students/access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = await requireOrganizationPermission("student:read", {
    allowedRoles: [...STUDENT_BACKOFFICE_READ_ROLES],
  });
  const requestedVersionId = new URL(request.url).searchParams.get("version");
  const review = await loadRisCatalogReview(
    createServiceRoleClient(),
    context.organization.id,
    requestedVersionId,
  );
  const payload = {
    schemaVersion: "ris-validation-package.v1",
    generatedAt: new Date().toISOString(),
    generatedFor: {
      tenantId: context.organization.id,
      tenantName: context.organization.name,
    },
    version: review.selectedVersion,
    contentHash: review.snapshot.contentHash,
    curriculum: review.curriculum,
    validation: review.validation,
    releaseGate: review.releaseGate,
    counts: review.counts,
    catalog: review.snapshot.document,
  };
  const versionSlug = review.selectedVersion.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

  return new NextResponse(`${JSON.stringify(payload, null, 2)}\n`, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="nxtdrive-ris-${versionSlug || "catalogus"}-validatie.json"`,
      "cache-control": "private, no-store",
    },
  });
}
