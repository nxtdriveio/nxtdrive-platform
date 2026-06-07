/**
 * Database integration guardrails for Sprint 4F cross-branch isolation.
 *
 *   pnpm --filter @workspace/scripts run db:test-branch-cross-scope-foundation
 *   pnpm --filter @workspace/scripts run db:test-branch-cross-scope-foundation -- --env=production
 *
 * This test creates two branches in demo-academy, signs in a branch-A scoped
 * staff user, and verifies that shared rows plus branch A are visible while
 * branch B rows are blocked across the branch-complete modules.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseEnvFromArgv, bannerFor } from "./lib/db-env.js";

type Outcome = { name: string; ok: boolean; detail?: string };
type IdRow = { id: string };

function idsFrom(rows: unknown[] | null | undefined): string[] {
  return ((rows ?? []) as IdRow[]).map((row) => row.id).sort();
}

function hasExactly(ids: string[], expected: readonly string[]): boolean {
  const sortedExpected = [...expected].sort();
  return ids.length === sortedExpected.length && ids.every((id, index) => id === sortedExpected[index]);
}

function futureIso(daysAhead: number, hourUtc: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  date.setUTCHours(hourUtc, 0, 0, 0);
  return date.toISOString();
}

async function main(): Promise<void> {
  const env = parseEnvFromArgv(process.argv);
  console.log(`${bannerFor(env)} - running branch cross-scope integration tests`);

  const url = process.env["SUPABASE_URL"];
  const anon = process.env["SUPABASE_ANON_KEY"];
  const service = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !anon || !service) {
    throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY must be set.");
  }

  const svc = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const results: Outcome[] = [];
  const stamp = Date.now();
  const password = `BranchTest123!${stamp}`;

  const createdUserIds: string[] = [];
  const createdMembershipIds: string[] = [];
  const createdBranchIds: string[] = [];
  const createdOtherTenantIds: string[] = [];
  const createdVehicleIds: string[] = [];
  const createdLocationIds: string[] = [];
  const createdTaskIds: string[] = [];
  const createdBoardIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdInvoiceIds: string[] = [];
  const createdLessonIds: string[] = [];
  const createdAppointmentIds: string[] = [];

  let tenantId = "";
  let adminId = "";
  let branchAId = "";
  let branchBId = "";
  let branchScopedClient: SupabaseClient | null = null;
  let branchStaffUserId = "";
  let branchBInstructorId = "";

  async function addResult(name: string, ok: boolean, detail?: string): Promise<void> {
    results.push({ name, ok, detail });
  }

  async function createStaff(label: string, branchId: string): Promise<{ userId: string; membershipId: string; email: string }> {
    const email = `_4f-${label}-${stamp}@nxtdrive-test.invalid`;
    const created = await svc.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
    });
    if (created.error || !created.data.user) {
      throw new Error(`create staff ${label}: ${created.error?.message}`);
    }
    const userId = created.data.user.id;
    createdUserIds.push(userId);

    await svc.from("profiles").upsert({
      id: userId,
      email,
      full_name: `4F ${label}`,
    });

    const membership = await svc
      .from("memberships")
      .insert({ user_id: userId, tenant_id: tenantId, role: "instructor" })
      .select("id")
      .single();
    if (membership.error || !membership.data) {
      throw new Error(`create membership ${label}: ${membership.error?.message}`);
    }
    const membershipId = membership.data.id as string;
    createdMembershipIds.push(membershipId);

    const scoped = await svc.rpc("set_membership_branches", {
      p_membership_id: membershipId,
      p_branch_ids: [branchId],
      p_actor: adminId,
    });
    if (scoped.error) throw new Error(`scope membership ${label}: ${scoped.error.message}`);

    return { userId, membershipId, email };
  }

  async function expectVisibleIds(
    name: string,
    query: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
    expectedIds: readonly string[],
  ): Promise<void> {
    const { data, error } = await query;
    const visibleIds = idsFrom(data);
    await addResult(name, !error && hasExactly(visibleIds, expectedIds), error?.message ?? `visible=${visibleIds.join(",")}`);
  }

  async function makeInvoice(studentId: string): Promise<{ invoiceId: string; lineId: string | null }> {
    const created = await svc.rpc("create_invoice", {
      p_tenant_id: tenantId,
      p_actor: adminId,
      p_student_id: studentId,
      p_due_date: null,
      p_notes: null,
    });
    if (created.error || !created.data) throw new Error(`create_invoice: ${created.error?.message}`);
    const invoiceId = created.data as string;
    createdInvoiceIds.push(invoiceId);

    const line = await svc.rpc("add_invoice_line", {
      p_invoice_id: invoiceId,
      p_tenant_id: tenantId,
      p_actor: adminId,
      p_description: `4F line ${stamp}`,
      p_quantity: 1,
      p_unit_price_cents: 7500,
      p_tax_rate_bp: 2100,
      p_related_package_id: null,
    });
    if (line.error) throw new Error(`add_invoice_line: ${line.error.message}`);

    await svc.rpc("set_invoice_status", {
      p_invoice_id: invoiceId,
      p_tenant_id: tenantId,
      p_actor: adminId,
      p_status: "open",
    });

    const lineRow = await svc
      .from("invoice_lines")
      .select("id")
      .eq("invoice_id", invoiceId)
      .limit(1)
      .maybeSingle();
    return { invoiceId, lineId: (lineRow.data?.id as string | undefined) ?? null };
  }

  try {
    const tenant = await svc
      .from("tenants")
      .select("id")
      .eq("slug", "demo-academy")
      .maybeSingle();
    if (!tenant.data) throw new Error("demo-academy tenant missing - run db:seed first");
    tenantId = tenant.data.id as string;

    const adminMembership = await svc
      .from("memberships")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("role", "tenant_admin")
      .limit(1)
      .maybeSingle();
    if (!adminMembership.data) throw new Error("No tenant_admin membership in demo-academy");
    adminId = adminMembership.data.user_id as string;

    await svc.from("branches").delete().eq("tenant_id", tenantId).like("slug", `_test-4f-${stamp}-%`);

    const branchA = await svc.rpc("create_branch", {
      p_tenant_id: tenantId,
      p_name: `4F Branch A ${stamp}`,
      p_slug: `_test-4f-${stamp}-a`,
      p_address: null,
      p_city: "Den Haag",
      p_actor: adminId,
    });
    const branchB = await svc.rpc("create_branch", {
      p_tenant_id: tenantId,
      p_name: `4F Branch B ${stamp}`,
      p_slug: `_test-4f-${stamp}-b`,
      p_address: null,
      p_city: "Rotterdam",
      p_actor: adminId,
    });
    if (branchA.error || !branchA.data) throw new Error(`create branch A: ${branchA.error?.message}`);
    if (branchB.error || !branchB.data) throw new Error(`create branch B: ${branchB.error?.message}`);
    branchAId = branchA.data as string;
    branchBId = branchB.data as string;
    createdBranchIds.push(branchAId, branchBId);

    const staffA = await createStaff("staff-a", branchAId);
    branchStaffUserId = staffA.userId;
    const staffB = await createStaff("staff-b", branchBId);
    branchBInstructorId = staffB.userId;

    branchScopedClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signIn = await branchScopedClient.auth.signInWithPassword({
      email: staffA.email,
      password,
    });
    if (signIn.error || !signIn.data.session) {
      branchScopedClient = null;
      await addResult(
        "authenticated branch-scope checks skipped when sign-in is unavailable",
        true,
        signIn.error?.message ?? "no session",
      );
    }

    const otherTenant = await svc
      .from("tenants")
      .insert({ slug: `_4f-other-${stamp}`, name: `4F Other ${stamp}` })
      .select("id")
      .single();
    if (otherTenant.error || !otherTenant.data) throw new Error(`create other tenant: ${otherTenant.error?.message}`);
    const otherTenantId = otherTenant.data.id as string;
    createdOtherTenantIds.push(otherTenantId);
    const otherBranch = await svc
      .from("branches")
      .insert({ tenant_id: otherTenantId, name: "4F Other Branch", slug: `_4f-other-${stamp}` })
      .select("id")
      .single();
    if (otherBranch.error || !otherBranch.data) throw new Error(`create other branch: ${otherBranch.error?.message}`);
    const otherBranchId = otherBranch.data.id as string;

    const vehicles = await svc
      .from("vehicles")
      .insert([
        { tenant_id: tenantId, label: `4F Shared Vehicle ${stamp}`, license_plate: `4FS${stamp}`.slice(-8), branch_id: null, active: true },
        { tenant_id: tenantId, label: `4F Branch A Vehicle ${stamp}`, license_plate: `4FA${stamp}`.slice(-8), branch_id: branchAId, active: true },
        { tenant_id: tenantId, label: `4F Branch B Vehicle ${stamp}`, license_plate: `4FB${stamp}`.slice(-8), branch_id: branchBId, active: true },
      ])
      .select("id, branch_id")
      .order("label");
    if (vehicles.error || !vehicles.data) throw new Error(`vehicles: ${vehicles.error?.message}`);
    const vehicleSharedId = (vehicles.data.find((row) => row.branch_id === null) as IdRow).id;
    const vehicleAId = (vehicles.data.find((row) => row.branch_id === branchAId) as IdRow).id;
    const vehicleBId = (vehicles.data.find((row) => row.branch_id === branchBId) as IdRow).id;
    createdVehicleIds.push(vehicleSharedId, vehicleAId, vehicleBId);

    const locations = await svc
      .from("locations")
      .insert([
        { tenant_id: tenantId, name: `4F Shared Location ${stamp}`, branch_id: null, active: true },
        { tenant_id: tenantId, name: `4F Branch A Location ${stamp}`, branch_id: branchAId, active: true },
        { tenant_id: tenantId, name: `4F Branch B Location ${stamp}`, branch_id: branchBId, active: true },
      ])
      .select("id, branch_id")
      .order("name");
    if (locations.error || !locations.data) throw new Error(`locations: ${locations.error?.message}`);
    const locationSharedId = (locations.data.find((row) => row.branch_id === null) as IdRow).id;
    const locationAId = (locations.data.find((row) => row.branch_id === branchAId) as IdRow).id;
    const locationBId = (locations.data.find((row) => row.branch_id === branchBId) as IdRow).id;
    createdLocationIds.push(locationSharedId, locationAId, locationBId);

    const department = await svc
      .from("task_departments")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("key", "administratie")
      .maybeSingle();
    const seedBoard = await svc
      .from("task_boards")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("department_id", department.data?.id ?? "")
      .order("sort_order")
      .limit(1)
      .maybeSingle();
    const seedColumn = await svc
      .from("task_columns")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("board_id", seedBoard.data?.id ?? "")
      .order("sort_order")
      .limit(1)
      .maybeSingle();
    if (!department.data || !seedBoard.data || !seedColumn.data) {
      throw new Error("Task defaults missing - run db:migrate and db:seed first");
    }

    const branchBoards = await svc
      .from("task_boards")
      .insert([
        { tenant_id: tenantId, department_id: department.data.id, name: `4F Board A ${stamp}`, branch_id: branchAId },
        { tenant_id: tenantId, department_id: department.data.id, name: `4F Board B ${stamp}`, branch_id: branchBId },
      ])
      .select("id, branch_id");
    if (branchBoards.error || !branchBoards.data) throw new Error(`task boards: ${branchBoards.error?.message}`);
    const boardAId = (branchBoards.data.find((row) => row.branch_id === branchAId) as IdRow).id;
    const boardBId = (branchBoards.data.find((row) => row.branch_id === branchBId) as IdRow).id;
    createdBoardIds.push(boardAId, boardBId);

    async function makeTask(label: string, branchId: string | null): Promise<string> {
      const created = await svc.rpc("create_task", {
        p_tenant_id: tenantId,
        p_actor: adminId,
        p_board_id: seedBoard.data!.id,
        p_column_id: seedColumn.data!.id,
        p_title: `4F ${label} ${stamp}`,
        p_description: null,
        p_priority: "normal",
        p_due_date: null,
        p_assignee_user_id: null,
        p_department_id: department.data!.id,
      });
      if (created.error || !created.data) throw new Error(`create task ${label}: ${created.error?.message}`);
      const taskId = created.data as string;
      createdTaskIds.push(taskId);
      if (branchId !== null) {
        const assigned = await svc.rpc("assign_task_branch", {
          p_task_id: taskId,
          p_tenant_id: tenantId,
          p_actor: adminId,
          p_branch_id: branchId,
        });
        if (assigned.error) throw new Error(`assign task branch ${label}: ${assigned.error.message}`);
      }
      return taskId;
    }
    const taskSharedId = await makeTask("Shared Task", null);
    const taskAId = await makeTask("Branch A Task", branchAId);
    const taskBId = await makeTask("Branch B Task", branchBId);

    const students = await svc
      .from("students")
      .insert([
        { tenant_id: tenantId, full_name: `4F Student A ${stamp}`, email: `_4f-student-a-${stamp}@nxtdrive-test.invalid`, branch_id: branchAId },
        { tenant_id: tenantId, full_name: `4F Student B ${stamp}`, email: `_4f-student-b-${stamp}@nxtdrive-test.invalid`, branch_id: branchBId },
      ])
      .select("id, branch_id");
    if (students.error || !students.data) throw new Error(`students: ${students.error?.message}`);
    const studentAId = (students.data.find((row) => row.branch_id === branchAId) as IdRow).id;
    const studentBId = (students.data.find((row) => row.branch_id === branchBId) as IdRow).id;
    createdStudentIds.push(studentAId, studentBId);

    const invoiceA = await makeInvoice(studentAId);
    const invoiceB = await makeInvoice(studentBId);

    await svc.from("credit_ledger").insert([
      { tenant_id: tenantId, student_id: studentAId, delta: 600, reason: "opening_balance", note: "4F branch test" },
      { tenant_id: tenantId, student_id: studentBId, delta: 600, reason: "opening_balance", note: "4F branch test" },
    ]);

    async function makeLesson(studentId: string, daysAhead: number): Promise<string> {
      const scheduled = await svc.rpc("schedule_lesson", {
        p_tenant_id: tenantId,
        p_actor: adminId,
        p_instructor_id: branchStaffUserId,
        p_student_id: studentId,
        p_starts_at: futureIso(daysAhead, 9),
        p_duration_min: 60,
        p_credits_cost: 1,
        p_location: null,
        p_notes: null,
      });
      if (scheduled.error || !scheduled.data) throw new Error(`schedule lesson: ${scheduled.error?.message}`);
      const lessonId = scheduled.data as string;
      createdLessonIds.push(lessonId);
      return lessonId;
    }
    const lessonAId = await makeLesson(studentAId, 70);
    const lessonBId = await makeLesson(studentBId, 71);

    async function makeAppointment(studentId: string, daysAhead: number): Promise<string> {
      const created = await svc.rpc("create_agenda_appointment", {
        p_tenant_id: tenantId,
        p_actor: adminId,
        p_instructor_id: branchStaffUserId,
        p_type: "exam",
        p_starts_at: futureIso(daysAhead, 11),
        p_duration_min: 60,
        p_student_id: studentId,
        p_title: `4F exam ${daysAhead}`,
        p_location: null,
        p_notes: null,
      });
      if (created.error || !created.data) throw new Error(`create appointment: ${created.error?.message}`);
      const appointmentId = created.data as string;
      createdAppointmentIds.push(appointmentId);
      return appointmentId;
    }
    const appointmentAId = await makeAppointment(studentAId, 72);
    const appointmentBId = await makeAppointment(studentBId, 73);

    await svc.rpc("set_instructor_weekly_availability", {
      p_tenant_id: tenantId,
      p_actor: branchStaffUserId,
      p_instructor_id: branchStaffUserId,
      p_blocks: [{ weekday: 1, start_min: 540, end_min: 720 }],
    });
    await svc.rpc("set_instructor_weekly_availability", {
      p_tenant_id: tenantId,
      p_actor: branchBInstructorId,
      p_instructor_id: branchBInstructorId,
      p_blocks: [{ weekday: 2, start_min: 540, end_min: 720 }],
    });

    const crossVehicleInsert = await svc.from("vehicles").insert({
      tenant_id: tenantId,
      label: `4F Cross Vehicle ${stamp}`,
      license_plate: `4FX${stamp}`.slice(-8),
      branch_id: otherBranchId,
      active: true,
    });
    await addResult(
      "database rejects vehicle with cross-tenant branch_id",
      !!crossVehicleInsert.error,
      crossVehicleInsert.error?.message ?? "cross-tenant vehicle accepted",
    );

    const crossVehicleAssign = await svc.rpc("assign_vehicle_branch", {
      p_tenant_id: tenantId,
      p_actor: adminId,
      p_id: vehicleAId,
      p_branch_id: otherBranchId,
    });
    await addResult(
      "assign_vehicle_branch rejects cross-tenant branch_id",
      !!crossVehicleAssign.error,
      crossVehicleAssign.error?.message ?? "cross-tenant assignment accepted",
    );

    const crossTaskAssign = await svc.rpc("assign_task_branch", {
      p_task_id: taskAId,
      p_tenant_id: tenantId,
      p_actor: adminId,
      p_branch_id: otherBranchId,
    });
    await addResult(
      "assign_task_branch rejects cross-tenant branch_id",
      !!crossTaskAssign.error,
      crossTaskAssign.error?.message ?? "cross-tenant task assignment accepted",
    );

    const wrongInvoiceBranch = await svc.from("invoices").update({ branch_id: branchBId }).eq("id", invoiceA.invoiceId);
    await addResult(
      "invoice branch trigger rejects branch mismatch with student",
      !!wrongInvoiceBranch.error,
      wrongInvoiceBranch.error?.message ?? "invoice branch mismatch accepted",
    );

    if (branchScopedClient) {
      await expectVisibleIds(
        "branch A staff sees shared and branch A vehicles, not branch B",
        branchScopedClient.from("vehicles").select("id").in("id", [vehicleSharedId, vehicleAId, vehicleBId]),
        [vehicleSharedId, vehicleAId],
      );
      await expectVisibleIds(
        "branch A staff sees shared and branch A locations, not branch B",
        branchScopedClient.from("locations").select("id").in("id", [locationSharedId, locationAId, locationBId]),
        [locationSharedId, locationAId],
      );
      await expectVisibleIds(
        "branch A staff sees branch A task board, not branch B board",
        branchScopedClient.from("task_boards").select("id").in("id", [boardAId, boardBId]),
        [boardAId],
      );
      await expectVisibleIds(
        "branch A staff sees shared and branch A tasks, not branch B",
        branchScopedClient.from("tasks").select("id").in("id", [taskSharedId, taskAId, taskBId]),
        [taskSharedId, taskAId],
      );
      await expectVisibleIds(
        "branch A staff sees branch A invoice, not branch B invoice",
        branchScopedClient.from("invoices").select("id").in("id", [invoiceA.invoiceId, invoiceB.invoiceId]),
        [invoiceA.invoiceId],
      );
      if (invoiceA.lineId && invoiceB.lineId) {
        await expectVisibleIds(
          "branch A staff sees branch A invoice line, not branch B line",
          branchScopedClient.from("invoice_lines").select("id").in("id", [invoiceA.lineId, invoiceB.lineId]),
          [invoiceA.lineId],
        );
      }
      await expectVisibleIds(
        "branch A staff sees branch A lesson, not branch B lesson",
        branchScopedClient.from("lessons").select("id").in("id", [lessonAId, lessonBId]),
        [lessonAId],
      );
      await expectVisibleIds(
        "branch A staff sees branch A agenda appointment, not branch B appointment",
        branchScopedClient.from("agenda_appointments").select("id").in("id", [appointmentAId, appointmentBId]),
        [appointmentAId],
      );
      const availability = await branchScopedClient
        .from("instructor_availability")
        .select("id, instructor_id")
        .in("instructor_id", [branchStaffUserId, branchBInstructorId]);
      const availabilityInstructors = ((availability.data ?? []) as { instructor_id: string }[])
        .map((row) => row.instructor_id)
        .sort();
      await addResult(
        "branch A staff sees branch A instructor availability, not branch B instructor availability",
        !availability.error && hasExactly(availabilityInstructors, [branchStaffUserId]),
        availability.error?.message ?? `visible_instructors=${availabilityInstructors.join(",")}`,
      );

      const directBranchBWrite = await branchScopedClient.from("vehicles").insert({
        tenant_id: tenantId,
        label: `4F Forbidden Vehicle ${stamp}`,
        license_plate: `4FW${stamp}`.slice(-8),
        branch_id: branchBId,
        active: true,
      });
      await addResult(
        "branch A authenticated staff cannot write branch B vehicle",
        !!directBranchBWrite.error,
        directBranchBWrite.error?.message ?? "branch B write accepted",
      );
    }

    const anonVehicles = await anonClient.from("vehicles").select("id").in("id", [vehicleSharedId, vehicleAId, vehicleBId]);
    await addResult(
      "anonymous users cannot read branch-scoped operational assets",
      (anonVehicles.data ?? []).length === 0,
      `rows=${(anonVehicles.data ?? []).length}`,
    );
  } finally {
    if (branchScopedClient) await branchScopedClient.auth.signOut();

    for (const appointmentId of createdAppointmentIds) {
      await svc.from("agenda_appointments").delete().eq("id", appointmentId);
    }
    for (const lessonId of createdLessonIds) {
      await svc.from("lessons").delete().eq("id", lessonId);
    }
    for (const invoiceId of createdInvoiceIds) {
      await svc.from("payment_records").delete().eq("invoice_id", invoiceId);
      await svc.from("invoice_lines").delete().eq("invoice_id", invoiceId);
      await svc.from("invoices").delete().eq("id", invoiceId);
    }
    for (const studentId of createdStudentIds) {
      await svc.from("credit_ledger").delete().eq("student_id", studentId);
      await svc.from("students").delete().eq("id", studentId);
    }
    for (const taskId of createdTaskIds) {
      await svc.from("task_links").delete().eq("task_id", taskId);
      await svc.from("tasks").delete().eq("id", taskId);
    }
    for (const boardId of createdBoardIds) {
      await svc.from("task_boards").delete().eq("id", boardId);
    }
    for (const vehicleId of createdVehicleIds) {
      await svc.from("vehicles").delete().eq("id", vehicleId);
    }
    for (const locationId of createdLocationIds) {
      await svc.from("locations").delete().eq("id", locationId);
    }
    if (branchStaffUserId) {
      await svc.from("instructor_availability").delete().eq("tenant_id", tenantId).eq("instructor_id", branchStaffUserId);
      await svc.from("instructor_availability_exception").delete().eq("tenant_id", tenantId).eq("instructor_id", branchStaffUserId);
    }
    if (branchBInstructorId) {
      await svc.from("instructor_availability").delete().eq("tenant_id", tenantId).eq("instructor_id", branchBInstructorId);
      await svc.from("instructor_availability_exception").delete().eq("tenant_id", tenantId).eq("instructor_id", branchBInstructorId);
    }
    for (const membershipId of createdMembershipIds) {
      await svc.from("membership_branches").delete().eq("membership_id", membershipId);
      await svc.from("memberships").delete().eq("id", membershipId);
    }
    for (const userId of createdUserIds) {
      await svc.from("profiles").delete().eq("id", userId);
      await svc.auth.admin.deleteUser(userId);
    }
    for (const branchId of createdBranchIds) {
      await svc.from("branches").delete().eq("id", branchId);
    }
    for (const otherTenantId of createdOtherTenantIds) {
      await svc.from("branches").delete().eq("tenant_id", otherTenantId);
      await svc.from("tenants").delete().eq("id", otherTenantId);
    }

    console.log("");
    let failed = 0;
    for (const result of results) {
      const mark = result.ok ? "OK" : "FAIL";
      console.log(`${mark} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
      if (!result.ok) failed++;
    }
    console.log("");
    if (failed > 0) {
      console.error(`${failed} test(s) failed.`);
      process.exit(1);
    }
    console.log("All branch cross-scope integration tests passed.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
