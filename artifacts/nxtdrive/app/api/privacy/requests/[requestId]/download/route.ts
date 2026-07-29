import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { createTemporaryDownloadUrl } from "@/lib/privacy/service";
import { createServiceRoleClient } from "@/lib/supabase/service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { requestId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  try {
    const signedUrl = await createTemporaryDownloadUrl(
      createServiceRoleClient(),
      {
        requestId,
        actorUserId: user.id,
        tenantIds: user.memberships.map((membership) => membership.tenant_id),
      },
    );
    return NextResponse.redirect(signedUrl, {
      headers: { "Cache-Control": "no-store, private" },
    });
  } catch {
    return NextResponse.json(
      { error: "De export is niet beschikbaar of verlopen." },
      { status: 404 },
    );
  }
}
