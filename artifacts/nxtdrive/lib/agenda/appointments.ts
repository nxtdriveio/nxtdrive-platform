// ---------------------------------------------------------------------------
// Agenda integration for generic appointments (examens, TTT, theoriebegeleiding
// en tijd-bezettende blokken).
//
// Planned appointments occupy a slot on every agenda view alongside lessons and
// trial lessons, so nothing can be double-booked over them. This loader fetches
// the planned rows for a time window — RLS-scoped to the caller's tenant — and
// enriches the student-linked types with the student's name for the card label.
// ---------------------------------------------------------------------------

import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AgendaAppointment } from "@/lib/agenda/types";

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

// An appointment as shown on the agenda, with the student name resolved when
// the type links to one (examen/TTT/theoriebegeleiding).
export type AgendaAppointmentView = AgendaAppointment & {
  student_name: string | null;
};

export async function loadAgendaAppointments(
  supabase: ServerSupabase,
  opts: {
    tenantId: string;
    from: Date;
    to: Date;
    // When set, restrict to a single instructor (instructor PWA, non-admin).
    instructorId?: string;
  },
): Promise<AgendaAppointmentView[]> {
  let query = supabase
    .from("agenda_appointments")
    .select("*")
    .eq("tenant_id", opts.tenantId)
    .eq("status", "planned")
    .gte("starts_at", opts.from.toISOString())
    .lt("starts_at", opts.to.toISOString())
    .order("starts_at", { ascending: true });
  if (opts.instructorId) {
    query = query.eq("instructor_id", opts.instructorId);
  }
  const { data: rowsRaw } = await query;
  const rows = (rowsRaw ?? []) as AgendaAppointment[];
  if (rows.length === 0) return [];

  // Resolve student names (RLS-scoped) for the student-linked types.
  const studentIds = Array.from(
    new Set(rows.map((r) => r.student_id).filter((id): id is string => !!id)),
  );
  const studentNames = new Map<string, string>();
  if (studentIds.length > 0) {
    const { data: studentsRaw } = await supabase
      .from("students")
      .select("id, full_name")
      .in("id", studentIds);
    for (const s of (studentsRaw ?? []) as {
      id: string;
      full_name: string | null;
    }[]) {
      studentNames.set(s.id, s.full_name ?? "Leerling");
    }
  }

  return rows.map((r) => ({
    ...r,
    student_name: r.student_id
      ? (studentNames.get(r.student_id) ?? "Leerling")
      : null,
  }));
}
