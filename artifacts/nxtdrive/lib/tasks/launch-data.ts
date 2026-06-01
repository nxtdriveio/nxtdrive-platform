import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenantMember } from "./types";

export type LaunchBoard = {
  id: string;
  name: string;
  firstColumnId: string | null;
};

export type TaskLaunchData = {
  boards: LaunchBoard[];
  members: TenantMember[];
};

/**
 * Loads everything the "Taak aanmaken" launcher needs from an entity page:
 * the tenant's boards (each with its first column, since entity pages have no
 * board context) and the assignable members. Service-role; caller validates
 * tenant access.
 */
export async function loadTaskLaunchData(
  service: SupabaseClient,
  tenantId: string,
): Promise<TaskLaunchData> {
  const { data: boardsRaw } = await service
    .from("task_boards")
    .select("id, name, sort_order")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });
  const boardList = (boardsRaw ?? []) as {
    id: string;
    name: string;
    sort_order: number;
  }[];

  const { data: colsRaw } = boardList.length
    ? await service
        .from("task_columns")
        .select("id, board_id, sort_order")
        .eq("tenant_id", tenantId)
        .order("sort_order", { ascending: true })
    : { data: [] };
  const cols = (colsRaw ?? []) as {
    id: string;
    board_id: string;
    sort_order: number;
  }[];

  const firstCol = new Map<string, string>();
  for (const c of cols) {
    if (!firstCol.has(c.board_id)) firstCol.set(c.board_id, c.id);
  }

  const boards: LaunchBoard[] = boardList.map((b) => ({
    id: b.id,
    name: b.name,
    firstColumnId: firstCol.get(b.id) ?? null,
  }));

  const { data: membershipsRaw } = await service
    .from("memberships")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .in("role", ["instructor", "tenant_admin"]);
  const memberIds = Array.from(
    new Set((membershipsRaw ?? []).map((m) => m.user_id as string)),
  );
  const { data: profilesRaw } = memberIds.length
    ? await service.from("profiles").select("id, full_name").in("id", memberIds)
    : { data: [] };
  const members = (profilesRaw ?? []) as TenantMember[];
  members.sort((a, b) =>
    (a.full_name ?? "").localeCompare(b.full_name ?? "", "nl"),
  );

  return { boards, members };
}
