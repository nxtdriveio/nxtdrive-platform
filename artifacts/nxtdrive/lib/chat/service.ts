import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type {
  ChatConversationSummary,
  ChatMessage,
  ChatSide,
  ChatThreadData,
} from "./types";

type ConversationRow = {
  id: string;
  tenant_id: string;
  student_id: string;
  instructor_id: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  student_last_read_at: string | null;
  instructor_last_read_at: string | null;
};

/**
 * Instructors the active student has had lessons with, scoped to BOTH the active
 * tenant and the active student row. These are the people a student can open a
 * chat with.
 *
 * IMPORTANT: this must NOT use the `my_lesson_instructors` RPC — that RPC is keyed
 * on `auth.uid()` across ALL of the user's student/guardian rows in ALL tenants,
 * so in a multi-tenant scenario it would surface instructors from other tenants
 * in the current tenant context. We query `lessons` filtered by `tenant_id` +
 * `student_id` instead. The caller must already have established ownership of
 * `studentId` for `tenantId` (via getActiveStudent), so a tenant-bounded
 * service-role read here is safe and keeps the list strictly tenant-scoped.
 */
export async function listStudentInstructors(params: {
  tenantId: string;
  studentId: string;
}): Promise<{ instructorId: string; name: string }[]> {
  const service = createServiceRoleClient();
  const { data } = await service
    .from("lessons")
    .select("instructor_id")
    .eq("tenant_id", params.tenantId)
    .eq("student_id", params.studentId);
  const ids = Array.from(
    new Set(
      ((data ?? []) as { instructor_id: string | null }[])
        .map((r) => r.instructor_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const names = await resolveInstructorNames(service, ids);
  return ids.map((id) => ({
    instructorId: id,
    name: names.get(id) ?? "Instructeur",
  }));
}

/**
 * Idempotently create/fetch the conversation for a (tenant, student, instructor)
 * triple. Service-role only — the RPC re-validates that the actor belongs to the
 * conversation and that the instructor is staff.
 */
export async function ensureConversation(params: {
  tenantId: string;
  studentId: string;
  instructorId: string;
  actorId: string;
}): Promise<string> {
  const service = createServiceRoleClient();
  const { data, error } = await service.rpc("ensure_chat_conversation", {
    p_tenant_id: params.tenantId,
    p_student_id: params.studentId,
    p_instructor_id: params.instructorId,
    p_actor: params.actorId,
  });
  if (error) {
    throw new Error(`ensure_chat_conversation failed: ${error.message}`);
  }
  return data as string;
}

function mapMessages(rows: unknown[]): ChatMessage[] {
  return (rows as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    conversationId: r.conversation_id as string,
    senderSide: r.sender_side as ChatSide,
    body: r.body as string,
    createdAt: r.created_at as string,
  }));
}

/**
 * Load the ordered messages of a conversation through the anon-key client so RLS
 * enforces visibility (the caller must be a participant). Returns null when the
 * conversation is not visible to the caller.
 */
export async function loadThreadMessages(
  tenantId: string,
  conversationId: string,
  opts: { afterIso?: string | null } = {},
): Promise<ChatMessage[]> {
  const supabase = await createServerSupabaseClient();
  let q = supabase
    .from("chat_messages")
    .select("id, conversation_id, sender_side, body, created_at")
    .eq("tenant_id", tenantId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (opts.afterIso) q = q.gt("created_at", opts.afterIso);
  const { data } = await q;
  return mapMessages(data ?? []);
}

/**
 * Mark the actor's side of a conversation as read (service-role RPC; the RPC
 * derives the side and re-validates ownership). Best-effort.
 */
export async function markConversationRead(params: {
  tenantId: string;
  conversationId: string;
  actorId: string;
}): Promise<void> {
  const service = createServiceRoleClient();
  const { error } = await service.rpc("mark_chat_read", {
    p_tenant_id: params.tenantId,
    p_conversation_id: params.conversationId,
    p_actor: params.actorId,
  });
  if (error) {
    console.error("[chat] mark_chat_read failed", error.message);
  }
}

async function resolveStudentNames(
  service: SupabaseClient,
  tenantId: string,
  studentIds: string[],
): Promise<Map<string, string>> {
  if (studentIds.length === 0) return new Map();
  const { data } = await service
    .from("students")
    .select("id, full_name")
    .eq("tenant_id", tenantId)
    .in("id", studentIds);
  return new Map(
    ((data ?? []) as { id: string; full_name: string }[]).map((s) => [
      s.id,
      s.full_name,
    ]),
  );
}

async function resolveInstructorNames(
  service: SupabaseClient,
  instructorIds: string[],
): Promise<Map<string, string>> {
  if (instructorIds.length === 0) return new Map();
  const { data } = await service
    .from("profiles")
    .select("id, full_name")
    .in("id", instructorIds);
  return new Map(
    ((data ?? []) as { id: string; full_name: string | null }[]).map((p) => [
      p.id,
      p.full_name ?? "Instructeur",
    ]),
  );
}

async function countUnread(
  service: SupabaseClient,
  conversationId: string,
  otherSide: ChatSide,
  sinceIso: string | null,
): Promise<number> {
  let q = service
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("sender_side", otherSide);
  if (sinceIso) q = q.gt("created_at", sinceIso);
  const { count } = await q;
  return count ?? 0;
}

/**
 * Instructor inbox: conversations assigned to this instructor (or all tenant
 * conversations for a tenant_admin), newest activity first, each with an unread
 * count (student messages since the instructor last read). Names + unread are
 * resolved with a tenant-bounded service-role read, mirroring the names pattern
 * used elsewhere — RLS only exposes the caller's own profile/student rows.
 */
export async function loadInstructorConversations(params: {
  tenantId: string;
  instructorId: string;
  isAdmin: boolean;
}): Promise<ChatConversationSummary[]> {
  const service = createServiceRoleClient();
  let q = service
    .from("chat_conversations")
    .select(
      "id, tenant_id, student_id, instructor_id, last_message_at, last_message_preview, student_last_read_at, instructor_last_read_at",
    )
    .eq("tenant_id", params.tenantId)
    .order("last_message_at", { ascending: false, nullsFirst: false });
  if (!params.isAdmin) q = q.eq("instructor_id", params.instructorId);
  const { data } = await q;
  const rows = (data ?? []) as ConversationRow[];

  const studentNames = await resolveStudentNames(
    service,
    params.tenantId,
    Array.from(new Set(rows.map((r) => r.student_id))),
  );
  const instructorNames = await resolveInstructorNames(
    service,
    Array.from(new Set(rows.map((r) => r.instructor_id))),
  );

  const unreadCounts = await Promise.all(
    rows.map((r) =>
      countUnread(service, r.id, "student", r.instructor_last_read_at),
    ),
  );

  return rows.map((r, i) => ({
    id: r.id,
    studentId: r.student_id,
    studentName: studentNames.get(r.student_id) ?? "Leerling",
    instructorId: r.instructor_id,
    instructorName: instructorNames.get(r.instructor_id) ?? "Instructeur",
    lastMessageAt: r.last_message_at,
    lastMessagePreview: r.last_message_preview,
    unreadCount: unreadCounts[i] ?? 0,
  }));
}

/**
 * Total unread student-side messages across an instructor's conversations — for
 * a "Berichten" badge. Tenant-bounded service-role read.
 */
export async function countInstructorUnread(params: {
  tenantId: string;
  instructorId: string;
  isAdmin: boolean;
}): Promise<number> {
  const conversations = await loadInstructorConversations(params);
  return conversations.reduce((sum, c) => sum + c.unreadCount, 0);
}

/**
 * Total unread instructor-side messages across a student's conversations — for
 * the student home "Chat" badge. Tenant-bounded service-role read (the caller
 * has already established ownership of `studentId` via getActiveStudent).
 */
export async function countStudentUnread(params: {
  tenantId: string;
  studentId: string;
}): Promise<number> {
  const service = createServiceRoleClient();
  const { data } = await service
    .from("chat_conversations")
    .select("id, student_last_read_at")
    .eq("tenant_id", params.tenantId)
    .eq("student_id", params.studentId);
  const rows = (data ?? []) as {
    id: string;
    student_last_read_at: string | null;
  }[];
  const counts = await Promise.all(
    rows.map((r) =>
      countUnread(service, r.id, "instructor", r.student_last_read_at),
    ),
  );
  return counts.reduce((sum, n) => sum + n, 0);
}

/**
 * Load a single conversation thread for the instructor side (by conversation id),
 * marking it read. Returns null when the conversation is not in the tenant or not
 * assigned to the instructor (and the caller is not an admin).
 */
export async function loadInstructorThread(params: {
  tenantId: string;
  conversationId: string;
  instructorId: string;
  isAdmin: boolean;
}): Promise<ChatThreadData | null> {
  const service = createServiceRoleClient();
  const { data } = await service
    .from("chat_conversations")
    .select("id, tenant_id, student_id, instructor_id")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.conversationId)
    .maybeSingle();
  const row = data as Pick<
    ConversationRow,
    "id" | "tenant_id" | "student_id" | "instructor_id"
  > | null;
  if (!row) return null;
  if (!params.isAdmin && row.instructor_id !== params.instructorId) return null;

  const [studentNames] = await Promise.all([
    resolveStudentNames(service, params.tenantId, [row.student_id]),
  ]);

  await markConversationRead({
    tenantId: params.tenantId,
    conversationId: params.conversationId,
    actorId: params.instructorId,
  });

  const messages = await loadThreadMessages(
    params.tenantId,
    params.conversationId,
  );

  return {
    conversationId: params.conversationId,
    side: "instructor",
    counterpartName: studentNames.get(row.student_id) ?? "Leerling",
    messages,
  };
}
