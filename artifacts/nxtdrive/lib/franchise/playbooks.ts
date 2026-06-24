import { createServiceRoleClient } from "@/lib/supabase/service";

export type FranchisePlaybookProgramStatus = "draft" | "active" | "archived";
export type FranchisePlaybookAssignmentStatus =
  | "not_started"
  | "in_progress"
  | "blocked"
  | "completed"
  | "declined";
export type FranchisePlaybookStepProgressStatus =
  | "not_started"
  | "in_progress"
  | "blocked"
  | "completed"
  | "skipped";

export type FranchisePlaybookStep = {
  id: string;
  program_id: string;
  position: number;
  title: string;
  description: string;
  step_type: string;
  evidence_hint: string | null;
  is_required: boolean;
};

export type FranchisePlaybookAssignment = {
  id: string;
  program_id: string;
  franchisee_tenant_id: string;
  franchisee_name: string;
  status: FranchisePlaybookAssignmentStatus;
  owner_label: string;
  due_date: string | null;
  note: string | null;
  declined_reason: string | null;
  completed_at: string | null;
  progress_percent: number;
  completed_steps: number;
  total_steps: number;
};

export type FranchisePlaybookProgram = {
  id: string;
  franchise_root_tenant_id: string;
  name: string;
  category: string;
  objective: string;
  owner_label: string;
  cadence: string;
  target_audience: string;
  default_due_days: number;
  status: FranchisePlaybookProgramStatus;
  created_at: string;
  updated_at: string;
  steps: FranchisePlaybookStep[];
  assignments: FranchisePlaybookAssignment[];
};

export type FranchisePlaybookOverview = {
  programs: FranchisePlaybookProgram[];
  franchisees: Array<{ id: string; name: string; slug: string }>;
  stats: {
    programsTotal: number;
    activePrograms: number;
    assignmentsTotal: number;
    completedAssignments: number;
    blockedAssignments: number;
    completionRate: number;
  };
};

type ProgramRow = Omit<
  FranchisePlaybookProgram,
  "steps" | "assignments"
>;

type AssignmentRow = Omit<
  FranchisePlaybookAssignment,
  "franchisee_name" | "progress_percent" | "completed_steps" | "total_steps"
> & {
  franchise_root_tenant_id: string;
};

type ProgressRow = {
  assignment_id: string;
  step_id: string;
  status: FranchisePlaybookStepProgressStatus;
};

export async function loadFranchisePlaybookOverview(
  franchiseRootTenantId: string,
): Promise<FranchisePlaybookOverview> {
  const service = createServiceRoleClient();
  const [
    { data: programs, error: programsError },
    { data: franchisees, error: franchiseesError },
  ] = await Promise.all([
    service
      .from("franchise_playbook_programs")
      .select(
        "id, franchise_root_tenant_id, name, category, objective, owner_label, cadence, target_audience, default_due_days, status, created_at, updated_at",
      )
      .eq("franchise_root_tenant_id", franchiseRootTenantId)
      .order("status", { ascending: true })
      .order("created_at", { ascending: false }),
    service
      .from("tenants")
      .select("id, name, slug")
      .eq("parent_tenant_id", franchiseRootTenantId)
      .order("name"),
  ]);

  if (programsError) {
    throw new Error(`Playbookprogramma's laden mislukt: ${programsError.message}`);
  }
  if (franchiseesError) {
    throw new Error(`Franchisees laden mislukt: ${franchiseesError.message}`);
  }

  const programRows = (programs ?? []) as ProgramRow[];
  const programIds = programRows.map((program) => program.id);

  const [stepsResult, assignmentsResult] =
    programIds.length === 0
      ? [{ data: [], error: null }, { data: [], error: null }]
      : await Promise.all([
          service
            .from("franchise_playbook_steps")
            .select(
              "id, program_id, position, title, description, step_type, evidence_hint, is_required",
            )
            .in("program_id", programIds)
            .order("position", { ascending: true }),
          service
            .from("franchise_playbook_assignments")
            .select(
              "id, program_id, franchise_root_tenant_id, franchisee_tenant_id, status, owner_label, due_date, note, declined_reason, completed_at",
            )
            .eq("franchise_root_tenant_id", franchiseRootTenantId)
            .in("program_id", programIds)
            .order("due_date", { ascending: true }),
        ]);

  if (stepsResult.error) {
    throw new Error(`Playbookstappen laden mislukt: ${stepsResult.error.message}`);
  }
  if (assignmentsResult.error) {
    throw new Error(`Playbooktoewijzingen laden mislukt: ${assignmentsResult.error.message}`);
  }

  const assignments = (assignmentsResult.data ?? []) as AssignmentRow[];
  const assignmentIds = assignments.map((assignment) => assignment.id);
  const { data: progressRows, error: progressError } =
    assignmentIds.length === 0
      ? { data: [], error: null }
      : await service
          .from("franchise_playbook_step_progress")
          .select("assignment_id, step_id, status")
          .in("assignment_id", assignmentIds);

  if (progressError) {
    throw new Error(`Playbookvoortgang laden mislukt: ${progressError.message}`);
  }

  const franchiseeNameById = new Map(
    ((franchisees ?? []) as Array<{ id: string; name: string | null }>).map(
      (franchisee) => [franchisee.id, franchisee.name ?? "Franchisee"],
    ),
  );
  const stepsByProgram = new Map<string, FranchisePlaybookStep[]>();
  for (const step of (stepsResult.data ?? []) as FranchisePlaybookStep[]) {
    const current = stepsByProgram.get(step.program_id) ?? [];
    current.push(step);
    stepsByProgram.set(step.program_id, current);
  }

  const progressByAssignment = new Map<string, ProgressRow[]>();
  for (const row of (progressRows ?? []) as ProgressRow[]) {
    const current = progressByAssignment.get(row.assignment_id) ?? [];
    current.push(row);
    progressByAssignment.set(row.assignment_id, current);
  }

  const assignmentsByProgram = new Map<string, FranchisePlaybookAssignment[]>();
  for (const assignment of assignments) {
    const totalSteps = stepsByProgram.get(assignment.program_id)?.length ?? 0;
    const completedSteps = (progressByAssignment.get(assignment.id) ?? []).filter(
      (row) => row.status === "completed" || row.status === "skipped",
    ).length;
    const mapped: FranchisePlaybookAssignment = {
      ...assignment,
      franchisee_name:
        franchiseeNameById.get(assignment.franchisee_tenant_id) ?? "Franchisee",
      total_steps: totalSteps,
      completed_steps: completedSteps,
      progress_percent:
        totalSteps === 0 ? 0 : Math.round((completedSteps / totalSteps) * 100),
    };
    const current = assignmentsByProgram.get(assignment.program_id) ?? [];
    current.push(mapped);
    assignmentsByProgram.set(assignment.program_id, current);
  }

  const mappedPrograms = programRows.map((program) => ({
    ...program,
    steps: stepsByProgram.get(program.id) ?? [],
    assignments: assignmentsByProgram.get(program.id) ?? [],
  }));

  const assignmentsTotal = assignments.length;
  const completedAssignments = assignments.filter(
    (assignment) => assignment.status === "completed",
  ).length;

  return {
    programs: mappedPrograms,
    franchisees: ((franchisees ?? []) as Array<{
      id: string;
      name: string | null;
      slug: string | null;
    }>).map((franchisee) => ({
      id: franchisee.id,
      name: franchisee.name ?? "Franchisee",
      slug: franchisee.slug ?? franchisee.id,
    })),
    stats: {
      programsTotal: mappedPrograms.length,
      activePrograms: mappedPrograms.filter((program) => program.status === "active")
        .length,
      assignmentsTotal,
      completedAssignments,
      blockedAssignments: assignments.filter((assignment) => assignment.status === "blocked")
        .length,
      completionRate:
        assignmentsTotal === 0
          ? 0
          : Math.round((completedAssignments / assignmentsTotal) * 100),
    },
  };
}
