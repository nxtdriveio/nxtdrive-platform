import { NextResponse } from "next/server";

import { resolveActiveTenant } from "@/lib/auth/active-tenant";
import { getCurrentUser } from "@/lib/auth/session";
import { runRetentionDryRun } from "@/lib/privacy/retention-service";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await resolveActiveTenant(user);
  if (!tenant) {
    return NextResponse.json({ error: "Selecteer een rijschool." }, { status: 409 });
  }
  const mayManage = user.profile?.is_platform_admin
    ? true
    : user.memberships.some(
        (membership) =>
          membership.tenant_id === tenant.id &&
          membership.role === "tenant_admin",
      );
  if (!mayManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const result = await runRetentionDryRun(createServiceRoleClient(), {
      tenantId: tenant.id,
      actorUserId: user.id,
      now: new Date(),
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Retention dry-run failed.",
      },
      { status: 409 },
    );
  }
}
