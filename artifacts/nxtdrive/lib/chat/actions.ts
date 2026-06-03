"use server";

import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { loadThreadMessages, markConversationRead } from "./service";
import { notifyChatMessage } from "./notify";
import type { ChatMessage, ChatSide } from "./types";

const CHAT_ROLES = ["student", "parent", "instructor", "tenant_admin"] as const;

export type SendChatResult =
  | { ok: true; message: ChatMessage }
  | { ok: false; error: string };

/**
 * Send a chat message. The locked RPC re-validates the actor and derives the
 * sender side, so a forged conversation/side is impossible. After the insert we
 * fire a best-effort in-app notification to the other party (never blocks).
 */
export async function sendChatMessageAction(
  conversationId: string,
  body: string,
): Promise<SendChatResult> {
  const { user, tenant } = await requireActiveTenant([...CHAT_ROLES]);
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Bericht mag niet leeg zijn." };
  if (trimmed.length > 4000) {
    return { ok: false, error: "Bericht is te lang (max 4000 tekens)." };
  }

  const service = createServiceRoleClient();
  const { data: messageId, error } = await service.rpc("send_chat_message", {
    p_tenant_id: tenant.id,
    p_conversation_id: conversationId,
    p_actor: user.id,
    p_body: trimmed,
  });
  if (error || !messageId) {
    return {
      ok: false,
      error: error?.message ?? "Bericht kon niet worden verzonden.",
    };
  }

  const { data: msgRow } = await service
    .from("chat_messages")
    .select("id, conversation_id, sender_side, body, created_at")
    .eq("id", messageId as string)
    .maybeSingle();
  const message: ChatMessage = {
    id: (msgRow?.id as string) ?? (messageId as string),
    conversationId,
    senderSide: (msgRow?.sender_side as ChatSide) ?? "student",
    body: (msgRow?.body as string) ?? trimmed,
    createdAt: (msgRow?.created_at as string) ?? new Date().toISOString(),
  };

  // Resolve recipients + sender name for the notification (tenant-bounded).
  const { data: conv } = await service
    .from("chat_conversations")
    .select("student_id, instructor_id")
    .eq("id", conversationId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (conv) {
    const studentId = conv.student_id as string;
    const instructorId = conv.instructor_id as string;
    const [{ data: studentRow }, { data: instructorRow }] = await Promise.all([
      service
        .from("students")
        .select("full_name, user_id")
        .eq("id", studentId)
        .maybeSingle(),
      service
        .from("profiles")
        .select("full_name")
        .eq("id", instructorId)
        .maybeSingle(),
    ]);
    const senderName =
      message.senderSide === "student"
        ? ((studentRow?.full_name as string) ?? "Leerling")
        : ((instructorRow?.full_name as string) ?? "Instructeur");

    await notifyChatMessage(service, {
      tenantId: tenant.id,
      conversationId,
      messageId: message.id,
      senderSide: message.senderSide,
      senderName,
      bodyPreview: message.body,
      studentUserId: (studentRow?.user_id as string | null) ?? null,
      instructorUserId: instructorId,
    });
  }

  return { ok: true, message };
}

export type FetchChatResult = {
  messages: ChatMessage[];
};

/**
 * Poll new messages for a conversation (those after `afterIso`, or all when
 * omitted) and mark the actor's side as read. Reads go through the anon-key
 * client so RLS enforces participant-only visibility.
 */
export async function fetchChatMessagesAction(
  conversationId: string,
  afterIso?: string | null,
): Promise<FetchChatResult> {
  const { user, tenant } = await requireActiveTenant([...CHAT_ROLES]);
  const messages = await loadThreadMessages(tenant.id, conversationId, {
    afterIso: afterIso ?? null,
  });
  await markConversationRead({
    tenantId: tenant.id,
    conversationId,
    actorId: user.id,
  });
  return { messages };
}

/** Mark a conversation as read for the calling user's side. */
export async function markChatReadAction(
  conversationId: string,
): Promise<{ ok: boolean }> {
  const { user, tenant } = await requireActiveTenant([...CHAT_ROLES]);
  await markConversationRead({
    tenantId: tenant.id,
    conversationId,
    actorId: user.id,
  });
  return { ok: true };
}
