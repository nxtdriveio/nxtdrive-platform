/**
 * RLS + RPC tests for Module 11 — Kanban (tasks).
 *
 *   pnpm --filter @workspace/scripts run db:test-rls-tasks
 *   pnpm --filter @workspace/scripts run db:test-rls-tasks -- --env=production
 *
 * Asserts:
 *   1. Anon cannot read any of the task tables.
 *   2. demo-academy has the canon defaults: 7 departments, a board per
 *      department, and default columns per board.
 *   3. create_task succeeds via service role, sets position, writes audit.
 *   4. move_task moves a card across columns to a target position.
 *   5. assign_task assigns a tenant member; rejects a non-member.
 *   6. link_task_entity links to an in-tenant student; unlink removes it;
 *      a cross-tenant entity is rejected.
 *   7. A tenant member can read own-tenant tasks; a member of another tenant
 *      cannot (cross-tenant isolation).
 *   8. A cross-tenant actor is rejected by create_task.
 *   9. Anon cannot call the mutation RPCs (execute revoked).
 */
import { createClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} — running Kanban (tasks) RLS/RPC tests`);

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
  const createdTaskIds: string[] = [];
  const createdBoardIds: string[] = [];

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

    // Resolve the Administratie board + its Te doen / Bezig columns.
    const { data: dept } = await serviceClient
      .from("task_departments")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("key", "administratie")
      .maybeSingle();
    const { data: board } = await serviceClient
      .from("task_boards")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("department_id", dept?.id ?? "")
      .order("sort_order")
      .limit(1)
      .maybeSingle();
    const { data: cols } = await serviceClient
      .from("task_columns")
      .select("id, name, sort_order")
      .eq("tenant_id", tenantId)
      .eq("board_id", board?.id ?? "")
      .order("sort_order");
    const todoCol = (cols ?? []).find((c) => c.name === "Te doen");
    const bezigCol = (cols ?? []).find((c) => c.name === "Bezig");
    if (!dept || !board || !todoCol || !bezigCol) {
      console.error("demo defaults missing — run db:migrate then db:seed first");
      process.exit(1);
    }

    // A signed-in tenant_admin member for each tenant.
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
        .upsert({ id: userId, email, full_name: `Task ${label}` });
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
      `task-demo-${stamp}@nxtdrive.test`,
    );

    // Second tenant + member for cross-tenant isolation.
    const { data: otherTenant, error: otErr } = await serviceClient
      .from("tenants")
      .insert({ slug: `tasks-other-${stamp}`, name: `Tasks Other ${stamp}` })
      .select("id")
      .single();
    if (otErr || !otherTenant) throw new Error(`create other tenant: ${otErr?.message}`);
    const otherTenantId = otherTenant.id as string;
    createdTenantIds.push(otherTenantId);
    const otherMember = await createMember(
      "other",
      otherTenantId,
      `task-other-${stamp}@nxtdrive.test`,
    );

    // ---- 1. anon cannot read any task table --------------------------------
    for (const table of [
      "task_departments",
      "task_boards",
      "task_columns",
      "tasks",
      "task_links",
    ]) {
      const { data } = await anonClient.from(table).select("*").limit(5);
      results.push({
        name: `anon cannot read ${table}`,
        ok: (data ?? []).length === 0,
        detail: `rows=${(data ?? []).length}`,
      });
    }

    // ---- 2. demo defaults exist --------------------------------------------
    {
      const { count: deptCount } = await serviceClient
        .from("task_departments")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId);
      const { count: boardCount } = await serviceClient
        .from("task_boards")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId);
      const { count: colCount } = await serviceClient
        .from("task_columns")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId);
      results.push({
        name: "demo defaults: 7 departments, ≥7 boards, ≥21 columns",
        ok: deptCount === 7 && (boardCount ?? 0) >= 7 && (colCount ?? 0) >= 21,
        detail: `departments=${deptCount} boards=${boardCount} columns=${colCount}`,
      });
    }

    // ---- 3. create_task succeeds + audit -----------------------------------
    let taskId: string | null = null;
    {
      const { data, error } = await serviceClient.rpc("create_task", {
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
        p_board_id: board.id,
        p_column_id: todoCol.id,
        p_title: `RLS Test Task ${stamp}`,
        p_description: "created by test",
        p_priority: "high",
        p_due_date: null,
        p_assignee_user_id: null,
        p_department_id: dept.id,
      });
      taskId = (data as string | null) ?? null;
      if (taskId) createdTaskIds.push(taskId);
      const { data: audit } = await serviceClient
        .from("audit_log")
        .select("id")
        .eq("action", "task.created")
        .eq("target_id", taskId ?? "");
      results.push({
        name: "create_task succeeds and writes audit",
        ok: !error && !!taskId && (audit ?? []).length === 1,
        detail: error ? error.message : `task=${taskId} audit=${(audit ?? []).length}`,
      });
    }

    // ---- 4. move_task across columns ---------------------------------------
    {
      const { error } = await serviceClient.rpc("move_task", {
        p_task_id: taskId,
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
        p_column_id: bezigCol.id,
        p_position: 0,
      });
      const { data: after } = await serviceClient
        .from("tasks")
        .select("column_id, position")
        .eq("id", taskId ?? "")
        .maybeSingle();
      results.push({
        name: "move_task moves card to target column/position",
        ok: !error && after?.column_id === bezigCol.id && after?.position === 0,
        detail: error ? error.message : `column=${after?.column_id} pos=${after?.position}`,
      });
    }

    // ---- 5. assign_task: member ok, non-member rejected --------------------
    {
      const { error } = await serviceClient.rpc("assign_task", {
        p_task_id: taskId,
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
        p_assignee_user_id: demoMember.userId,
      });
      const { data: after } = await serviceClient
        .from("tasks")
        .select("assignee_user_id")
        .eq("id", taskId ?? "")
        .maybeSingle();
      results.push({
        name: "assign_task assigns a tenant member",
        ok: !error && after?.assignee_user_id === demoMember.userId,
        detail: error ? error.message : `assignee=${after?.assignee_user_id}`,
      });
    }
    {
      // otherMember is not a member of demo-academy → must be rejected.
      const { error } = await serviceClient.rpc("assign_task", {
        p_task_id: taskId,
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
        p_assignee_user_id: otherMember.userId,
      });
      results.push({
        name: "assign_task rejects a non-member assignee",
        ok: !!error,
        detail: error ? error.message : "non-member accepted!",
      });
    }

    // ---- 6. link/unlink + cross-tenant entity rejected ---------------------
    {
      const { data: demoStudent } = await serviceClient
        .from("students")
        .insert({ tenant_id: tenantId, full_name: `Link Student ${stamp}` })
        .select("id")
        .single();
      const { data: linkId, error: linkErr } = await serviceClient.rpc(
        "link_task_entity",
        {
          p_task_id: taskId,
          p_tenant_id: tenantId,
          p_actor: demoMember.userId,
          p_entity_type: "student",
          p_entity_id: demoStudent!.id,
        },
      );
      results.push({
        name: "link_task_entity links an in-tenant student",
        ok: !linkErr && !!linkId,
        detail: linkErr ? linkErr.message : `link=${linkId}`,
      });

      // Cross-tenant student must be rejected.
      const { data: foreignStudent } = await serviceClient
        .from("students")
        .insert({ tenant_id: otherTenantId, full_name: `Foreign ${stamp}` })
        .select("id")
        .single();
      const { error: crossErr } = await serviceClient.rpc("link_task_entity", {
        p_task_id: taskId,
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
        p_entity_type: "student",
        p_entity_id: foreignStudent!.id,
      });
      results.push({
        name: "link_task_entity rejects a cross-tenant entity",
        ok: !!crossErr,
        detail: crossErr ? crossErr.message : "cross-tenant entity accepted!",
      });

      // Unlink removes the row.
      const { error: unlinkErr } = await serviceClient.rpc("unlink_task_entity", {
        p_link_id: linkId,
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
      });
      const { data: remaining } = await serviceClient
        .from("task_links")
        .select("id")
        .eq("id", (linkId as string) ?? "");
      results.push({
        name: "unlink_task_entity removes the link",
        ok: !unlinkErr && (remaining ?? []).length === 0,
        detail: unlinkErr ? unlinkErr.message : `remaining=${(remaining ?? []).length}`,
      });

      await serviceClient.from("students").delete().eq("id", demoStudent!.id);
      await serviceClient.from("students").delete().eq("id", foreignStudent!.id);
    }

    // ---- 7. member read + cross-tenant isolation ---------------------------
    {
      const { data } = await demoMember.client
        .from("tasks")
        .select("id")
        .eq("id", taskId ?? "");
      results.push({
        name: "tenant member can read own-tenant task",
        ok: (data ?? []).length === 1,
        detail: `rows=${(data ?? []).length}`,
      });
    }
    {
      const { data } = await otherMember.client
        .from("tasks")
        .select("id")
        .eq("id", taskId ?? "");
      results.push({
        name: "member of tenant Y cannot read tenant X's task",
        ok: (data ?? []).length === 0,
        detail: `rows=${(data ?? []).length}`,
      });
    }

    // ---- 8. cross-tenant actor rejected by create_task ---------------------
    {
      const { error } = await serviceClient.rpc("create_task", {
        p_tenant_id: tenantId,
        p_actor: otherMember.userId, // not a member of demo-academy
        p_board_id: board.id,
        p_column_id: todoCol.id,
        p_title: "should be rejected",
        p_description: null,
        p_priority: "normal",
        p_due_date: null,
        p_assignee_user_id: null,
        p_department_id: null,
      });
      results.push({
        name: "create_task rejects a cross-tenant actor",
        ok: !!error,
        detail: error ? error.message : "cross-tenant actor accepted!",
      });
    }

    // ---- 9. anon cannot call the mutation RPCs (execute revoked) -----------
    {
      const { error } = await anonClient.rpc("create_task", {
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
        p_board_id: board.id,
        p_column_id: todoCol.id,
        p_title: "evil",
        p_description: null,
        p_priority: "normal",
        p_due_date: null,
        p_assignee_user_id: null,
        p_department_id: null,
      });
      results.push({
        name: "anon CANNOT call create_task RPC (execute revoked)",
        ok: !!error,
        detail: error ? error.message : "no error — RPC is callable!",
      });
    }
    {
      const { error } = await anonClient.rpc("move_task", {
        p_task_id: taskId,
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
        p_column_id: todoCol.id,
        p_position: 0,
      });
      results.push({
        name: "anon CANNOT call move_task RPC (execute revoked)",
        ok: !!error,
        detail: error ? error.message : "no error — RPC is callable!",
      });
    }
    {
      const { error } = await anonClient.rpc("link_task_entity", {
        p_task_id: taskId,
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
        p_entity_type: "lead",
        p_entity_id: "00000000-0000-0000-0000-000000000000",
      });
      results.push({
        name: "anon CANNOT call link_task_entity RPC (execute revoked)",
        ok: !!error,
        detail: error ? error.message : "no error — RPC is callable!",
      });
    }

    // ---- 10. ordering: same-column downward move + source compaction -------
    {
      // Isolated board with two columns, so ordering is independent of seed.
      const { data: ordBoard } = await serviceClient.rpc("create_task_board", {
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
        p_name: `Ordering ${stamp}`,
        p_department_id: null,
      });
      const ordBoardId = ordBoard as string;
      createdBoardIds.push(ordBoardId);
      const { data: colA } = await serviceClient.rpc("create_task_column", {
        p_board_id: ordBoardId,
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
        p_name: "Kolom A",
        p_wip_limit: null,
      });
      const { data: colB } = await serviceClient.rpc("create_task_column", {
        p_board_id: ordBoardId,
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
        p_name: "Kolom B",
        p_wip_limit: null,
      });
      const colAId = colA as string;
      const colBId = colB as string;

      // Three cards in Kolom A → positions 0,1,2.
      const cardIds: string[] = [];
      for (const label of ["A", "B", "C"]) {
        const { data: cid } = await serviceClient.rpc("create_task", {
          p_tenant_id: tenantId,
          p_actor: demoMember.userId,
          p_board_id: ordBoardId,
          p_column_id: colAId,
          p_title: `Card ${label} ${stamp}`,
          p_description: null,
          p_priority: "normal",
          p_due_date: null,
          p_assignee_user_id: null,
          p_department_id: null,
        });
        cardIds.push(cid as string);
        createdTaskIds.push(cid as string);
      }
      const [cardA, cardB, cardC] = cardIds;

      async function colOrder(colId: string): Promise<string[]> {
        const { data } = await serviceClient
          .from("tasks")
          .select("id, position")
          .eq("column_id", colId)
          .is("archived_at", null)
          .order("position");
        return (data ?? []).map((r) => r.id as string);
      }
      function isContiguous(rows: { position: number }[]): boolean {
        return rows.every((r, i) => r.position === i);
      }

      // Same-column downward move: A (pos 0) → pos 2. Expect B, C, A.
      await serviceClient.rpc("move_task", {
        p_task_id: cardA,
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
        p_column_id: colAId,
        p_position: 2,
      });
      const orderAfterDown = await colOrder(colAId);
      const { data: posA } = await serviceClient
        .from("tasks")
        .select("position")
        .eq("column_id", colAId)
        .is("archived_at", null)
        .order("position");
      results.push({
        name: "move_task same-column downward reorders to B,C,A (contiguous)",
        ok:
          orderAfterDown.join(",") === [cardB, cardC, cardA].join(",") &&
          isContiguous((posA ?? []) as { position: number }[]),
        detail: `order=${orderAfterDown.join(",")} positions=${(posA ?? [])
          .map((r) => r.position)
          .join(",")}`,
      });

      // Cross-column move: B → Kolom B at 0. Source must compact to C,A (0,1).
      await serviceClient.rpc("move_task", {
        p_task_id: cardB,
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
        p_column_id: colBId,
        p_position: 0,
      });
      const srcOrder = await colOrder(colAId);
      const { data: srcPos } = await serviceClient
        .from("tasks")
        .select("position")
        .eq("column_id", colAId)
        .is("archived_at", null)
        .order("position");
      const dstOrder = await colOrder(colBId);
      results.push({
        name: "move_task cross-column compacts source to C,A (0,1)",
        ok:
          srcOrder.join(",") === [cardC, cardA].join(",") &&
          isContiguous((srcPos ?? []) as { position: number }[]),
        detail: `src=${srcOrder.join(",")} positions=${(srcPos ?? [])
          .map((r) => r.position)
          .join(",")}`,
      });
      results.push({
        name: "move_task cross-column places card in destination at 0",
        ok: dstOrder.join(",") === [cardB].join(","),
        detail: `dst=${dstOrder.join(",")}`,
      });
    }

    // ---- 11. new tenants auto-provision default Kanban setup ---------------
    {
      const { data: freshTenant } = await serviceClient
        .from("tenants")
        .insert({
          slug: `tasks-fresh-${stamp}`,
          name: `Tasks Fresh ${stamp}`,
        })
        .select("id")
        .single();
      const freshId = freshTenant!.id as string;
      createdTenantIds.push(freshId);
      const { count: deptCount } = await serviceClient
        .from("task_departments")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", freshId);
      const { count: boardCount } = await serviceClient
        .from("task_boards")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", freshId);
      const { count: colCount } = await serviceClient
        .from("task_columns")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", freshId);
      results.push({
        name: "new tenant auto-provisions 7 departments / 7 boards / 21 columns",
        ok: deptCount === 7 && boardCount === 7 && colCount === 21,
        detail: `departments=${deptCount} boards=${boardCount} columns=${colCount}`,
      });
    }

    // ---- 12. assignment rules: default rule auto-assigns department --------
    {
      const { data: adminDept } = await serviceClient
        .from("task_departments")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("key", "administratie")
        .maybeSingle();

      // Title matches the default 'CBR-machtiging' rule, no department given →
      // create_task must resolve to the Administratie department + audit it.
      const { data: matchId } = await serviceClient.rpc("create_task", {
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
        p_board_id: board.id,
        p_column_id: todoCol.id,
        p_title: `Controleer CBR-machtiging ${stamp}`,
        p_description: null,
        p_priority: "normal",
        p_due_date: null,
        p_assignee_user_id: null,
        p_department_id: null,
      });
      const matchTaskId = matchId as string | null;
      if (matchTaskId) createdTaskIds.push(matchTaskId);
      const { data: matchTask } = await serviceClient
        .from("tasks")
        .select("department_id")
        .eq("id", matchTaskId ?? "")
        .maybeSingle();
      const { data: autoAudit } = await serviceClient
        .from("audit_log")
        .select("payload")
        .eq("action", "task.created")
        .eq("target_id", matchTaskId ?? "")
        .maybeSingle();
      const autoPayload = (autoAudit?.payload ?? {}) as {
        auto_assigned?: boolean;
        assignment_rule_id?: string | null;
      };
      results.push({
        name: "create_task auto-assigns department via matching rule + audit",
        ok:
          !!adminDept &&
          matchTask?.department_id === adminDept.id &&
          autoPayload.auto_assigned === true &&
          !!autoPayload.assignment_rule_id,
        detail: `dept=${matchTask?.department_id} expected=${adminDept?.id} auto=${autoPayload.auto_assigned} rule=${autoPayload.assignment_rule_id}`,
      });
    }

    // ---- 13. no rule match falls back to the board's department ------------
    {
      const { data: boardDept } = await serviceClient
        .from("task_boards")
        .select("department_id")
        .eq("id", board.id)
        .maybeSingle();
      const { data: noMatchId } = await serviceClient.rpc("create_task", {
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
        p_board_id: board.id,
        p_column_id: todoCol.id,
        p_title: `Geen regel matcht hierop ${stamp}`,
        p_description: null,
        p_priority: "normal",
        p_due_date: null,
        p_assignee_user_id: null,
        p_department_id: null,
      });
      const noMatchTaskId = noMatchId as string | null;
      if (noMatchTaskId) createdTaskIds.push(noMatchTaskId);
      const { data: noMatchTask } = await serviceClient
        .from("tasks")
        .select("department_id")
        .eq("id", noMatchTaskId ?? "")
        .maybeSingle();
      results.push({
        name: "create_task with no matching rule falls back to board department",
        ok:
          !!boardDept?.department_id &&
          noMatchTask?.department_id === boardDept.department_id,
        detail: `dept=${noMatchTask?.department_id} board=${boardDept?.department_id}`,
      });
    }

    // ---- 14. rule management RPCs (tenant_admin) + audit -------------------
    {
      const { data: salesDept } = await serviceClient
        .from("task_departments")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("key", "administratie")
        .maybeSingle();

      const { data: ruleId, error: createErr } = await serviceClient.rpc(
        "create_task_assignment_rule",
        {
          p_tenant_id: tenantId,
          p_actor: demoMember.userId,
          p_keyword: `Testregel ${stamp}`,
          p_match_type: "contains",
          p_department_id: salesDept!.id,
        },
      );
      const newRuleId = ruleId as string | null;
      const { data: createdAudit } = await serviceClient
        .from("audit_log")
        .select("id")
        .eq("action", "task.rule_created")
        .eq("target_id", newRuleId ?? "");
      results.push({
        name: "create_task_assignment_rule creates rule + audit",
        ok: !createErr && !!newRuleId && (createdAudit ?? []).length === 1,
        detail: createErr ? createErr.message : `rule=${newRuleId} audit=${(createdAudit ?? []).length}`,
      });

      const { error: updateErr } = await serviceClient.rpc(
        "update_task_assignment_rule",
        {
          p_rule_id: newRuleId,
          p_tenant_id: tenantId,
          p_actor: demoMember.userId,
          p_keyword: null,
          p_match_type: null,
          p_department_id: null,
          p_active: false,
          p_sort_order: null,
        },
      );
      const { data: updatedRule } = await serviceClient
        .from("task_assignment_rules")
        .select("active")
        .eq("id", newRuleId ?? "")
        .maybeSingle();
      const { data: updatedAudit } = await serviceClient
        .from("audit_log")
        .select("id")
        .eq("action", "task.rule_updated")
        .eq("target_id", newRuleId ?? "");
      results.push({
        name: "update_task_assignment_rule toggles active + audit",
        ok: !updateErr && updatedRule?.active === false && (updatedAudit ?? []).length === 1,
        detail: updateErr ? updateErr.message : `active=${updatedRule?.active} audit=${(updatedAudit ?? []).length}`,
      });

      const { error: deleteErr } = await serviceClient.rpc(
        "delete_task_assignment_rule",
        {
          p_rule_id: newRuleId,
          p_tenant_id: tenantId,
          p_actor: demoMember.userId,
        },
      );
      const { data: remainingRule } = await serviceClient
        .from("task_assignment_rules")
        .select("id")
        .eq("id", newRuleId ?? "");
      const { data: deletedAudit } = await serviceClient
        .from("audit_log")
        .select("id")
        .eq("action", "task.rule_deleted")
        .eq("target_id", newRuleId ?? "");
      results.push({
        name: "delete_task_assignment_rule removes rule + audit",
        ok: !deleteErr && (remainingRule ?? []).length === 0 && (deletedAudit ?? []).length === 1,
        detail: deleteErr ? deleteErr.message : `remaining=${(remainingRule ?? []).length} audit=${(deletedAudit ?? []).length}`,
      });
    }

    // ---- 15. anon cannot call rule management RPCs (execute revoked) -------
    {
      const { error } = await anonClient.rpc("create_task_assignment_rule", {
        p_tenant_id: tenantId,
        p_actor: demoMember.userId,
        p_keyword: "evil",
        p_match_type: "contains",
        p_department_id: dept.id,
      });
      results.push({
        name: "anon CANNOT call create_task_assignment_rule (execute revoked)",
        ok: !!error,
        detail: error ? error.message : "no error — RPC is callable!",
      });
    }

    // ---- 16. rule resolution is tenant-scoped -----------------------------
    {
      // The default 'CBR-machtiging' rule belongs to demo-academy. The other
      // tenant has its own provisioned default, but resolving a demo-specific
      // title there must use ITS OWN rule/department, never demo's row.
      const { data: demoResolve } = await serviceClient.rpc(
        "resolve_task_assignment",
        { p_tenant_id: tenantId, p_title: "Controleer CBR-machtiging" },
      );
      const { data: otherResolve } = await serviceClient.rpc(
        "resolve_task_assignment",
        { p_tenant_id: otherTenantId, p_title: "Controleer CBR-machtiging" },
      );
      const demoRow = (demoResolve ?? [])[0] as
        | { department_id: string }
        | undefined;
      const otherRow = (otherResolve ?? [])[0] as
        | { department_id: string }
        | undefined;
      results.push({
        name: "resolve_task_assignment is tenant-scoped (no cross-tenant leak)",
        ok:
          !!demoRow &&
          !!otherRow &&
          demoRow.department_id !== otherRow.department_id,
        detail: `demoDept=${demoRow?.department_id} otherDept=${otherRow?.department_id}`,
      });
    }

    await demoMember.client.auth.signOut();
    await otherMember.client.auth.signOut();
  } finally {
    if (createdTaskIds.length) {
      await serviceClient
        .from("tasks")
        .delete()
        .in("id", createdTaskIds)
        .then(() => undefined, () => undefined);
    }
    if (createdBoardIds.length) {
      await serviceClient
        .from("task_boards")
        .delete()
        .in("id", createdBoardIds)
        .then(() => undefined, () => undefined);
    }
    for (const uid of createdUserIds) {
      await serviceClient.from("memberships").delete().eq("user_id", uid);
      await serviceClient.auth.admin.deleteUser(uid).catch(() => undefined);
    }
    for (const tid of createdTenantIds) {
      await serviceClient
        .from("tenants")
        .delete()
        .eq("id", tid)
        .then(() => undefined, () => undefined);
    }
  }

  console.log("");
  let failed = 0;
  for (const r of results) {
    const mark = r.ok ? "✅" : "❌";
    console.log(`${mark} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
    if (!r.ok) failed++;
  }
  console.log("");
  if (failed > 0) {
    console.error(`${failed} test(s) failed.`);
    process.exit(1);
  }
  console.log("All Kanban (tasks) RLS/RPC tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
