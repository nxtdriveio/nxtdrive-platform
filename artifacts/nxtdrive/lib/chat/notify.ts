import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchInApp } from "@/lib/notifications/in-app";
import type { ChatSide } from "./types";

/**
 * Best-effort in-app notification to the OTHER party of a chat message. Reuses
 * the existing in-app channel (idempotent per dedupe key; web push inherits on
 * creation). Never throws — a notification hiccup must never block the send.
 *
 * dedupe key is per-message (`chat_message:{messageId}`) so each message yields
 * exactly one notification and a retried dispatch never double-notifies.
 */
export async function notifyChatMessage(
  service: SupabaseClient,
  params: {
    tenantId: string;
    conversationId: string;
    messageId: string;
    senderSide: ChatSide;
    senderName: string;
    bodyPreview: string;
    studentUserId: string | null;
    instructorUserId: string;
  },
): Promise<void> {
  try {
    const toInstructor = params.senderSide === "student";
    const recipientUserId = toInstructor
      ? params.instructorUserId
      : params.studentUserId;
    if (!recipientUserId) return;

    const link = toInstructor
      ? `/instructeur/berichten/${params.conversationId}`
      : `/leerling/berichten`;

    await dispatchInApp(service, {
      tenantId: params.tenantId,
      type: "chat_message",
      dedupeKey: `chat_message:${params.messageId}`,
      relatedType: "chat_conversation",
      relatedId: params.conversationId,
      inApp: {
        recipientUserId,
        title: `Nieuw bericht van ${params.senderName}`,
        body: params.bodyPreview.slice(0, 140),
        link,
      },
    });
  } catch (err) {
    console.error("[chat] notify failed", {
      messageId: params.messageId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
