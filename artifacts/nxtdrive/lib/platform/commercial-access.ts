import { NextResponse } from "next/server";
import { PLAN_LABELS } from "@/lib/platform/features";
import { loadTenantEntitlementSnapshot } from "@/lib/platform/entitlements";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function requireAdvancedReportExportAccess(
  tenantId: string,
): Promise<NextResponse | null> {
  const snapshot = await loadTenantEntitlementSnapshot(
    createServiceRoleClient(),
    tenantId,
  );
  const access = snapshot.featureAccess.advanced_reports;

  if (access.allowed) return null;

  return NextResponse.json(
    {
      code: "plan_required",
      feature: access.feature,
      required_plan: access.requiredPlan,
      message: `Exporteren vereist het ${PLAN_LABELS[access.requiredPlan]}-abonnement.`,
    },
    {
      status: 403,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
