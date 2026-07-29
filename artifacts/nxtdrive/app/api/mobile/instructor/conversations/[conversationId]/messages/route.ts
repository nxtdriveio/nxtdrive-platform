import type { NextRequest } from "next/server";
import {
  mobileError,
  MobileApiError,
  requireMobileInstructor,
} from "@/lib/mobile/auth";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

export async function POST(request: NextRequest, route: RouteContext) {
  try {
    const context = await requireMobileInstructor(request);
    const { conversationId } = await route.params;
    if (!UUID_RE.test(conversationId)) {
      throw new MobileApiError(
        404,
        "Gesprek niet gevonden.",
        "conversation_not_found",
      );
    }
    const body = (await request.json().catch(() => null)) as {
      body?: unknown;
    } | null;
    const messageBody = String(body?.body ?? "").trim();
    if (!messageBody || messageBody.length > 4000) {
      throw new MobileApiError(
        400,
        "Een bericht moet tussen 1 en 4000 tekens bevatten.",
        "invalid_message",
      );
    }

    const { data: messageId, error } = await context.service.rpc(
      "send_chat_message",
      {
        p_tenant_id: context.tenant.id,
        p_conversation_id: conversationId,
        p_actor: context.user.id,
        p_body: messageBody,
      },
    );
    if (error || !messageId) {
      throw new MobileApiError(
        error?.code === "42501" ? 403 : 503,
        error?.code === "42501"
          ? "Je hebt geen toegang tot dit gesprek."
          : "Bericht kon niet worden verzonden.",
        "message_send_failed",
      );
    }
    const { data: row, error: loadError } = await context.service
      .from("chat_messages")
      .select("id, sender_side, body, created_at")
      .eq("tenant_id", context.tenant.id)
      .eq("id", String(messageId))
      .maybeSingle();
    if (loadError || !row) {
      throw new MobileApiError(
        503,
        "Het verzonden bericht kon niet worden geladen.",
        "message_load_failed",
      );
    }
    return Response.json(
      {
        message: {
          id: row.id as string,
          sender: row.sender_side as string,
          body: row.body as string,
          createdAt: row.created_at as string,
        },
      },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return mobileError(error);
  }
}
