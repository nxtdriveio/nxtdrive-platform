/**
 * RLS + automation/idempotency tests for Task #54 — Lead Dashboard +
 * Taken + Slimme Opvolging.
 *
 *   pnpm --filter @workspace/scripts run db:test-rls-lead-dashboard
 *   pnpm --filter @workspace/scripts run db:test-rls-lead-dashboard -- --env=production
 *
 * Asserts:
 *   1. anon cannot read leads / lead_events.
 *   2. create_lead_manual creates a lead + 'created' event + 'lead.created' audit.
 *   3. create_lead_manual rejects a missing name and a missing contact.
 *   4. ensure_lead_task is idempotent: same dedupe_key returns the same task id,
 *      exactly one open task exists (automation never duplicates work).
 *   5. complete_lead_task archives the task, writes task_completed event +
 *      task.completed audit, and is idempotent (second call is a no-op).
 *   6. set_lead_automation_fields persists score + writes score_updated event
 *      only when the score actually changes.
 *   7. schedule_lead_follow_up sets follow_up/scheduled + next_action_at + event.
 *   8. mark_lead_lost sets dropped/closed + lost_at + 'lost' event + audit.
 *   9. cross-tenant actor is rejected by the mutation RPCs.
 *  10. cross-tenant isolation: a member of tenant Y cannot read tenant X's lead.
 *  11. anon CANNOT call any of the new mutation RPCs (execute revoked).
 */
import { createClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running Lead Dashboard RLS/automation tests`);

  const url = process.env["SUPABASE_URL"];
  const anon = process.env["SUPABASE_ANON_KEY"];
  const service = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !anon || !service) {
    throw new Error(
      "SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY must be set.",
    );
  }

  const serviceClient = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const results: Outcome[] = [];
  const stamp = Date.now();
  const password = `t-pass-${stamp}`;
  const createdUserIds: string[] = [];
  const createdTenantIds: string[] = [];
  const createdLeadIds: string[] = [];

  try {
    const { data: tenant } = await serviceClient
      .from("tenants")
      .select("id")
      .eq("slug", "demo-academy")
      .maybeSingle();
    if (!tenant) {
      console.error("demo-academy tenant missing — run db:seed first");
      process.exit(1);
    }
    const tenantId: string = tenant.id;

    async function createMember(label: string, tid: string, email: string) {
      const { data: u, error } = await serviceClient.auth.admin.createUser({
        email,
        email_confirm: true,
        password,
      });
      if (error || !u?.user) throw new Error(`createUser ${label}: ${error?.message}`);
      const userId = u.user.id;
      createdUserIds.push(userId);
      await serviceClient
        .from("profiles")
        .upsert({ id: userId, email, full_name: `Lead ${label}` });
      await serviceClient
        .from("memberships")
        .insert({ user_id: userId, tenant_id: tid, role: "tenant_admin" });
      const client = createClient(url!, anon!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const signIn = await client.auth.signInWithPassword({ email, password });
      if (signIn.error || !signIn.data.session) {
        throw new Error(`${label} signIn: ${signIn.error?.message}`);
      }
      return { client, userId };
    }

    const demoMember = await createMember(
      "demo",
      tenantId,
      `lead-demo-${stamp}@nxtdrive.test`,
    );

    const { data: otherTenant, error: otErr } = await serviceClient
      .from("tenants")
      .insert({ slug: `leaddash-other-${stamp}`, name: `Lead Other ${stamp}` })
      .select("id")
      .single();
    if (otErr || !otherTenant) throw new Error(`create other tenant: ${otErr?.message}`);
    const otherTenantId = otherTenant.id as string;
    createdTenantIds.push(otherTenantId);
    const otherMember = await createMember(
      "other",
      otherTenantId,
      `lead-other-${stamp}@nxtdrive.test`,
    );

    // ---- 1. anon cannot read leads / lead_events --------------------------
    for (const table of ["leads", "lead_events"]) {
      const { data } = await anonClient.from(table).select("*").limit(5);
      results.push({
        name: `anon cannot read ${table}`,
        ok: (data ?? []).length === 0,
        detail: `rows=${(data ?? []).length}`,
      });
    }

    // ---- 2. create_lead_manual: lead + event + audit ----------------------
    let leadId: string | null = null;
    {
      const { data, error } = await serviceClient.rpc("create_lead_manual", {
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
        p_source: "manual",
        p_full_name: `Manual Lead ${stamp}`,
        p_email: `manual-${stamp}@example.com`,
        p_phone: null,
        p_message: "gebeld, wil proefles",
      });
      leadId = (data as string | null) ?? null;
      if (leadId) createdLeadIds.push(leadId);
      const { data: ev } = await serviceClient
        .from("lead_events")
        .select("id")
        .eq("lead_id", leadId ?? "")
        .eq("event_type", "created");
      const { data: audit } = await serviceClient
        .from("audit_log")
        .select("id")
        .eq("action", "lead.created")
        .eq("target_id", leadId ?? "");
      results.push({
        name: "create_lead_manual creates lead + created event + audit",
        ok: !error && !!leadId && (ev ?? []).length === 1 && (audit ?? []).length === 1,
        detail: error
          ? error.message
          : `lead=${leadId} events=${(ev ?? []).length} audit=${(audit ?? []).length}`,
      });
    }

    // ---- 3. create_lead_manual validation ---------------------------------
    {
      const { error: noName } = await serviceClient.rpc("create_lead_manual", {
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
        p_source: "manual",
        p_full_name: "  ",
        p_email: `x-${stamp}@example.com`,
        p_phone: null,
        p_message: null,
      });
      const { error: noContact } = await serviceClient.rpc("create_lead_manual", {
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
        p_source: "manual",
        p_full_name: `No Contact ${stamp}`,
        p_email: null,
        p_phone: null,
        p_message: null,
      });
      results.push({
        name: "create_lead_manual rejects missing name and missing contact",
        ok: !!noName && !!noContact,
        detail: `noName=${!!noName} noContact=${!!noContact}`,
      });
    }

    // ---- 4. ensure_lead_task idempotency ----------------------------------
    {
      const dedupe = `lead:${leadId}:new_lead_contact`;
      const args = {
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
        p_lead_id: leadId,
        p_task_type: "new_lead_contact",
        p_dedupe_key: dedupe,
        p_title: `Bel nieuwe lead ${stamp}`,
        p_description: null,
        p_priority: "normal",
        p_due_date: null,
      };
      const { data: t1, error: e1 } = await serviceClient.rpc("ensure_lead_task", args);
      const { data: t2, error: e2 } = await serviceClient.rpc("ensure_lead_task", args);
      const { count: openCount } = await serviceClient
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("dedupe_key", dedupe)
        .is("archived_at", null);
      results.push({
        name: "ensure_lead_task is idempotent (same id, exactly one open task)",
        ok: !e1 && !e2 && !!t1 && t1 === t2 && openCount === 1,
        detail: e1?.message ?? e2?.message ?? `t1=${t1} t2=${t2} open=${openCount}`,
      });

      // ---- 5. complete_lead_task archives + event + audit + idempotent ----
      const taskId = t1 as string;
      const { error: c1 } = await serviceClient.rpc("complete_lead_task", {
        p_task_id: taskId,
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
      });
      const { data: archived } = await serviceClient
        .from("tasks")
        .select("archived_at")
        .eq("id", taskId)
        .maybeSingle();
      const { data: doneEv } = await serviceClient
        .from("lead_events")
        .select("id")
        .eq("lead_id", leadId ?? "")
        .eq("event_type", "task_completed");
      const { data: doneAudit } = await serviceClient
        .from("audit_log")
        .select("id")
        .eq("action", "task.completed")
        .eq("target_id", taskId);
      // Second call must be a no-op (no throw, no extra event).
      const { error: c2 } = await serviceClient.rpc("complete_lead_task", {
        p_task_id: taskId,
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
      });
      const { data: doneEv2 } = await serviceClient
        .from("lead_events")
        .select("id")
        .eq("lead_id", leadId ?? "")
        .eq("event_type", "task_completed");
      results.push({
        name: "complete_lead_task archives + event + audit, second call no-op",
        ok:
          !c1 &&
          !c2 &&
          !!archived?.archived_at &&
          (doneEv ?? []).length === 1 &&
          (doneAudit ?? []).length === 1 &&
          (doneEv2 ?? []).length === 1,
        detail:
          c1?.message ??
          c2?.message ??
          `archived=${!!archived?.archived_at} events=${(doneEv ?? []).length}->${(doneEv2 ?? []).length} audit=${(doneAudit ?? []).length}`,
      });
    }

    // ---- 6. set_lead_automation_fields: score + score_updated event -------
    {
      const reason = [{ code: "has_phone", label: "Telefoon bekend", points: 10 }];
      const { error } = await serviceClient.rpc("set_lead_automation_fields", {
        p_lead_id: leadId,
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
        p_action_status: "awaiting_us",
        p_priority: "high",
        p_lead_score: 42,
        p_lead_score_reason: reason,
        p_next_action_at: new Date(stamp + 3_600_000).toISOString(),
        p_touch_activity: true,
      });
      const { data: lead } = await serviceClient
        .from("leads")
        .select("lead_score, action_status, priority")
        .eq("id", leadId ?? "")
        .maybeSingle();
      const { data: scoreEv } = await serviceClient
        .from("lead_events")
        .select("id")
        .eq("lead_id", leadId ?? "")
        .eq("event_type", "score_updated");
      results.push({
        name: "set_lead_automation_fields persists score + writes score_updated",
        ok:
          !error &&
          lead?.lead_score === 42 &&
          lead?.action_status === "awaiting_us" &&
          lead?.priority === "high" &&
          (scoreEv ?? []).length === 1,
        detail: error
          ? error.message
          : `score=${lead?.lead_score} action=${lead?.action_status} events=${(scoreEv ?? []).length}`,
      });

      // Same score again → no new score_updated event.
      await serviceClient.rpc("set_lead_automation_fields", {
        p_lead_id: leadId,
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
        p_action_status: null,
        p_priority: null,
        p_lead_score: 42,
        p_lead_score_reason: reason,
        p_next_action_at: null,
        p_touch_activity: false,
      });
      const { data: scoreEv2 } = await serviceClient
        .from("lead_events")
        .select("id")
        .eq("lead_id", leadId ?? "")
        .eq("event_type", "score_updated");
      results.push({
        name: "set_lead_automation_fields does not re-log an unchanged score",
        ok: (scoreEv2 ?? []).length === 1,
        detail: `events=${(scoreEv2 ?? []).length}`,
      });
    }

    // ---- 7. schedule_lead_follow_up ---------------------------------------
    {
      const when = new Date(stamp + 86_400_000).toISOString();
      const { error } = await serviceClient.rpc("schedule_lead_follow_up", {
        p_lead_id: leadId,
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
        p_next_action_at: when,
      });
      const { data: lead } = await serviceClient
        .from("leads")
        .select("status, action_status, next_action_at")
        .eq("id", leadId ?? "")
        .maybeSingle();
      const { data: ev } = await serviceClient
        .from("lead_events")
        .select("id")
        .eq("lead_id", leadId ?? "")
        .eq("event_type", "follow_up_scheduled");
      results.push({
        name: "schedule_lead_follow_up sets follow_up/scheduled + next_action + event",
        ok:
          !error &&
          lead?.status === "follow_up" &&
          lead?.action_status === "scheduled" &&
          !!lead?.next_action_at &&
          (ev ?? []).length === 1,
        detail: error
          ? error.message
          : `status=${lead?.status} action=${lead?.action_status} next=${lead?.next_action_at}`,
      });
    }

    // ---- 8. mark_lead_lost ------------------------------------------------
    {
      const { error } = await serviceClient.rpc("mark_lead_lost", {
        p_lead_id: leadId,
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
        p_reason: "te duur",
      });
      const { data: lead } = await serviceClient
        .from("leads")
        .select("status, action_status, lost_at, lost_reason, next_action_at")
        .eq("id", leadId ?? "")
        .maybeSingle();
      const { data: ev } = await serviceClient
        .from("lead_events")
        .select("id")
        .eq("lead_id", leadId ?? "")
        .eq("event_type", "lost");
      const { data: audit } = await serviceClient
        .from("audit_log")
        .select("id")
        .eq("action", "lead.lost")
        .eq("target_id", leadId ?? "");
      results.push({
        name: "mark_lead_lost sets dropped/closed + lost_at + event + audit",
        ok:
          !error &&
          lead?.status === "dropped" &&
          lead?.action_status === "closed" &&
          !!lead?.lost_at &&
          lead?.lost_reason === "te duur" &&
          lead?.next_action_at === null &&
          (ev ?? []).length === 1 &&
          (audit ?? []).length === 1,
        detail: error
          ? error.message
          : `status=${lead?.status} lost_at=${!!lead?.lost_at} reason=${lead?.lost_reason}`,
      });
    }

    // ---- 8b. preserve guarantees (regression for reconcile clobber) -------
    // The automation engine reconciles preserved states (dropped/converted +
    // follow_up) by passing NULL action_status so the RPC keeps the human value
    // and re-passing the existing next_action_at. These tests pin that contract.
    {
      // leadId is dropped/closed from section 8. A reconcile-style call (NULL
      // action_status, refreshed score) must NOT reopen it to 'none'.
      const { error } = await serviceClient.rpc("set_lead_automation_fields", {
        p_lead_id: leadId,
        p_tenant_id: tenantId,
        p_actor: null,
        p_action_status: null,
        p_priority: null,
        p_lead_score: 7,
        p_lead_score_reason: [{ code: "x", label: "x", points: 7 }],
        p_next_action_at: null,
        p_touch_activity: false,
      });
      const { data: lead } = await serviceClient
        .from("leads")
        .select("status, action_status, lead_score")
        .eq("id", leadId ?? "")
        .maybeSingle();
      results.push({
        name: "reconcile of a lost lead keeps dropped/closed (no reopen)",
        ok:
          !error &&
          lead?.status === "dropped" &&
          lead?.action_status === "closed" &&
          lead?.lead_score === 7,
        detail: error
          ? error.message
          : `status=${lead?.status} action=${lead?.action_status} score=${lead?.lead_score}`,
      });
    }
    {
      // Fresh lead → park it as follow_up → reconcile-style call must preserve
      // follow_up/scheduled AND the scheduled next_action_at.
      const { data: parkId } = await serviceClient.rpc("create_lead_manual", {
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
        p_source: "manual",
        p_full_name: "Park Later",
        p_email: `park-${stamp}@example.com`,
        p_phone: "+31600000000",
        p_message: null,
      });
      const parkLeadId = (parkId as string | null) ?? null;
      if (parkLeadId) createdLeadIds.push(parkLeadId);
      const when = new Date(stamp + 5 * 86_400_000).toISOString();
      await serviceClient.rpc("schedule_lead_follow_up", {
        p_lead_id: parkLeadId,
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
        p_next_action_at: when,
      });
      // Reconcile-style call: NULL action_status/priority, re-pass next_action_at.
      const { error } = await serviceClient.rpc("set_lead_automation_fields", {
        p_lead_id: parkLeadId,
        p_tenant_id: tenantId,
        p_actor: null,
        p_action_status: null,
        p_priority: null,
        p_lead_score: 33,
        p_lead_score_reason: [{ code: "y", label: "y", points: 33 }],
        p_next_action_at: when,
        p_touch_activity: false,
      });
      const { data: lead } = await serviceClient
        .from("leads")
        .select("status, action_status, next_action_at")
        .eq("id", parkLeadId ?? "")
        .maybeSingle();
      const nextPreserved =
        !!lead?.next_action_at &&
        new Date(lead.next_action_at as string).getTime() ===
          new Date(when).getTime();
      results.push({
        name: "reconcile of a parked follow_up keeps follow_up/scheduled + next_action",
        ok:
          !error &&
          lead?.status === "follow_up" &&
          lead?.action_status === "scheduled" &&
          nextPreserved,
        detail: error
          ? error.message
          : `status=${lead?.status} action=${lead?.action_status} next=${lead?.next_action_at}`,
      });
    }

    // ---- 8c. convert_lead_to_student reaches terminal state ---------------
    // convert must flip status='converted' AND set the terminal operational
    // fields (action_status='closed', next_action_at=null,
    // converted_to_student_at) so the automation engine (which preserves
    // terminal states) never has to repair it. Second call is idempotent.
    {
      const { data: convId } = await serviceClient.rpc("create_lead_manual", {
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
        p_source: "manual",
        p_full_name: "Convert Me",
        p_email: `convert-${stamp}@example.com`,
        p_phone: "+31600000001",
        p_message: null,
      });
      const convLeadId = (convId as string | null) ?? null;
      if (convLeadId) createdLeadIds.push(convLeadId);

      // Give it a live next_action_at so we can prove convert clears it.
      await serviceClient.rpc("schedule_lead_follow_up", {
        p_lead_id: convLeadId,
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
        p_next_action_at: new Date(stamp + 3 * 86_400_000).toISOString(),
      });

      const { data: studentId1, error: e1 } = await serviceClient.rpc(
        "convert_lead_to_student",
        {
          p_lead_id: convLeadId,
          p_tenant_id: tenantId,
          p_actor: demoMember.userId,
          p_package_id: null,
        },
      );
      const { data: studentId2, error: e2 } = await serviceClient.rpc(
        "convert_lead_to_student",
        {
          p_lead_id: convLeadId,
          p_tenant_id: tenantId,
          p_actor: demoMember.userId,
          p_package_id: null,
        },
      );
      const { data: lead } = await serviceClient
        .from("leads")
        .select("status, action_status, next_action_at, converted_to_student_at")
        .eq("id", convLeadId ?? "")
        .maybeSingle();
      results.push({
        name: "convert_lead_to_student sets terminal state + is idempotent",
        ok:
          !e1 &&
          !e2 &&
          !!studentId1 &&
          studentId1 === studentId2 &&
          lead?.status === "converted" &&
          lead?.action_status === "closed" &&
          lead?.next_action_at === null &&
          !!lead?.converted_to_student_at,
        detail:
          e1 || e2
            ? (e1 ?? e2)?.message
            : `student=${studentId1} same=${studentId1 === studentId2} status=${lead?.status} action=${lead?.action_status} next=${lead?.next_action_at}`,
      });

      // A reconcile-style call must NOT reopen a converted lead.
      const { error: e3 } = await serviceClient.rpc("set_lead_automation_fields", {
        p_lead_id: convLeadId,
        p_tenant_id: tenantId,
        p_actor: null,
        p_action_status: null,
        p_priority: null,
        p_lead_score: 9,
        p_lead_score_reason: [{ code: "z", label: "z", points: 9 }],
        p_next_action_at: null,
        p_touch_activity: false,
      });
      const { data: lead2 } = await serviceClient
        .from("leads")
        .select("status, action_status")
        .eq("id", convLeadId ?? "")
        .maybeSingle();
      results.push({
        name: "reconcile of a converted lead keeps converted/closed (no reopen)",
        ok:
          !e3 &&
          lead2?.status === "converted" &&
          lead2?.action_status === "closed",
        detail: e3
          ? e3.message
          : `status=${lead2?.status} action=${lead2?.action_status}`,
      });

      // Remove the student created here so the lead can be cleaned up in finally.
      if (studentId1) {
        await serviceClient.from("students").delete().eq("id", studentId1 as string);
      }
    }

    // ---- 9. cross-tenant actor rejected -----------------------------------
    {
      const { error } = await serviceClient.rpc("create_lead_manual", {
        p_tenant_id: tenantId,
        p_actor: otherMember.userId, // not a member of demo-academy
        p_source: "manual",
        p_full_name: "Should Reject",
        p_email: `reject-${stamp}@example.com`,
        p_phone: null,
        p_message: null,
      });
      results.push({
        name: "create_lead_manual rejects a cross-tenant actor",
        ok: !!error,
        detail: error ? error.message : "cross-tenant actor accepted!",
      });
    }

    // ---- 10. cross-tenant read isolation ----------------------------------
    {
      const { data: demoRead } = await demoMember.client
        .from("leads")
        .select("id")
        .eq("id", createdLeadIds[0] ?? "");
      const { data: otherRead } = await otherMember.client
        .from("leads")
        .select("id")
        .eq("id", createdLeadIds[0] ?? "");
      results.push({
        name: "tenant member reads own lead; other tenant cannot",
        ok: (demoRead ?? []).length === 1 && (otherRead ?? []).length === 0,
        detail: `own=${(demoRead ?? []).length} cross=${(otherRead ?? []).length}`,
      });
    }

    // ---- 11. anon cannot call the new mutation RPCs -----------------------
    const rpcChecks: { name: string; fn: string; args: Record<string, unknown> }[] = [
      {
        name: "create_lead_manual",
        fn: "create_lead_manual",
        args: {
          p_tenant_id: tenantId,
          p_actor: demoMember.userId,
          p_source: "manual",
          p_full_name: "evil",
          p_email: "evil@example.com",
          p_phone: null,
          p_message: null,
        },
      },
      {
        name: "ensure_lead_task",
        fn: "ensure_lead_task",
        args: {
          p_tenant_id: tenantId,
          p_actor: demoMember.userId,
          p_lead_id: createdLeadIds[0],
          p_task_type: "new_lead_contact",
          p_dedupe_key: `evil:${stamp}`,
          p_title: "evil",
          p_description: null,
          p_priority: "normal",
          p_due_date: null,
        },
      },
      {
        name: "set_lead_automation_fields",
        fn: "set_lead_automation_fields",
        args: {
          p_lead_id: createdLeadIds[0],
          p_tenant_id: tenantId,
          p_actor: demoMember.userId,
          p_action_status: "awaiting_us",
          p_priority: "high",
          p_lead_score: 99,
          p_lead_score_reason: [],
          p_next_action_at: null,
          p_touch_activity: false,
        },
      },
      {
        name: "mark_lead_lost",
        fn: "mark_lead_lost",
        args: {
          p_lead_id: createdLeadIds[0],
          p_tenant_id: tenantId,
          p_actor: demoMember.userId,
          p_reason: "evil",
        },
      },
      {
        name: "schedule_lead_follow_up",
        fn: "schedule_lead_follow_up",
        args: {
          p_lead_id: createdLeadIds[0],
          p_tenant_id: tenantId,
          p_actor: demoMember.userId,
          p_next_action_at: new Date(stamp).toISOString(),
        },
      },
      {
        name: "complete_lead_task",
        fn: "complete_lead_task",
        args: {
          p_task_id: "00000000-0000-0000-0000-000000000000",
          p_tenant_id: tenantId,
          p_actor: demoMember.userId,
        },
      },
      {
        name: "sync_lead_from_intake",
        fn: "sync_lead_from_intake",
        args: { p_lead_id: createdLeadIds[0], p_tenant_id: tenantId },
      },
    ];
    for (const c of rpcChecks) {
      const { error } = await anonClient.rpc(c.fn, c.args);
      results.push({
        name: `anon CANNOT call ${c.name} RPC (execute revoked)`,
        ok: !!error,
        detail: error ? error.message : "no error — RPC is callable!",
      });
    }
  } finally {
    // Cleanup — best effort.
    for (const id of createdLeadIds) {
      await serviceClient.from("lead_events").delete().eq("lead_id", id);
      await serviceClient.from("task_links").delete().eq("entity_id", id);
      await serviceClient.from("leads").delete().eq("id", id);
    }
    for (const tid of createdTenantIds) {
      await serviceClient.from("tasks").delete().eq("tenant_id", tid);
      await serviceClient.from("memberships").delete().eq("tenant_id", tid);
      await serviceClient.from("tenants").delete().eq("id", tid);
    }
    // Demo-academy auto-tasks created by this run.
    await serviceClient
      .from("tasks")
      .delete()
      .like("dedupe_key", "lead:%")
      .like("title", `%${stamp}%`);
    await serviceClient
      .from("memberships")
      .delete()
      .in("user_id", createdUserIds.length ? createdUserIds : ["00000000-0000-0000-0000-000000000000"]);
    for (const uid of createdUserIds) {
      await serviceClient.auth.admin.deleteUser(uid);
    }
  }

  // ---- report -------------------------------------------------------------
  let pass = 0;
  for (const r of results) {
    console.log(`${r.ok ? "✅" : "❌"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
    if (r.ok) pass++;
  }
  console.log(`\n${pass}/${results.length} checks passed`);
  if (pass !== results.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
