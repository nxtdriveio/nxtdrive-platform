import "server-only";

import { loadInstructorConversations } from "@/lib/chat/service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type InstructorLiveCounts = {
  unreadMessages: number;
  openTasks: number;
};

export async function loadInstructorLiveCounts(input: {
  tenantId: string;
  instructorId: string;
  isAdmin: boolean;
}): Promise<InstructorLiveCounts> {
  const supabase = await createServerSupabaseClient();
  const [tasksResult, conversations] = await Promise.all([
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", input.tenantId)
      .eq("assignee_user_id", input.instructorId)
      .is("archived_at", null),
    loadInstructorConversations({
      tenantId: input.tenantId,
      instructorId: input.instructorId,
      isAdmin: input.isAdmin,
    }),
  ]);

  if (tasksResult.error) throw tasksResult.error;

  return {
    openTasks: tasksResult.count ?? 0,
    unreadMessages: conversations.reduce(
      (total, conversation) => total + conversation.unreadCount,
      0,
    ),
  };
}
