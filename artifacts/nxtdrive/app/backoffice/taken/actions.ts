"use server";

import { revalidatePath } from "next/cache";
import {
  loadOrganizationBranchScope,
  requireOrganizationPermission,
} from "@/lib/organization";
import { canAccessBranch, type BranchAccessScope } from "@/lib/permissions";
import type { AuthorizedOrganizationContext } from "@/lib/organization";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { notifyTaskAssigned } from "@/lib/notifications/dispatch";
import {
  TASK_LINK_TYPES,
  TASK_PRIORITIES,
  type EntitySearchResult,
  type TaskLinkType,
  type TaskPriority,
} from "@/lib/tasks/types";

function priorityOf(v: unknown): TaskPriority {
  return typeof v === "string" &&
    (TASK_PRIORITIES as readonly string[]).includes(v)
    ? (v as TaskPriority)
    : "normal";
}

function cleanStr(v: FormDataEntryValue | null, max: number): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s.slice(0, max);
}

function parseBranchId(v: FormDataEntryValue | null): string | null {
  return cleanStr(v, 100);
}

export type ActionResult = { ok: boolean; error?: string };

type TaskManageAccess = {
  context: AuthorizedOrganizationContext;
  service: ReturnType<typeof createServiceRoleClient>;
  branchScope: BranchAccessScope;
};

type ExistingTaskManage = {
  ok: true;
  branchId: string | null;
  boardId: string;
  boardBranchId: string | null;
};

type TaskColumnAccess = {
  ok: true;
  boardId: string;
  boardBranchId: string | null;
};

async function requireTaskManageAccess(): Promise<TaskManageAccess> {
  const context = await requireOrganizationPermission("task:manage");
  const service = createServiceRoleClient();
  const branchScope = await loadOrganizationBranchScope(service, context);
  return { context, service, branchScope };
}

function canManageTaskBranch(
  branchScope: BranchAccessScope,
  branchId: string | null,
): boolean {
  if (branchScope.scope_type === "all") return true;
  if (!branchId) return false;
  return canAccessBranch(branchScope, branchId);
}

function canUseTaskBoardBranch(
  branchScope: BranchAccessScope,
  branchId: string | null,
): boolean {
  if (!branchId) return true;
  if (branchScope.scope_type === "all") return true;
  return canAccessBranch(branchScope, branchId);
}

function resolveSubmittedBranchId(
  access: TaskManageAccess,
  submittedBranchId: string | null,
): string | null {
  if (submittedBranchId) return submittedBranchId;
  if (
    access.branchScope.scope_type === "branches" &&
    access.branchScope.branch_ids.length === 1
  ) {
    return access.branchScope.branch_ids[0] ?? null;
  }
  return null;
}

async function loadBoardBranch(
  access: TaskManageAccess,
  boardId: string,
): Promise<{ ok: true; branchId: string | null } | { ok: false; error: string }> {
  const { data, error } = await access.service
    .from("task_boards")
    .select("id, branch_id")
    .eq("tenant_id", access.context.organization.id)
    .eq("id", boardId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Taakbord niet gevonden." };

  const branchId = (data as { branch_id: string | null }).branch_id;
  if (!canUseTaskBoardBranch(access.branchScope, branchId)) {
    return { ok: false, error: "Geen toegang tot dit taakbord." };
  }

  return { ok: true, branchId };
}

async function requireTaskColumnAccess(
  access: TaskManageAccess,
  columnId: string,
): Promise<TaskColumnAccess | { ok: false; error: string }> {
  const { data, error } = await access.service
    .from("task_columns")
    .select("id, board_id")
    .eq("tenant_id", access.context.organization.id)
    .eq("id", columnId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Taakkolom niet gevonden." };

  const boardId = (data as { board_id: string }).board_id;
  const board = await loadBoardBranch(access, boardId);
  if (!board.ok) return board;

  return { ok: true, boardId, boardBranchId: board.branchId };
}

async function requireExistingTaskManage(
  access: TaskManageAccess,
  taskId: string,
): Promise<ExistingTaskManage | { ok: false; error: string }> {
  const { data, error } = await access.service
    .from("tasks")
    .select("id, branch_id, board_id")
    .eq("tenant_id", access.context.organization.id)
    .eq("id", taskId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Taak niet gevonden." };

  const row = data as { branch_id: string | null; board_id: string };
  if (!canManageTaskBranch(access.branchScope, row.branch_id)) {
    return { ok: false, error: "Geen toegang tot deze taakvestiging." };
  }

  const board = await loadBoardBranch(access, row.board_id);
  if (!board.ok) return board;

  return {
    ok: true,
    branchId: row.branch_id,
    boardId: row.board_id,
    boardBranchId: board.branchId,
  };
}

function validateTargetBranch(
  access: TaskManageAccess,
  branchId: string | null,
): ActionResult {
  if (!canManageTaskBranch(access.branchScope, branchId)) {
    return { ok: false, error: "Geen toegang tot deze vestiging." };
  }
  return { ok: true };
}

function validateTaskBoardBranch(
  boardBranchId: string | null,
  taskBranchId: string | null,
): ActionResult {
  if (boardBranchId && boardBranchId !== taskBranchId) {
    return {
      ok: false,
      error: "Taak moet binnen de vestiging van dit bord blijven.",
    };
  }
  return { ok: true };
}

async function assignTaskBranch(
  access: TaskManageAccess,
  taskId: string,
  branchId: string | null,
): Promise<ActionResult> {
  const { error } = await access.service.rpc("assign_task_branch", {
    p_task_id: taskId,
    p_tenant_id: access.context.organization.id,
    p_actor: access.context.user.id,
    p_branch_id: branchId,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Best-effort task-assigned notification. Delivery (or its absence) must never
 * block the task mutation itself, so failures are swallowed here.
 */
async function notifyAssignee(
  service: ReturnType<typeof createServiceRoleClient>,
  tenantId: string,
  taskId: string,
  assigneeUserId: string | null,
): Promise<void> {
  if (!assigneeUserId) return;
  try {
    await notifyTaskAssigned(service, tenantId, taskId, assigneeUserId);
  } catch {
    // swallow - notification is best-effort
  }
}

export async function createTask(formData: FormData): Promise<ActionResult> {
  const access = await requireTaskManageAccess();
  const { context, service } = access;
  const tenant = context.organization;
  const user = context.user;

  const boardId = String(formData.get("board_id") ?? "");
  const columnId = String(formData.get("column_id") ?? "");
  const branchId = resolveSubmittedBranchId(
    access,
    parseBranchId(formData.get("branch_id")),
  );
  const title = cleanStr(formData.get("title"), 200);
  if (!boardId || !columnId) return { ok: false, error: "Bord of kolom ontbreekt." };
  if (!title) return { ok: false, error: "Titel is verplicht." };

  const branchCheck = validateTargetBranch(access, branchId);
  if (!branchCheck.ok) return branchCheck;

  const column = await requireTaskColumnAccess(access, columnId);
  if (!column.ok) return column;
  if (column.boardId !== boardId) {
    return { ok: false, error: "Kolom hoort niet bij dit taakbord." };
  }
  const boardBranchCheck = validateTaskBoardBranch(
    column.boardBranchId,
    branchId,
  );
  if (!boardBranchCheck.ok) return boardBranchCheck;

  const assignee = cleanStr(formData.get("assignee_user_id"), 100);

  const { data: newTaskId, error } = await service.rpc("create_task", {
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_board_id: boardId,
    p_column_id: columnId,
    p_title: title,
    p_description: cleanStr(formData.get("description"), 4000),
    p_priority: priorityOf(formData.get("priority")),
    p_due_date: cleanStr(formData.get("due_date"), 10),
    p_assignee_user_id: assignee,
    p_department_id: null,
  });
  if (error) return { ok: false, error: error.message };

  if (newTaskId) {
    const assignBranch = await assignTaskBranch(access, newTaskId as string, branchId);
    if (!assignBranch.ok) return assignBranch;
  }

  // Optional initial link (used by "Taak aanmaken" launchers on entity pages).
  const linkType = String(formData.get("link_entity_type") ?? "");
  const linkEntityId = String(formData.get("link_entity_id") ?? "");
  if (
    newTaskId &&
    linkType &&
    linkEntityId &&
    (TASK_LINK_TYPES as readonly string[]).includes(linkType)
  ) {
    const { error: linkErr } = await service.rpc("link_task_entity", {
      p_task_id: newTaskId,
      p_tenant_id: tenant.id,
      p_actor: user.id,
      p_entity_type: linkType,
      p_entity_id: linkEntityId,
    });
    if (linkErr) {
      // Linking is the whole point of the launcher flow. If it fails, don't
      // leave an orphan task behind - archive it so the board stays consistent.
      await service.rpc("archive_task", {
        p_task_id: newTaskId,
        p_tenant_id: tenant.id,
        p_actor: user.id,
      });
      return { ok: false, error: linkErr.message };
    }
  }

  if (newTaskId) {
    await notifyAssignee(service, tenant.id, newTaskId as string, assignee);
  }

  revalidatePath("/backoffice/taken");
  revalidatePath("/instructor/taken");
  return { ok: true };
}

export async function linkTaskEntity(input: {
  taskId: string;
  entityType: TaskLinkType;
  entityId: string;
}): Promise<{ ok: boolean; linkId?: string; error?: string }> {
  const access = await requireTaskManageAccess();
  const { context, service } = access;
  if (!input.taskId || !input.entityId) {
    return { ok: false, error: "Ongeldige koppeling." };
  }
  if (!(TASK_LINK_TYPES as readonly string[]).includes(input.entityType)) {
    return { ok: false, error: "Onbekend entiteitstype." };
  }
  const target = await requireExistingTaskManage(access, input.taskId);
  if (!target.ok) return target;

  const { data: linkId, error } = await service.rpc("link_task_entity", {
    p_task_id: input.taskId,
    p_tenant_id: context.organization.id,
    p_actor: context.user.id,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/taken");
  revalidatePath("/instructor/taken");
  return { ok: true, linkId: (linkId as string) ?? undefined };
}

export async function unlinkTaskEntity(input: {
  linkId: string;
}): Promise<ActionResult> {
  const access = await requireTaskManageAccess();
  const { context, service } = access;
  if (!input.linkId) return { ok: false, error: "Koppeling ontbreekt." };

  const { data: linkRow, error: linkLoadError } = await service
    .from("task_links")
    .select("task_id")
    .eq("tenant_id", context.organization.id)
    .eq("id", input.linkId)
    .maybeSingle();
  if (linkLoadError) return { ok: false, error: linkLoadError.message };
  if (!linkRow) return { ok: false, error: "Koppeling niet gevonden." };
  const target = await requireExistingTaskManage(
    access,
    String((linkRow as { task_id: string }).task_id),
  );
  if (!target.ok) return target;

  const { error } = await service.rpc("unlink_task_entity", {
    p_link_id: input.linkId,
    p_tenant_id: context.organization.id,
    p_actor: context.user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/taken");
  revalidatePath("/instructor/taken");
  return { ok: true };
}

/**
 * Searches candidate entities of a given type within the active tenant, for the
 * card link picker. Service-role reads are constrained by the caller's task
 * management branch scope before returning options.
 */
export async function searchLinkEntities(
  entityType: TaskLinkType,
  query: string,
): Promise<{ ok: boolean; results: EntitySearchResult[]; error?: string }> {
  const access = await requireTaskManageAccess();
  const { context, service, branchScope } = access;
  const tenant = context.organization;
  if (!(TASK_LINK_TYPES as readonly string[]).includes(entityType)) {
    return { ok: false, results: [], error: "Onbekend entiteitstype." };
  }

  const q = query.trim();
  const limit = 15;
  const branchIds = branchScope.scope_type === "branches" ? branchScope.branch_ids : null;
  if (branchIds && branchIds.length === 0) return { ok: true, results: [] };

  try {
    if (entityType === "student" || entityType === "exam") {
      let sb = service
        .from("students")
        .select("id, full_name")
        .eq("tenant_id", tenant.id);
      if (branchIds) sb = sb.in("branch_id", [...branchIds]);
      if (q) sb = sb.ilike("full_name", `%${q}%`);
      const { data } = await sb
        .order("full_name", { ascending: true })
        .limit(limit);
      return {
        ok: true,
        results: ((data ?? []) as { id: string; full_name: string | null }[]).map(
          (s) => ({ id: s.id, label: s.full_name ?? "Naamloze leerling" }),
        ),
      };
    }

    if (entityType === "lead") {
      let sb = service
        .from("leads")
        .select("id, full_name")
        .eq("tenant_id", tenant.id);
      if (branchIds) sb = sb.in("branch_id", [...branchIds]);
      if (q) sb = sb.ilike("full_name", `%${q}%`);
      const { data } = await sb
        .order("full_name", { ascending: true })
        .limit(limit);
      return {
        ok: true,
        results: ((data ?? []) as { id: string; full_name: string | null }[]).map(
          (l) => ({ id: l.id, label: l.full_name ?? "Naamloze lead" }),
        ),
      };
    }

    if (entityType === "instructor") {
      const { data: membershipsRaw } = await service
        .from("memberships")
        .select("user_id")
        .eq("tenant_id", tenant.id)
        .in("role", ["tenant_admin", "instructor"]);
      const ids = Array.from(
        new Set((membershipsRaw ?? []).map((m) => m.user_id as string)),
      );
      if (ids.length === 0) return { ok: true, results: [] };
      let sb = service.from("profiles").select("id, full_name").in("id", ids);
      if (q) sb = sb.ilike("full_name", `%${q}%`);
      const { data } = await sb
        .order("full_name", { ascending: true })
        .limit(limit);
      return {
        ok: true,
        results: ((data ?? []) as { id: string; full_name: string | null }[]).map(
          (p) => ({ id: p.id, label: p.full_name ?? "Instructeur" }),
        ),
      };
    }

    if (entityType === "invoice") {
      let studentIds: string[] | null = null;
      if (branchIds) {
        const { data: students } = await service
          .from("students")
          .select("id")
          .eq("tenant_id", tenant.id)
          .in("branch_id", [...branchIds]);
        studentIds = ((students ?? []) as { id: string }[]).map((s) => s.id);
        if (studentIds.length === 0) return { ok: true, results: [] };
      }

      let sb = service
        .from("invoices")
        .select("id, invoice_no, student_id")
        .eq("tenant_id", tenant.id);
      if (studentIds) sb = sb.in("student_id", studentIds);
      const qn = Number(q.replace(/[^0-9]/g, ""));
      if (q && Number.isFinite(qn) && qn > 0) sb = sb.eq("invoice_no", qn);
      const { data } = await sb
        .order("invoice_no", { ascending: false })
        .limit(limit);
      const rows = (data ?? []) as {
        id: string;
        invoice_no: number;
        student_id: string | null;
      }[];
      const sids = Array.from(
        new Set(
          rows.map((r) => r.student_id).filter((v): v is string => Boolean(v)),
        ),
      );
      const { data: studs } = sids.length
        ? await service.from("students").select("id, full_name").in("id", sids)
        : { data: [] };
      const nameMap = new Map(
        ((studs ?? []) as { id: string; full_name: string | null }[]).map((s) => [
          s.id,
          s.full_name ?? "Leerling",
        ]),
      );
      return {
        ok: true,
        results: rows.map((r) => ({
          id: r.id,
          label: `Factuur #${String(r.invoice_no).padStart(4, "0")}${
            r.student_id ? ` - ${nameMap.get(r.student_id) ?? ""}` : ""
          }`,
        })),
      };
    }

    if (entityType === "lesson") {
      let sb = service
        .from("lessons")
        .select("id, starts_at, student_id")
        .eq("tenant_id", tenant.id);
      if (branchIds) sb = sb.in("branch_id", [...branchIds]);
      const { data } = await sb
        .order("starts_at", { ascending: false })
        .limit(50);
      const rows = (data ?? []) as {
        id: string;
        starts_at: string;
        student_id: string | null;
      }[];
      const sids = Array.from(
        new Set(
          rows.map((r) => r.student_id).filter((v): v is string => Boolean(v)),
        ),
      );
      const { data: studs } = sids.length
        ? await service.from("students").select("id, full_name").in("id", sids)
        : { data: [] };
      const nameMap = new Map(
        ((studs ?? []) as { id: string; full_name: string | null }[]).map((s) => [
          s.id,
          s.full_name ?? "Leerling",
        ]),
      );
      const fmt = new Intl.DateTimeFormat("nl-NL", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
      let mapped = rows.map((r) => ({
        id: r.id,
        label: `${fmt.format(new Date(r.starts_at))} - ${
          r.student_id ? (nameMap.get(r.student_id) ?? "Leerling") : "Leerling"
        }`,
      }));
      if (q) {
        const ql = q.toLowerCase();
        mapped = mapped.filter((m) => m.label.toLowerCase().includes(ql));
      }
      return { ok: true, results: mapped.slice(0, limit) };
    }

    return { ok: true, results: [] };
  } catch (e) {
    return {
      ok: false,
      results: [],
      error: e instanceof Error ? e.message : "Zoeken mislukt.",
    };
  }
}

export async function updateTask(formData: FormData): Promise<ActionResult> {
  const access = await requireTaskManageAccess();
  const { context, service } = access;
  const tenant = context.organization;
  const user = context.user;

  const taskId = String(formData.get("task_id") ?? "");
  const title = cleanStr(formData.get("title"), 200);
  if (!taskId) return { ok: false, error: "Taak ontbreekt." };
  if (!title) return { ok: false, error: "Titel is verplicht." };
  const target = await requireExistingTaskManage(access, taskId);
  if (!target.ok) return target;

  const branchId = formData.has("branch_id")
    ? resolveSubmittedBranchId(access, parseBranchId(formData.get("branch_id")))
    : target.branchId;
  const branchCheck = validateTargetBranch(access, branchId);
  if (!branchCheck.ok) return branchCheck;
  const boardBranchCheck = validateTaskBoardBranch(
    target.boardBranchId,
    branchId,
  );
  if (!boardBranchCheck.ok) return boardBranchCheck;

  const { error } = await service.rpc("update_task", {
    p_task_id: taskId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_title: title,
    p_description: cleanStr(formData.get("description"), 4000),
    p_priority: priorityOf(formData.get("priority")),
    p_due_date: cleanStr(formData.get("due_date"), 10),
    p_department_id: null,
  });
  if (error) return { ok: false, error: error.message };

  const branchAssign = await assignTaskBranch(access, taskId, branchId);
  if (!branchAssign.ok) return branchAssign;

  // Assignment is a separate RPC; always sync it (null clears the assignee).
  const assignee = cleanStr(formData.get("assignee_user_id"), 100);
  const { error: assignErr } = await service.rpc("assign_task", {
    p_task_id: taskId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_assignee_user_id: assignee,
  });
  if (assignErr) return { ok: false, error: assignErr.message };

  await notifyAssignee(service, tenant.id, taskId, assignee);

  revalidatePath("/backoffice/taken");
  revalidatePath("/instructor/taken");
  return { ok: true };
}

export async function moveTask(input: {
  taskId: string;
  columnId: string;
  position: number;
}): Promise<ActionResult> {
  const access = await requireTaskManageAccess();
  const { context, service } = access;
  if (!input.taskId || !input.columnId) {
    return { ok: false, error: "Ongeldige verplaatsing." };
  }
  const target = await requireExistingTaskManage(access, input.taskId);
  if (!target.ok) return target;
  const column = await requireTaskColumnAccess(access, input.columnId);
  if (!column.ok) return column;
  if (column.boardId !== target.boardId) {
    return {
      ok: false,
      error: "Taak kan niet naar een ander bord worden verplaatst.",
    };
  }

  const { error } = await service.rpc("move_task", {
    p_task_id: input.taskId,
    p_tenant_id: context.organization.id,
    p_actor: context.user.id,
    p_column_id: input.columnId,
    p_position: Math.max(0, Math.trunc(input.position)),
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/taken");
  revalidatePath("/instructor/taken");
  return { ok: true };
}

export async function archiveTask(formData: FormData): Promise<ActionResult> {
  const access = await requireTaskManageAccess();
  const { context, service } = access;
  const taskId = String(formData.get("task_id") ?? "");
  if (!taskId) return { ok: false, error: "Taak ontbreekt." };
  const target = await requireExistingTaskManage(access, taskId);
  if (!target.ok) return target;

  const { error } = await service.rpc("archive_task", {
    p_task_id: taskId,
    p_tenant_id: context.organization.id,
    p_actor: context.user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/taken");
  revalidatePath("/instructor/taken");
  return { ok: true };
}
