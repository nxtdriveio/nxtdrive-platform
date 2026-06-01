import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResolvedTaskLink, TaskLinkRow, TaskLinkType } from "./types";

const linkDateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Deep-link target for a linked entity. Instructors have no backoffice detail
 * page, so they render as a plain name (null href).
 */
export function taskLinkHref(
  type: TaskLinkType,
  entityId: string,
): string | null {
  switch (type) {
    case "student":
    case "exam":
      return `/backoffice/leerlingen/${entityId}`;
    case "invoice":
      return `/backoffice/facturen/${entityId}`;
    case "lesson":
      return `/backoffice/agenda/${entityId}`;
    case "lead":
      return `/backoffice/leads/${entityId}`;
    case "instructor":
      return null;
  }
}

function invoiceLabel(no: number | null | undefined): string {
  return no == null ? "Factuur" : `Factuur #${String(no).padStart(4, "0")}`;
}

/**
 * Resolves polymorphic task links to display labels + deep-link hrefs, batching
 * a query per entity type. Uses the SERVICE ROLE client — the caller must have
 * already validated tenant access.
 */
export async function resolveTaskLinks(
  service: SupabaseClient,
  tenantId: string,
  rows: TaskLinkRow[],
): Promise<ResolvedTaskLink[]> {
  if (rows.length === 0) return [];

  const idsByType = (types: TaskLinkType[]): string[] =>
    Array.from(
      new Set(
        rows
          .filter((r) => types.includes(r.entity_type))
          .map((r) => r.entity_id),
      ),
    );

  const studentIds = idsByType(["student", "exam"]);
  const invoiceIds = idsByType(["invoice"]);
  const lessonIds = idsByType(["lesson"]);
  const leadIds = idsByType(["lead"]);
  const instructorIds = idsByType(["instructor"]);

  // Lessons first: their student_ids feed into the student name lookup.
  const lessonRows = lessonIds.length
    ? (
        await service
          .from("lessons")
          .select("id, starts_at, student_id")
          .eq("tenant_id", tenantId)
          .in("id", lessonIds)
      ).data ?? []
    : [];
  const lessons = lessonRows as {
    id: string;
    starts_at: string;
    student_id: string | null;
  }[];

  const lessonStudentIds = lessons
    .map((l) => l.student_id)
    .filter((v): v is string => Boolean(v));
  const studentLookupIds = Array.from(
    new Set([...studentIds, ...lessonStudentIds]),
  );

  const [studentsRes, invoicesRes, leadsRes, instructorsRes] =
    await Promise.all([
      studentLookupIds.length
        ? service
            .from("students")
            .select("id, full_name")
            .eq("tenant_id", tenantId)
            .in("id", studentLookupIds)
        : Promise.resolve({ data: [] }),
      invoiceIds.length
        ? service
            .from("invoices")
            .select("id, invoice_no")
            .eq("tenant_id", tenantId)
            .in("id", invoiceIds)
        : Promise.resolve({ data: [] }),
      leadIds.length
        ? service
            .from("leads")
            .select("id, full_name")
            .eq("tenant_id", tenantId)
            .in("id", leadIds)
        : Promise.resolve({ data: [] }),
      instructorIds.length
        ? service
            .from("profiles")
            .select("id, full_name")
            .in("id", instructorIds)
        : Promise.resolve({ data: [] }),
    ]);

  const studentMap = new Map(
    ((studentsRes.data ?? []) as { id: string; full_name: string | null }[]).map(
      (s) => [s.id, s.full_name ?? "Naamloze leerling"],
    ),
  );
  const invoiceMap = new Map(
    ((invoicesRes.data ?? []) as { id: string; invoice_no: number }[]).map(
      (i) => [i.id, i.invoice_no],
    ),
  );
  const leadMap = new Map(
    ((leadsRes.data ?? []) as { id: string; full_name: string | null }[]).map(
      (l) => [l.id, l.full_name ?? "Naamloze lead"],
    ),
  );
  const instructorMap = new Map(
    (
      (instructorsRes.data ?? []) as { id: string; full_name: string | null }[]
    ).map((p) => [p.id, p.full_name ?? "Instructeur"]),
  );
  const lessonMap = new Map(lessons.map((l) => [l.id, l]));

  return rows.map((r) => {
    let label: string;
    switch (r.entity_type) {
      case "student":
        label = studentMap.get(r.entity_id) ?? "Onbekende leerling";
        break;
      case "exam":
        label = `Examen — ${studentMap.get(r.entity_id) ?? "onbekende leerling"}`;
        break;
      case "invoice":
        label = invoiceLabel(invoiceMap.get(r.entity_id));
        break;
      case "lead":
        label = leadMap.get(r.entity_id) ?? "Onbekende lead";
        break;
      case "instructor":
        label = instructorMap.get(r.entity_id) ?? "Onbekende instructeur";
        break;
      case "lesson": {
        const lesson = lessonMap.get(r.entity_id);
        if (lesson) {
          const studentName = lesson.student_id
            ? (studentMap.get(lesson.student_id) ?? "Leerling")
            : "Leerling";
          label = `${linkDateFmt.format(new Date(lesson.starts_at))} — ${studentName}`;
        } else {
          label = "Onbekende les";
        }
        break;
      }
      default:
        label = "Onbekend";
    }
    return {
      id: r.id,
      task_id: r.task_id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      label,
      href: taskLinkHref(r.entity_type, r.entity_id),
    };
  });
}
