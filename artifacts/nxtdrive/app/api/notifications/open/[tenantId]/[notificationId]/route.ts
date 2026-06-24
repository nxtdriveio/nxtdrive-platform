import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

const TRANSPARENT_GIF = Uint8Array.from([
  71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255, 255, 33,
  249, 4, 1, 0, 0, 0, 0, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59,
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tenantId: string; notificationId: string }> },
) {
  const { tenantId, notificationId } = await params;

  if (looksLikeUuid(tenantId) && looksLikeUuid(notificationId)) {
    try {
      const service = createServiceRoleClient();
      await service.rpc("mark_notification_opened", {
        p_id: notificationId,
        p_tenant_id: tenantId,
      });
    } catch {
      // Tracking pixels must never break mail rendering.
    }
  }

  return new NextResponse(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, max-age=0",
      "Content-Length": String(TRANSPARENT_GIF.byteLength),
    },
  });
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
