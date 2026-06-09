import { listBranches, type Branch } from "@/lib/branches/service";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { MemberRole } from "@/lib/types";

const STAFF_ROLES: readonly MemberRole[] = [
  "tenant_admin",
  "franchise_admin",
  "branch_manager",
  "planner",
  "admin_staff",
  "marketing",
  "instructor",
];

type MembershipRow = {
  id: string;
  role: MemberRole;
  branch_scope_type: "all" | "branches";
};

type MembershipBranchRow = {
  membership_id: string;
  branch_id: string;
};

type StudentRow = {
  id: string;
  branch_id: string | null;
  active: boolean | null;
};

type LessonRow = {
  branch_id: string | null;
  student_id: string | null;
  starts_at: string;
  status: string;
};

type LeadRow = {
  branch_id: string | null;
  status: string | null;
  created_at: string | null;
  converted_to_student_at: string | null;
};

type InvoiceRow = {
  branch_id: string | null;
  status: string | null;
  total_cents: number | null;
  paid_at: string | null;
};

export type BranchManagementSnapshot = {
  branch: Branch;
  active_students: number;
  upcoming_lessons_7d: number;
  completed_lessons_30d: number;
  revenue_30d_cents: number;
  open_invoices: number;
  leads_30d: number;
  conversions_30d: number;
  conversion_rate: number | null;
  students_without_next_lesson: number;
  assigned_staff: number;
  watchlist: string[];
};

export type OrganizationManagementOverview = {
  tenant_id: string;
  generated_at: string;
  branch_scope_label: string;
  totals: {
    branches: number;
    active_branches: number;
    active_students: number;
    upcoming_lessons_7d: number;
    completed_lessons_30d: number;
    revenue_30d_cents: number;
    open_invoices: number;
    leads_30d: number;
    conversions_30d: number;
    conversion_rate: number | null;
    students_without_next_lesson: number;
    assigned_staff: number;
  };
  health: {
    branches_without_upcoming_lessons: number;
    branches_without_assigned_staff: number;
    inactive_branches: number;
  };
  branches: BranchManagementSnapshot[];
};

export type BranchManagementOverview = {
  generated_at: string;
  branch_scope_label: string;
  branch: BranchManagementSnapshot;
  organization_average_revenue_30d_cents: number;
  organization_average_upcoming_lessons_7d: number;
  organization_average_conversion_rate: number | null;
};

function startsInWindow(value: string | null | undefined, fromIso: string, toIso: string) {
  if (!value) return false;
  return value >= fromIso && value < toIso;
}

function toIsoDaysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function buildWatchlist(snapshot: Omit<BranchManagementSnapshot, "watchlist" | "branch">) {
  const items: string[] = [];
  if (snapshot.assigned_staff === 0) {
    items.push("Geen medewerkers met vestigingsscope gekoppeld.");
  }
  if (snapshot.upcoming_lessons_7d === 0) {
    items.push("Geen geplande lessen in de komende 7 dagen.");
  }
  if (snapshot.students_without_next_lesson > 0) {
    items.push("Actieve leerlingen zonder vervolgles vragen opvolging.");
  }
  if (snapshot.conversion_rate !== null && snapshot.conversion_rate < 20) {
    items.push("Leadconversie blijft onder 20% in de laatste 30 dagen.");
  }
  return items;
}

async function loadMembershipCoverage(tenantId: string) {
  const service = createServiceRoleClient();
  const membershipsResult = await service
    .from("memberships")
    .select("id, role, branch_scope_type")
    .eq("tenant_id", tenantId)
    .in("role", [...STAFF_ROLES]);

  if (membershipsResult.error) {
    throw new Error(`Medewerkercoverage laden mislukt: ${membershipsResult.error.message}`);
  }

  const memberships = (membershipsResult.data ?? []) as MembershipRow[];
  if (memberships.length === 0) {
    return {
      memberships: [] as MembershipRow[],
      scopedBranchIds: new Map<string, string[]>(),
    };
  }

  const membershipIds = memberships.map((membership) => membership.id);
  const branchScopeResult = await service
    .from("membership_branches")
    .select("membership_id, branch_id")
    .in("membership_id", membershipIds);

  if (branchScopeResult.error) {
    throw new Error(`Vestigingsscopes voor medewerkers laden mislukt: ${branchScopeResult.error.message}`);
  }

  const branchScopeRows = (branchScopeResult.data ?? []) as MembershipBranchRow[];
  const scopedBranchIds = new Map<string, string[]>();
  for (const row of branchScopeRows) {
    const current = scopedBranchIds.get(row.membership_id) ?? [];
    current.push(row.branch_id);
    scopedBranchIds.set(row.membership_id, current);
  }

  return { memberships, scopedBranchIds };
}

export async function loadOrganizationManagementOverview(
  tenantId: string,
  options?: {
    accessibleBranchIds?: string[] | null;
    branchScopeLabel?: string;
  },
): Promise<OrganizationManagementOverview> {
  const service = createServiceRoleClient();
  const nowIso = new Date().toISOString();
  const next7DaysIso = toIsoDaysFromNow(7);
  const last30DaysIso = toIsoDaysFromNow(-30);

  const [branches, studentsResult, lessonsResult, leadsResult, invoicesResult, membershipCoverage] =
    await Promise.all([
      listBranches(service, tenantId),
      service
        .from("students")
        .select("id, branch_id, active")
        .eq("tenant_id", tenantId),
      service
        .from("lessons")
        .select("branch_id, student_id, starts_at, status")
        .eq("tenant_id", tenantId)
        .gte("starts_at", last30DaysIso),
      service
        .from("leads")
        .select("branch_id, status, created_at, converted_to_student_at")
        .eq("tenant_id", tenantId),
      service
        .from("invoices")
        .select("branch_id, status, total_cents, paid_at")
        .eq("tenant_id", tenantId),
      loadMembershipCoverage(tenantId),
    ]);

  if (studentsResult.error) {
    throw new Error(`Leerlingen voor managementdashboard laden mislukt: ${studentsResult.error.message}`);
  }
  if (lessonsResult.error) {
    throw new Error(`Lessen voor managementdashboard laden mislukt: ${lessonsResult.error.message}`);
  }
  if (leadsResult.error) {
    throw new Error(`Leads voor managementdashboard laden mislukt: ${leadsResult.error.message}`);
  }
  if (invoicesResult.error) {
    throw new Error(`Facturen voor managementdashboard laden mislukt: ${invoicesResult.error.message}`);
  }

  const accessibleBranchIds = options?.accessibleBranchIds ?? null;
  const branchSet = accessibleBranchIds ? new Set(accessibleBranchIds) : null;
  const visibleBranches = branchSet
    ? branches.filter((branch) => branchSet.has(branch.id))
    : branches;

  const students = (studentsResult.data ?? []) as StudentRow[];
  const lessons = (lessonsResult.data ?? []) as LessonRow[];
  const leads = (leadsResult.data ?? []) as LeadRow[];
  const invoices = (invoicesResult.data ?? []) as InvoiceRow[];

  const activeStudentsByBranch = new Map<string, string[]>();
  for (const student of students) {
    if (!student.active || !student.branch_id) continue;
    if (branchSet && !branchSet.has(student.branch_id)) continue;
    const current = activeStudentsByBranch.get(student.branch_id) ?? [];
    current.push(student.id);
    activeStudentsByBranch.set(student.branch_id, current);
  }

  const futureLessonStudentsByBranch = new Map<string, Set<string>>();
  const upcomingLessonsByBranch = new Map<string, number>();
  const completedLessonsByBranch = new Map<string, number>();
  for (const lesson of lessons) {
    if (!lesson.branch_id) continue;
    if (branchSet && !branchSet.has(lesson.branch_id)) continue;
    if (startsInWindow(lesson.starts_at, nowIso, next7DaysIso) && lesson.status === "planned") {
      upcomingLessonsByBranch.set(
        lesson.branch_id,
        (upcomingLessonsByBranch.get(lesson.branch_id) ?? 0) + 1,
      );
      if (lesson.student_id) {
        const current = futureLessonStudentsByBranch.get(lesson.branch_id) ?? new Set<string>();
        current.add(lesson.student_id);
        futureLessonStudentsByBranch.set(lesson.branch_id, current);
      }
    }
    if (lesson.status === "completed") {
      completedLessonsByBranch.set(
        lesson.branch_id,
        (completedLessonsByBranch.get(lesson.branch_id) ?? 0) + 1,
      );
    }
  }

  const leads30dByBranch = new Map<string, number>();
  const conversions30dByBranch = new Map<string, number>();
  for (const lead of leads) {
    if (!lead.branch_id) continue;
    if (branchSet && !branchSet.has(lead.branch_id)) continue;
    if (startsInWindow(lead.created_at, last30DaysIso, nowIso)) {
      leads30dByBranch.set(lead.branch_id, (leads30dByBranch.get(lead.branch_id) ?? 0) + 1);
    }
    if (lead.status === "converted" && startsInWindow(lead.converted_to_student_at, last30DaysIso, nowIso)) {
      conversions30dByBranch.set(
        lead.branch_id,
        (conversions30dByBranch.get(lead.branch_id) ?? 0) + 1,
      );
    }
  }

  const revenue30dByBranch = new Map<string, number>();
  const openInvoicesByBranch = new Map<string, number>();
  for (const invoice of invoices) {
    if (!invoice.branch_id) continue;
    if (branchSet && !branchSet.has(invoice.branch_id)) continue;
    if (invoice.status === "open") {
      openInvoicesByBranch.set(
        invoice.branch_id,
        (openInvoicesByBranch.get(invoice.branch_id) ?? 0) + 1,
      );
    }
    if (invoice.status === "paid" && startsInWindow(invoice.paid_at, last30DaysIso, nowIso)) {
      revenue30dByBranch.set(
        invoice.branch_id,
        (revenue30dByBranch.get(invoice.branch_id) ?? 0) + (invoice.total_cents ?? 0),
      );
    }
  }

  const assignedStaffByBranch = new Map<string, number>();
  for (const membership of membershipCoverage.memberships) {
    if (membership.branch_scope_type === "all") {
      for (const branch of visibleBranches) {
        assignedStaffByBranch.set(branch.id, (assignedStaffByBranch.get(branch.id) ?? 0) + 1);
      }
      continue;
    }

    const explicitBranchIds = membershipCoverage.scopedBranchIds.get(membership.id) ?? [];
    for (const branchId of explicitBranchIds) {
      if (branchSet && !branchSet.has(branchId)) continue;
      assignedStaffByBranch.set(branchId, (assignedStaffByBranch.get(branchId) ?? 0) + 1);
    }
  }

  const branchSnapshots = visibleBranches.map((branch) => {
    const activeStudents = activeStudentsByBranch.get(branch.id) ?? [];
    const futureStudents = futureLessonStudentsByBranch.get(branch.id) ?? new Set<string>();
    const leads30d = leads30dByBranch.get(branch.id) ?? 0;
    const conversions30d = conversions30dByBranch.get(branch.id) ?? 0;
    const snapshotWithoutWatchlist = {
      active_students: activeStudents.length,
      upcoming_lessons_7d: upcomingLessonsByBranch.get(branch.id) ?? 0,
      completed_lessons_30d: completedLessonsByBranch.get(branch.id) ?? 0,
      revenue_30d_cents: revenue30dByBranch.get(branch.id) ?? 0,
      open_invoices: openInvoicesByBranch.get(branch.id) ?? 0,
      leads_30d: leads30d,
      conversions_30d: conversions30d,
      conversion_rate: leads30d > 0 ? Math.round((conversions30d / leads30d) * 100) : null,
      students_without_next_lesson: activeStudents.filter((studentId) => !futureStudents.has(studentId)).length,
      assigned_staff: assignedStaffByBranch.get(branch.id) ?? 0,
    };

    return {
      branch,
      ...snapshotWithoutWatchlist,
      watchlist: buildWatchlist(snapshotWithoutWatchlist),
    } satisfies BranchManagementSnapshot;
  });

  const totals = branchSnapshots.reduce(
    (acc, snapshot) => {
      acc.branches += 1;
      if (snapshot.branch.is_active) acc.active_branches += 1;
      acc.active_students += snapshot.active_students;
      acc.upcoming_lessons_7d += snapshot.upcoming_lessons_7d;
      acc.completed_lessons_30d += snapshot.completed_lessons_30d;
      acc.revenue_30d_cents += snapshot.revenue_30d_cents;
      acc.open_invoices += snapshot.open_invoices;
      acc.leads_30d += snapshot.leads_30d;
      acc.conversions_30d += snapshot.conversions_30d;
      acc.students_without_next_lesson += snapshot.students_without_next_lesson;
      acc.assigned_staff += snapshot.assigned_staff;
      return acc;
    },
    {
      branches: 0,
      active_branches: 0,
      active_students: 0,
      upcoming_lessons_7d: 0,
      completed_lessons_30d: 0,
      revenue_30d_cents: 0,
      open_invoices: 0,
      leads_30d: 0,
      conversions_30d: 0,
      students_without_next_lesson: 0,
      assigned_staff: 0,
    },
  );

  return {
    tenant_id: tenantId,
    generated_at: nowIso,
    branch_scope_label: options?.branchScopeLabel ?? "Alle vestigingen",
    totals: {
      ...totals,
      conversion_rate:
        totals.leads_30d > 0 ? Math.round((totals.conversions_30d / totals.leads_30d) * 100) : null,
    },
    health: {
      branches_without_upcoming_lessons: branchSnapshots.filter(
        (snapshot) => snapshot.upcoming_lessons_7d === 0,
      ).length,
      branches_without_assigned_staff: branchSnapshots.filter(
        (snapshot) => snapshot.assigned_staff === 0,
      ).length,
      inactive_branches: branchSnapshots.filter((snapshot) => !snapshot.branch.is_active).length,
    },
    branches: branchSnapshots.sort((left, right) => {
      if (left.revenue_30d_cents !== right.revenue_30d_cents) {
        return right.revenue_30d_cents - left.revenue_30d_cents;
      }
      return right.upcoming_lessons_7d - left.upcoming_lessons_7d;
    }),
  };
}

export async function loadBranchManagementOverview(
  tenantId: string,
  branchId: string,
  options?: {
    branchScopeLabel?: string;
  },
): Promise<BranchManagementOverview> {
  const organization = await loadOrganizationManagementOverview(tenantId, {
    accessibleBranchIds: [branchId],
    branchScopeLabel: options?.branchScopeLabel ?? "Geselecteerde vestiging",
  });
  const fullOrganization = await loadOrganizationManagementOverview(tenantId, {
    branchScopeLabel: options?.branchScopeLabel ?? "Organisatiebreed",
  });

  const branch = organization.branches[0] ?? null;
  if (!branch) {
    throw new Error("Vestiging niet gevonden in deze organisatiescope.");
  }

  const organizationBranchCount = Math.max(fullOrganization.branches.length, 1);
  return {
    generated_at: organization.generated_at,
    branch_scope_label: organization.branch_scope_label,
    branch,
    organization_average_revenue_30d_cents: Math.round(
      fullOrganization.totals.revenue_30d_cents / organizationBranchCount,
    ),
    organization_average_upcoming_lessons_7d: Math.round(
      fullOrganization.totals.upcoming_lessons_7d / organizationBranchCount,
    ),
    organization_average_conversion_rate: fullOrganization.totals.conversion_rate,
  };
}
