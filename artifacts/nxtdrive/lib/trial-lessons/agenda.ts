// ---------------------------------------------------------------------------
// Agenda integration for trial lessons (proeflessen).
//
// Active trial lessons (provisional + confirmed) must appear on the agenda
// views alongside regular lessons so an instructor cannot double-book over a
// provisional/confirmed proefles. This loader fetches those rows for a time
// window — RLS-scoped to the caller's tenant — and enriches them with the
// lead's name so the agenda card can link back to the lead detail.
// ---------------------------------------------------------------------------

import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { TrialLesson } from "@/lib/trial-lessons/types";

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

// A trial lesson as shown on the agenda, with the lead name resolved.
export type AgendaTrialLesson = TrialLesson & { lead_name: string };

// Only provisional and confirmed trials occupy a slot on the agenda.
const AGENDA_STATUSES = ["provisional", "confirmed"] as const;

export async function loadAgendaTrialLessons(
  supabase: ServerSupabase,
  opts: {
    tenantId: string;
    from: Date;
    to: Date;
    // When set, restrict to a single instructor (instructor PWA, non-admin).
    instructorId?: string;
    // When set, restrict to a single branch (vestiging).
    branchId?: string;
    // When set, restrict to a pre-expanded organization branch scope.
    branchIds?: readonly string[];
  },
): Promise<AgendaTrialLesson[]> {
  if (opts.branchIds && opts.branchIds.length === 0) return [];

  let query = supabase
    .from("trial_lessons")
    .select("*")
    .eq("tenant_id", opts.tenantId)
    .in("status", AGENDA_STATUSES as unknown as string[])
    .lt("starts_at", opts.to.toISOString())
    .gt("ends_at", opts.from.toISOString())
    .order("starts_at", { ascending: true });
  if (opts.instructorId) {
    query = query.eq("instructor_id", opts.instructorId);
  }
  if (opts.branchId) {
    query = query.eq("branch_id", opts.branchId);
  } else if (opts.branchIds) {
    query = query.in("branch_id", [...opts.branchIds]);
  }
  const { data: trialsRaw } = await query;
  const trials = (trialsRaw ?? []) as TrialLesson[];
  if (trials.length === 0) return [];

  // Resolve lead names (RLS-scoped to this tenant) for the agenda card label.
  const leadIds = Array.from(new Set(trials.map((t) => t.lead_id)));
  const { data: leadsRaw } = await supabase
    .from("leads")
    .select("id, full_name")
    .in("id", leadIds);
  const leadNames = new Map(
    ((leadsRaw ?? []) as { id: string; full_name: string | null }[]).map(
      (l) => [l.id, l.full_name ?? "Lead"],
    ),
  );

  return trials.map((t) => ({
    ...t,
    lead_name: leadNames.get(t.lead_id) ?? "Lead",
  }));
}
