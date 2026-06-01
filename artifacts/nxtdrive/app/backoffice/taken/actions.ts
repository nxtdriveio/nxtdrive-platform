"use server";

import { revalidatePath } from "next/cache";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  TASK_LINK_TYPES,
  TASK_PRIORITIES,
  type EntitySearchResult,
  type TaskLinkType,
  type TaskPriority,
} from "@/lib/tasks/types";

const ROLES = ["tenant_admin", "instructor"] as const;

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

export type ActionResult = { ok: boolean; error?: string };

export async function createTask(formData: FormData): Promise<ActionResult> {
  const { user, tenant } = await requireActiveTenant([...ROLES]);

  const boardId = String(formData.get("board_id") ?? "");
  const columnId = String(formData.get("column_id") ?? "");
  const title = cleanStr(formData.get("title"), 200);
  if (!boardId || !columnId) return { ok: false, error: "Bord of kolom ontbreekt." };
  if (!title) return { ok: false, error: "Titel is verplicht." };

  const assignee = cleanStr(formData.get("assignee_user_id"), 100);

  const service = createServiceRoleClient();
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
      // leave an orphan task behind — archive it so the board stays consistent.
      await service.rpc("archive_task", {
        p_task_id: newTaskId,
        p_tenant_id: tenant.id,
        p_actor: user.id,
      });
      return { ok: false, error: linkErr.message };
    }
  }

  revalidatePath("/backoffice/taken");
  return { ok: true };
}

export async function linkTaskEntity(input: {
  taskId: string;
  entityType: TaskLinkType;
  entityId: string;
}): Promise<{ ok: boolean; linkId?: string; error?: string }> {
  const { user, tenant } = await requireActiveTenant([...ROLES]);
  if (!input.taskId || !input.entityId) {
    return { ok: false, error: "Ongeldige koppeling." };
  }
  if (!(TASK_LINK_TYPES as readonly string[]).includes(input.entityType)) {
    return { ok: false, error: "Onbekend entiteitstype." };
  }

  const service = createServiceRoleClient();
  const { data: linkId, error } = await service.rpc("link_task_entity", {
    p_task_id: input.taskId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/taken");
  return { ok: true, linkId: (linkId as string) ?? undefined };
}

export async function unlinkTaskEntity(input: {
  linkId: string;
}): Promise<ActionResult> {
  const { user, tenant } = await requireActiveTenant([...ROLES]);
  if (!input.linkId) return { ok: false, error: "Koppeling ontbreekt." };

  const service = createServiceRoleClient();
  const { error } = await service.rpc("unlink_task_entity", {
    p_link_id: input.linkId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/taken");
  return { ok: true };
}

/**
 * Searches candidate entities of a given type within the active tenant, for the
 * card link picker. Tenant-scoped via service role after role validation.
 */
export async function searchLinkEntities(
  entityType: TaskLinkType,
  query: string,
): Promise<{ ok: boolean; results: EntitySearchResult[]; error?: string }> {
  const { tenant } = await requireActiveTenant([...ROLES]);
  if (!(TASK_LINK_TYPES as readonly string[]).includes(entityType)) {
    return { ok: false, results: [], error: "Onbekend entiteitstype." };
  }

  const q = query.trim();
  const service = createServiceRoleClient();
  const limit = 15;

  try {
    if (entityType === "student" || entityType === "exam") {
      let sb = service
        .from("students")
        .select("id, full_name")
        .eq("tenant_id", tenant.id);
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
      let sb = service
        .from("invoices")
        .select("id, invoice_no, student_id")
        .eq("tenant_id", tenant.id);
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
            r.student_id ? ` — ${nameMap.get(r.student_id) ?? ""}` : ""
          }`,
        })),
      };
    }

    if (entityType === "lesson") {
      const { data } = await service
        .from("lessons")
        .select("id, starts_at, student_id")
        .eq("tenant_id", tenant.id)
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
        label: `${fmt.format(new Date(r.starts_at))} — ${
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
  const { user, tenant } = await requireActiveTenant([...ROLES]);

  const taskId = String(formData.get("task_id") ?? "");
  const title = cleanStr(formData.get("title"), 200);
  if (!taskId) return { ok: false, error: "Taak ontbreekt." };
  if (!title) return { ok: false, error: "Titel is verplicht." };

  const service = createServiceRoleClient();
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

  // Assignment is a separate RPC; always sync it (null clears the assignee).
  const assignee = cleanStr(formData.get("assignee_user_id"), 100);
  const { error: assignErr } = await service.rpc("assign_task", {
    p_task_id: taskId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_assignee_user_id: assignee,
  });
  if (assignErr) return { ok: false, error: assignErr.message };

  revalidatePath("/backoffice/taken");
  return { ok: true };
}

export async function moveTask(input: {
  taskId: string;
  columnId: string;
  position: number;
}): Promise<ActionResult> {
  const { user, tenant } = await requireActiveTenant([...ROLES]);
  if (!input.taskId || !input.columnId) {
    return { ok: false, error: "Ongeldige verplaatsing." };
  }

  const service = createServiceRoleClient();
  const { error } = await service.rpc("move_task", {
    p_task_id: input.taskId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
    p_column_id: input.columnId,
    p_position: Math.max(0, Math.trunc(input.position)),
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/taken");
  return { ok: true };
}

export async function archiveTask(formData: FormData): Promise<ActionResult> {
  const { user, tenant } = await requireActiveTenant([...ROLES]);
  const taskId = String(formData.get("task_id") ?? "");
  if (!taskId) return { ok: false, error: "Taak ontbreekt." };

  const service = createServiceRoleClient();
  const { error } = await service.rpc("archive_task", {
    p_task_id: taskId,
    p_tenant_id: tenant.id,
    p_actor: user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/backoffice/taken");
  return { ok: true };
}
