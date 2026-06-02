/**
 * Lead follow-up sweep (cron-invoked) — Slimme Opvolging.
 *
 * An external scheduler POSTs here on an interval with the shared
 * `x-cron-secret` header. For every tenant it:
 *   1. Reconciles every lead whose `next_action_at` is now due (recomputes
 *      status/score/action + ensures the right open auto-task). Idempotent.
 *   2. Assessment-overdue: a lead parked in `assessment_pending` for more than
 *      4h gets a high-priority assessment reminder task. Fires once.
 *   3. Re-engagement cadence: leads waiting on the prospect get nudges at 2, 7
 *      and 14 days of inactivity. Each stage fires exactly once.
 *
 * Idempotency: every queued task uses a stable dedupe_key. Before acting on a
 * stage we check whether its task already exists, so the action flip + the
 * lead_event are emitted once per stage, never re-emitted on later sweeps.
 *
 * Server-side only: service role + shared secret. Fails closed (503) when no
 * secret is configured.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { reconcileLeadSafe } from "@/lib/leads/automation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Re-engagement cadence: nudge after N days of inactivity, once per stage. */
const REENGAGE_STAGES = [
  { stage: "d14", days: 14 },
  { stage: "d7", days: 7 },
  { stage: "d2", days: 2 },
] as const;

/** A lead sitting in assessment_pending longer than this is overdue. */
const ASSESSMENT_OVERDUE_HOURS = 4;

const OPEN_STATUSES = [
  "new",
  "contacted",
  "intake_completed",
  "trial_offered",
  "trial_planned",
  "trial_confirmed",
  "trial_completed",
  "assessment_pending",
  "assessment_done",
  "package_advised",
  "payment_pending",
  "paid",
  "follow_up",
];

export async function POST(request: NextRequest) {
  const secret = process.env["CRON_SECRET"];
  if (!secret) {
    return new NextResponse("cron not configured", { status: 503 });
  }
  const provided = request.headers.get("x-cron-secret");
  if (!provided || provided !== secret) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const service = createServiceRoleClient();
  const { data: tenants, error: tenantsErr } = await service
    .from("tenants")
    .select("id");
  if (tenantsErr) {
    console.error("[lead-followups] failed to list tenants", tenantsErr);
    return new NextResponse("error", { status: 500 });
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const today = nowIso.slice(0, 10);

  /** True when an open (non-archived) task with this dedupe key already exists. */
  async function taskExists(tenantId: string, dedupeKey: string): Promise<boolean> {
    const { data, error } = await service
      .from("tasks")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("dedupe_key", dedupeKey)
      .is("archived_at", null)
      .limit(1);
    if (error) {
      console.error("[lead-followups] task lookup failed", dedupeKey, error);
      return true; // fail safe: treat as existing so we don't double-fire
    }
    return (data ?? []).length > 0;
  }

  let reconciled = 0;
  let assessmentOverdue = 0;
  let reengaged = 0;

  for (const tenant of tenants ?? []) {
    const tenantId = tenant.id as string;

    // 1. Due follow-ups: reconcile each (system actor).
    const { data: due } = await service
      .from("leads")
      .select("id")
      .eq("tenant_id", tenantId)
      .in("status", OPEN_STATUSES)
      .not("next_action_at", "is", null)
      .lte("next_action_at", nowIso);

    for (const lead of due ?? []) {
      await reconcileLeadSafe(service, tenantId, lead.id as string, null);
      reconciled++;
    }

    // 2. Assessment-overdue: parked in assessment_pending > 4h.
    const assessmentBefore = new Date(now - ASSESSMENT_OVERDUE_HOURS * HOUR_MS).toISOString();
    const { data: stuck } = await service
      .from("leads")
      .select("id, full_name")
      .eq("tenant_id", tenantId)
      .eq("status", "assessment_pending")
      .lte("last_activity_at", assessmentBefore);

    for (const lead of stuck ?? []) {
      const leadId = lead.id as string;
      const name = (lead.full_name as string) ?? "lead";
      const dedupeKey = `lead:${leadId}:assessment-overdue`;
      if (await taskExists(tenantId, dedupeKey)) continue;

      const { error: taskErr } = await service.rpc("ensure_lead_task", {
        p_tenant_id: tenantId,
        p_actor: null,
        p_lead_id: leadId,
        p_task_type: "assessment",
        p_dedupe_key: dedupeKey,
        p_title: `Beoordeling openstaand: ${name}`,
        p_description:
          "De beoordeling staat al langer dan 4 uur open. Rond de niveaubepaling af zodat je een pakketadvies kunt geven.",
        p_priority: "high",
        p_due_date: today,
      });
      if (taskErr) {
        console.error("[lead-followups] assessment task failed", leadId, taskErr);
        continue;
      }
      const { error: fieldsErr } = await service.rpc("set_lead_automation_fields", {
        p_lead_id: leadId,
        p_tenant_id: tenantId,
        p_actor: null,
        p_action_status: "awaiting_us",
        p_priority: "high",
        p_lead_score: null,
        p_lead_score_reason: null,
        p_next_action_at: nowIso,
        p_touch_activity: false,
      });
      if (fieldsErr) {
        console.error("[lead-followups] assessment fields failed", leadId, fieldsErr);
        continue;
      }
      await service.from("lead_events").insert({
        lead_id: leadId,
        tenant_id: tenantId,
        actor_user_id: null,
        event_type: "assessment_due",
        payload: { hours: ASSESSMENT_OVERDUE_HOURS },
        metadata: { dedupe_key: dedupeKey },
      });
      assessmentOverdue++;
    }

    // 3. Re-engagement cadence (2 / 7 / 14 days), once per stage.
    const { data: waiting } = await service
      .from("leads")
      .select("id, full_name, last_activity_at")
      .eq("tenant_id", tenantId)
      .eq("action_status", "awaiting_lead")
      .in("status", OPEN_STATUSES);

    for (const lead of waiting ?? []) {
      const leadId = lead.id as string;
      const name = (lead.full_name as string) ?? "lead";
      const lastActivity = lead.last_activity_at
        ? new Date(lead.last_activity_at as string).getTime()
        : now;
      const idleDays = Math.floor((now - lastActivity) / DAY_MS);

      const stage = REENGAGE_STAGES.find((s) => idleDays >= s.days);
      if (!stage) continue;

      const dedupeKey = `lead:${leadId}:reengage:${stage.stage}`;
      if (await taskExists(tenantId, dedupeKey)) continue;

      const { error: taskErr } = await service.rpc("ensure_lead_task", {
        p_tenant_id: tenantId,
        p_actor: null,
        p_lead_id: leadId,
        p_task_type: "reengage",
        p_dedupe_key: dedupeKey,
        p_title: `Heractiveer lead (${stage.days} dgn stil): ${name}`,
        p_description:
          "Deze lead heeft al een tijd niets van zich laten horen — neem opnieuw contact op.",
        p_priority: stage.days >= 14 ? "high" : "normal",
        p_due_date: today,
      });
      if (taskErr) {
        console.error("[lead-followups] reengage task failed", leadId, taskErr);
        continue;
      }
      const { error: fieldsErr } = await service.rpc("set_lead_automation_fields", {
        p_lead_id: leadId,
        p_tenant_id: tenantId,
        p_actor: null,
        p_action_status: "awaiting_us",
        p_priority: stage.days >= 14 ? "high" : "normal",
        p_lead_score: null,
        p_lead_score_reason: null,
        p_next_action_at: nowIso,
        p_touch_activity: false,
      });
      if (fieldsErr) {
        console.error("[lead-followups] reengage fields failed", leadId, fieldsErr);
        continue;
      }
      await service.from("lead_events").insert({
        lead_id: leadId,
        tenant_id: tenantId,
        actor_user_id: null,
        event_type: "reengaged",
        payload: { reason: "stale", days: stage.days, idle_days: idleDays },
        metadata: { dedupe_key: dedupeKey },
      });
      reengaged++;
    }
  }

  return NextResponse.json({ ok: true, reconciled, assessmentOverdue, reengaged });
}
