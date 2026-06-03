import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LEAD_STATUS_RANK,
  LEAD_TERMINAL_STATUSES,
  type LeadActionStatus,
  type LeadStatus,
} from "@/lib/leads/types";
import type { TaskPriority, TaskType } from "@/lib/tasks/types";
import { scoreLead, type LeadScoreInput } from "@/lib/leads/lead-score";
import { loadLeadScorePolicy } from "@/lib/leads/lead-score-policy";

// ---------------------------------------------------------------------------
// Slimme Opvolging — the lead automation engine (Task #54).
//
// `runLeadAutomationRules` is the single entry point. It is:
//   * Idempotent — running it repeatedly converges to the same lead state and
//     never creates duplicate tasks (DB dedupe_key + ensure_lead_task guard).
//   * Forward-only — derived status only ever advances along the funnel and
//     never touches preserved states. Preserved = terminal (converted/dropped)
//     and the manual parking state `follow_up`: for these, automation leaves the
//     status, action_status and next_action_at exactly as a human set them and
//     only refreshes the (advisory) score. A due `follow_up` simply resurfaces
//     in "Vandaag" via its past next_action_at — it is never silently reopened.
//   * Service-role only — every mutation goes through the SECURITY DEFINER RPCs;
//     this module is never imported by a client component.
//
// It can be driven by a user action (pass the acting user as `actor`) or by the
// cron sweep (pass `actor: null` for a system run).
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

type TrialRow = {
  status: string;
  starts_at: string;
};

type IntakeRow = {
  theory_status: string | null;
  cbr_authorization_status: string | null;
  health_declaration_status: string | null;
  desired_start_date: string | null;
  lessons_per_week: number | null;
};

type LeadRow = {
  id: string;
  tenant_id: string;
  status: LeadStatus;
  source: string;
  email: string | null;
  phone: string | null;
  full_name: string;
};

/** What the automation wants a given status to look like operationally. */
type StatusPlan = {
  actionStatus: LeadActionStatus;
  priority: TaskPriority;
  taskType: TaskType | null;
  taskTitle: (name: string) => string;
  taskDescription: string;
  /** Compute the next-action moment from now + trial info. */
  nextActionAt: (ctx: { now: number; trialStartsAt: number | null }) => string | null;
  taskDueOffsetDays: number | null;
};

const STATUS_PLANS: Partial<Record<LeadStatus, StatusPlan>> = {
  new: {
    actionStatus: "awaiting_us",
    priority: "high",
    taskType: "new_lead_contact",
    taskTitle: (n) => `Bel nieuwe lead: ${n}`,
    taskDescription: "Neem binnen 24 uur contact op met deze nieuwe aanvraag.",
    nextActionAt: ({ now }) => new Date(now).toISOString(),
    taskDueOffsetDays: 0,
  },
  intake_completed: {
    actionStatus: "awaiting_us",
    priority: "high",
    taskType: "intake_review",
    taskTitle: (n) => `Beoordeel intake: ${n}`,
    taskDescription: "Bekijk de intake-antwoorden en plan een proefles in.",
    nextActionAt: ({ now }) => new Date(now).toISOString(),
    taskDueOffsetDays: 1,
  },
  trial_planned: {
    actionStatus: "awaiting_us",
    priority: "high",
    taskType: "trial_confirm",
    taskTitle: (n) => `Bevestig proefles: ${n}`,
    taskDescription: "De lead heeft een proefles-slot gekozen — bevestig de afspraak.",
    nextActionAt: ({ now, trialStartsAt }) =>
      new Date(trialStartsAt ?? now).toISOString(),
    taskDueOffsetDays: 0,
  },
  trial_confirmed: {
    actionStatus: "scheduled",
    priority: "normal",
    taskType: "trial_complete",
    taskTitle: (n) => `Proefles afronden: ${n}`,
    taskDescription: "Geef de proefles en leg daarna je beoordeling vast.",
    nextActionAt: ({ now, trialStartsAt }) =>
      new Date(trialStartsAt ?? now).toISOString(),
    taskDueOffsetDays: null,
  },
  trial_completed: {
    actionStatus: "awaiting_us",
    priority: "high",
    taskType: "assessment",
    taskTitle: (n) => `Maak beoordeling: ${n}`,
    taskDescription: "Leg de uitkomst van de proefles vast en bepaal het pakketadvies.",
    nextActionAt: ({ now }) => new Date(now).toISOString(),
    taskDueOffsetDays: 1,
  },
  assessment_pending: {
    actionStatus: "awaiting_us",
    priority: "high",
    taskType: "assessment",
    taskTitle: (n) => `Maak beoordeling: ${n}`,
    taskDescription: "Leg de uitkomst van de proefles vast en bepaal het pakketadvies.",
    nextActionAt: ({ now }) => new Date(now).toISOString(),
    taskDueOffsetDays: 1,
  },
  assessment_done: {
    actionStatus: "awaiting_us",
    priority: "high",
    taskType: "package_advice",
    taskTitle: (n) => `Stuur pakketadvies: ${n}`,
    taskDescription: "Stel een passend lespakket voor op basis van de beoordeling.",
    nextActionAt: ({ now }) => new Date(now).toISOString(),
    taskDueOffsetDays: 1,
  },
  package_advised: {
    actionStatus: "awaiting_lead",
    priority: "normal",
    taskType: "payment_followup",
    taskTitle: (n) => `Volg betaling op: ${n}`,
    taskDescription: "Het pakketadvies is verstuurd — volg de betaling/akkoord op.",
    nextActionAt: ({ now }) => new Date(now + 3 * DAY_MS).toISOString(),
    taskDueOffsetDays: 3,
  },
  payment_pending: {
    actionStatus: "awaiting_lead",
    priority: "high",
    taskType: "payment_followup",
    taskTitle: (n) => `Volg betaling op: ${n}`,
    taskDescription: "Betaling staat open — stuur een vriendelijke herinnering.",
    nextActionAt: ({ now }) => new Date(now + 2 * DAY_MS).toISOString(),
    taskDueOffsetDays: 2,
  },
  paid: {
    actionStatus: "awaiting_us",
    priority: "high",
    taskType: null,
    taskTitle: (n) => `Zet om naar leerling: ${n}`,
    taskDescription: "",
    nextActionAt: ({ now }) => new Date(now).toISOString(),
    taskDueOffsetDays: null,
  },
  contacted: {
    actionStatus: "awaiting_lead",
    priority: "normal",
    taskType: null,
    taskTitle: () => "",
    taskDescription: "",
    nextActionAt: () => null,
    taskDueOffsetDays: null,
  },
  trial_offered: {
    actionStatus: "awaiting_lead",
    priority: "normal",
    taskType: null,
    taskTitle: () => "",
    taskDescription: "",
    nextActionAt: () => null,
    taskDueOffsetDays: null,
  },
};

/**
 * Build the (pure) scoring input from a lead's observable facts. Shared by the
 * full reconcile and the policy-driven tenant recompute so the score is computed
 * identically in both. Trial flags come from the lead's status — automation has
 * already advanced it from the trial rows, so we never re-read trials here.
 */
function buildLeadScoreInput(args: {
  status: LeadStatus;
  source: string;
  email: string | null;
  phone: string | null;
  intake: IntakeRow | null;
  lastActivityMs: number | null;
  nowMs: number;
}): LeadScoreInput {
  const { status, source, email, phone, intake, lastActivityMs, nowMs } = args;
  return {
    hasPhone: !!phone,
    hasEmail: !!email,
    hasIntake: !!intake,
    theoryPassed: intake?.theory_status === "yes",
    cbrAuthorized: intake?.cbr_authorization_status === "yes",
    healthDeclared: intake?.health_declaration_status === "yes",
    daysUntilDesiredStart: intake?.desired_start_date
      ? Math.round((new Date(intake.desired_start_date).getTime() - nowMs) / DAY_MS)
      : null,
    lessonsPerWeek: intake?.lessons_per_week ?? null,
    isReferral: source === "referral",
    trialPlanned: status === "trial_planned",
    trialConfirmed: status === "trial_confirmed" || status === "trial_completed",
    trialCompleted: status === "trial_completed",
    daysSinceActivity:
      lastActivityMs !== null ? Math.round((nowMs - lastActivityMs) / DAY_MS) : null,
  };
}

/**
 * Recompute and persist `lead_score` + `lead_score_reason` for every lead in a
 * tenant under the tenant's *current* scoring policy. Used right after a tenant
 * admin edits the lead_score_policy in settings so the dashboard reflects the
 * new weights/bands immediately instead of waiting for the next activity sweep.
 *
 * Score-only: it leaves status, action_status, priority, next_action_at and
 * tasks untouched (re-passes the existing next_action_at since that RPC arg is
 * not coalesced). Idempotent and bounded by tenant_id. Returns the count of
 * leads processed.
 */
export async function recomputeLeadScoresForTenant(
  service: SupabaseClient,
  tenantId: string,
  actor: string | null,
  nowMs: number = Date.now(),
): Promise<number> {
  const policy = await loadLeadScorePolicy(service, tenantId);

  const [{ data: leadsRaw, error: leadsErr }, { data: intakeRaw }] =
    await Promise.all([
      service
        .from("leads")
        .select("id, status, source, email, phone, last_activity_at, next_action_at")
        .eq("tenant_id", tenantId),
      service
        .from("lead_intake_details")
        .select(
          "lead_id, theory_status, cbr_authorization_status, health_declaration_status, desired_start_date, lessons_per_week",
        )
        .eq("tenant_id", tenantId),
    ]);
  if (leadsErr) throw leadsErr;

  const intakeByLead = new Map<string, IntakeRow>();
  for (const row of intakeRaw ?? []) {
    intakeByLead.set((row as { lead_id: string }).lead_id, row as unknown as IntakeRow);
  }

  let updated = 0;
  for (const lead of leadsRaw ?? []) {
    const leadId = lead.id as string;
    const lastActivityMs = lead.last_activity_at
      ? new Date(lead.last_activity_at as string).getTime()
      : null;

    const scoreInput = buildLeadScoreInput({
      status: lead.status as LeadStatus,
      source: lead.source as string,
      email: (lead.email as string | null) ?? null,
      phone: (lead.phone as string | null) ?? null,
      intake: intakeByLead.get(leadId) ?? null,
      lastActivityMs,
      nowMs,
    });
    const { score, reasons } = scoreLead(scoreInput, policy);

    const { error } = await service.rpc("set_lead_automation_fields", {
      p_lead_id: leadId,
      p_tenant_id: tenantId,
      p_actor: actor,
      p_action_status: null,
      p_priority: null,
      p_lead_score: score,
      p_lead_score_reason: reasons,
      // Not coalesced by the RPC — re-pass the existing value so it is preserved.
      p_next_action_at: (lead.next_action_at as string | null) ?? null,
      p_touch_activity: false,
    });
    if (error) {
      console.error("[lead-automation] score recompute failed", { tenantId, leadId }, error);
      continue;
    }
    updated++;
  }
  return updated;
}

/**
 * Best-effort reconcile used by server actions: never let an automation failure
 * break the user-facing flow (the mutation that triggered it already succeeded).
 */
export async function reconcileLeadSafe(
  service: SupabaseClient,
  tenantId: string,
  leadId: string,
  actor: string | null,
): Promise<void> {
  try {
    await runLeadAutomationRules(service, tenantId, leadId, actor);
  } catch (e) {
    console.error("[lead-automation] reconcile failed", { tenantId, leadId }, e);
  }
}

/** Derive the funnel status implied by observable facts (intake + trials). */
function deriveFactStatus(
  intake: IntakeRow | null,
  trials: TrialRow[],
  now: number,
): { status: LeadStatus; trialStartsAt: number | null } {
  const active = trials.filter(
    (t) => t.status === "provisional" || t.status === "confirmed",
  );
  // Latest active trial wins.
  active.sort(
    (a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime(),
  );
  const latest = active[0] ?? null;
  const trialStartsAt = latest ? new Date(latest.starts_at).getTime() : null;

  if (latest) {
    const started = new Date(latest.starts_at).getTime() <= now;
    if (latest.status === "confirmed") {
      return {
        status: started ? "trial_completed" : "trial_confirmed",
        trialStartsAt,
      };
    }
    // provisional → a slot is chosen but not confirmed yet.
    return { status: "trial_planned", trialStartsAt };
  }

  if (intake) return { status: "intake_completed", trialStartsAt: null };
  return { status: "new", trialStartsAt: null };
}

function isTerminal(status: LeadStatus): boolean {
  return (LEAD_TERMINAL_STATUSES as readonly LeadStatus[]).includes(status);
}

/**
 * Preserved states are never reopened or re-derived by automation: the terminal
 * states (converted/dropped) and the manual parking state `follow_up`. For these
 * the human-set status, action_status and next_action_at are left untouched — a
 * due follow_up resurfaces purely via its (now past) next_action_at.
 */
function isPreserved(status: LeadStatus): boolean {
  return isTerminal(status) || status === "follow_up";
}

export type AutomationResult = {
  leadId: string;
  previousStatus: LeadStatus;
  newStatus: LeadStatus;
  actionStatus: LeadActionStatus;
  score: number;
  ensuredTaskType: TaskType | null;
  completedStaleTasks: number;
};

/**
 * Reconcile a single lead: sync intake fields, recompute derived status (forward
 * only), action status, priority, score + next action, and ensure exactly one
 * open auto-task matches the current step (archiving stale auto-tasks).
 */
export async function runLeadAutomationRules(
  service: SupabaseClient,
  tenantId: string,
  leadId: string,
  actor: string | null,
  nowMs: number = Date.now(),
): Promise<AutomationResult> {
  // 1. Pull current lead state.
  const { data: leadRaw, error: leadErr } = await service
    .from("leads")
    .select("id, tenant_id, status, source, email, phone, full_name")
    .eq("id", leadId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (leadErr) throw leadErr;
  if (!leadRaw) throw new Error(`lead ${leadId} not found in tenant ${tenantId}`);
  const lead = leadRaw as LeadRow;
  const previousStatus = lead.status;

  // 2. Sync the structured intake answers onto the denormalised columns.
  await service.rpc("sync_lead_from_intake", {
    p_lead_id: leadId,
    p_tenant_id: tenantId,
  });

  // 3. Load intake + trials for derivation + scoring.
  const [{ data: intakeRaw }, { data: trialsRaw }] = await Promise.all([
    service
      .from("lead_intake_details")
      .select(
        "theory_status, cbr_authorization_status, health_declaration_status, desired_start_date, lessons_per_week",
      )
      .eq("lead_id", leadId)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    service
      .from("trial_lessons")
      .select("status, starts_at")
      .eq("lead_id", leadId)
      .eq("tenant_id", tenantId),
  ]);
  const intake = (intakeRaw as IntakeRow | null) ?? null;
  const trials = (trialsRaw as TrialRow[] | null) ?? [];

  // Tenant-configurable scoring policy (platform defaults + tenant override).
  const scorePolicy = await loadLeadScorePolicy(service, tenantId);

  // 4. Forward-only status derivation. Never override preserved states:
  // terminal (converted/dropped) or the manual parking state `follow_up`.
  const { status: factStatus, trialStartsAt } = deriveFactStatus(
    intake,
    trials,
    nowMs,
  );
  const preserveState = isPreserved(previousStatus);
  let newStatus = previousStatus;
  if (
    !preserveState &&
    LEAD_STATUS_RANK[factStatus] > LEAD_STATUS_RANK[previousStatus]
  ) {
    newStatus = factStatus;
  }

  if (newStatus !== previousStatus) {
    const { error } = await service.rpc("update_lead_status", {
      p_lead_id: leadId,
      p_tenant_id: tenantId,
      p_actor: actor,
      p_to: newStatus,
    });
    if (error) throw error;

    // Task #113 — reviewverzoek na de proefles: vuur exact bij de overgang naar
    // trial_completed. Best-effort en idempotent per lead (dedupe key); een
    // mislukte mail mag de reconcile nooit breken.
    if (newStatus === "trial_completed") {
      try {
        const { notifyLeadReviewRequest } = await import(
          "@/lib/notifications/dispatch"
        );
        await notifyLeadReviewRequest(service, tenantId, leadId);
      } catch (e) {
        console.error("[lead-automation] after_trial review failed", {
          tenantId,
          leadId,
          e,
        });
      }
    }
  }

  // 5. Score the lead (pure).
  const { data: refreshed } = await service
    .from("leads")
    .select("last_activity_at, next_action_at, action_status")
    .eq("id", leadId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const lastActivity = refreshed?.last_activity_at
    ? new Date(refreshed.last_activity_at as string).getTime()
    : null;

  const scoreInput = buildLeadScoreInput({
    status: newStatus,
    source: lead.source,
    email: lead.email,
    phone: lead.phone,
    intake,
    lastActivityMs: lastActivity,
    nowMs,
  });
  const { score, reasons } = scoreLead(scoreInput, scorePolicy);

  // 6. Resolve the operational plan for the current status.
  //
  // Preserved states (terminal + manual `follow_up`) have no STATUS_PLAN: for
  // them we pass NULL action_status/priority so the RPC's COALESCE keeps the
  // human-set values, and we re-pass the existing next_action_at unchanged so a
  // parked/closed lead is never silently reopened. We still refresh the score.
  const plan = STATUS_PLANS[newStatus];
  const managed = !!plan;
  const existingActionStatus =
    (refreshed?.action_status as LeadActionStatus | null) ?? "none";
  const existingNextActionAt = (refreshed?.next_action_at as string | null) ?? null;

  const actionStatus: LeadActionStatus | null = managed ? plan!.actionStatus : null;
  const priority: TaskPriority | null = managed ? plan!.priority : null;
  const nextActionAt = managed
    ? plan!.nextActionAt({ now: nowMs, trialStartsAt })
    : existingNextActionAt;
  const effectiveActionStatus: LeadActionStatus = managed
    ? plan!.actionStatus
    : existingActionStatus;

  await service.rpc("set_lead_automation_fields", {
    p_lead_id: leadId,
    p_tenant_id: tenantId,
    p_actor: actor,
    p_action_status: actionStatus,
    p_priority: priority,
    p_lead_score: score,
    p_lead_score_reason: reasons,
    p_next_action_at: nextActionAt,
    p_touch_activity: false,
  });

  // 7. Reconcile auto-tasks: ensure the expected one, archive stale ones.
  const expectedType = plan?.taskType ?? null;
  let ensuredTaskType: TaskType | null = null;

  if (expectedType && plan) {
    const dueDate =
      plan.taskDueOffsetDays !== null
        ? new Date(nowMs + plan.taskDueOffsetDays * DAY_MS)
            .toISOString()
            .slice(0, 10)
        : trialStartsAt
          ? new Date(trialStartsAt).toISOString().slice(0, 10)
          : null;
    const { error } = await service.rpc("ensure_lead_task", {
      p_tenant_id: tenantId,
      p_actor: actor,
      p_lead_id: leadId,
      p_task_type: expectedType,
      p_dedupe_key: `lead:${leadId}:${expectedType}`,
      p_title: plan.taskTitle(lead.full_name),
      p_description: plan.taskDescription,
      p_priority: plan.priority,
      p_due_date: dueDate,
    });
    if (error) throw error;
    ensuredTaskType = expectedType;
  }

  const completedStaleTasks = await completeStaleAutoTasks(
    service,
    tenantId,
    leadId,
    actor,
    expectedType,
  );

  return {
    leadId,
    previousStatus,
    newStatus,
    actionStatus: effectiveActionStatus,
    score,
    ensuredTaskType,
    completedStaleTasks,
  };
}

/**
 * Archive open auto-tasks (task_type != 'manual') linked to this lead whose type
 * is no longer the expected one for the current step. Manual tasks are never
 * touched.
 */
async function completeStaleAutoTasks(
  service: SupabaseClient,
  tenantId: string,
  leadId: string,
  actor: string | null,
  keepType: TaskType | null,
): Promise<number> {
  const { data: links } = await service
    .from("task_links")
    .select("task_id")
    .eq("tenant_id", tenantId)
    .eq("entity_type", "lead")
    .eq("entity_id", leadId);
  const taskIds = (links ?? []).map((l) => l.task_id as string);
  if (taskIds.length === 0) return 0;

  const { data: tasks } = await service
    .from("tasks")
    .select("id, task_type")
    .eq("tenant_id", tenantId)
    .in("id", taskIds)
    .is("archived_at", null)
    .neq("task_type", "manual");

  let completed = 0;
  for (const t of tasks ?? []) {
    if ((t.task_type as TaskType) === keepType) continue;
    const { error } = await service.rpc("complete_lead_task", {
      p_task_id: t.id as string,
      p_tenant_id: tenantId,
      p_actor: actor,
    });
    if (!error) completed++;
  }
  return completed;
}
