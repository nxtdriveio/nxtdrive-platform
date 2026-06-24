import type { SupabaseClient } from "@supabase/supabase-js";
import { listBranches, type Branch } from "@/lib/branches/service";
import { loadTenantInstructors } from "@/lib/availability/service";
import type {
  PlanningActorAccess,
  PlanningScope,
} from "@/lib/planning-core";
import {
  generateSmartLessonSuggestions,
  type SmartLessonSlotSuggestion,
} from "@/lib/lesson-planning/smart-scheduling";

type StudentRoutingProfile = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
};

type LessonCapacityRow = {
  branch_id: string | null;
};

type CandidateBranch = Pick<Branch, "name" | "city"> & {
  id: string | null;
};

export type BranchCapacityPressure = "rustig" | "normaal" | "druk" | "kritiek";

export type MultiBranchLessonSuggestion = SmartLessonSlotSuggestion & {
  branchId: string | null;
  branchName: string;
  branchCity: string | null;
  instructorId: string;
  instructorName: string;
  branchUpcomingLessons7d: number;
  branchCapacityPressure: BranchCapacityPressure;
  routingReasons: string[];
};

export type MultiBranchLessonSuggestionResult = {
  suggestions: MultiBranchLessonSuggestion[];
  blockingReasons: string[];
  balanceMinutes: number;
  branchCount: number;
  instructorCount: number;
  scopeLabel: string;
};

export type GenerateMultiBranchLessonSuggestionsInput = {
  tenantId: string;
  studentId: string;
  seedDate: string;
  seedTime: string;
  durationMin: number;
  bufferMin: number;
  timeZone: string;
  actor: PlanningActorAccess;
  allowedBranchIds: readonly string[] | null;
  preferredInstructorId?: string | null;
  preferredBranchId?: string | null;
  allowCrossBranch?: boolean;
  allowInsufficientCredit?: boolean;
  limit?: number;
};

function scopeForTenantBranch(
  tenantId: string,
  branchId: string | null | undefined,
): PlanningScope {
  return branchId
    ? { type: "branch", tenantId, branchId }
    : { type: "tenant", tenantId };
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function pressureForCount(count: number): {
  pressure: BranchCapacityPressure;
  scoreBoost: number;
  label: string;
} {
  if (count >= 42) {
    return {
      pressure: "kritiek",
      scoreBoost: -18,
      label: "Vestiging bijna vol",
    };
  }
  if (count >= 28) {
    return { pressure: "druk", scoreBoost: -8, label: "Drukke vestiging" };
  }
  if (count >= 12) {
    return {
      pressure: "normaal",
      scoreBoost: 4,
      label: "Normale vestigingscapaciteit",
    };
  }
  return {
    pressure: "rustig",
    scoreBoost: 10,
    label: "Veel vestigingsruimte",
  };
}

function branchLabel(branch: Pick<CandidateBranch, "name" | "city"> | null): string {
  if (!branch) return "Tenantbreed";
  return branch.city ? `${branch.name} (${branch.city})` : branch.name;
}

function scopeLabel(allowedBranchIds: readonly string[] | null): string {
  if (!allowedBranchIds) return "Alle vestigingen";
  if (allowedBranchIds.length === 1) return "1 vestiging";
  return `${allowedBranchIds.length} vestigingen`;
}

function uniqueReasons(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

async function loadBranchCapacity(
  client: SupabaseClient,
  tenantId: string,
  branchIds: readonly string[],
): Promise<Map<string, number>> {
  if (branchIds.length === 0) return new Map();
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = addDays(start, 7);
  const { data, error } = await client
    .from("lessons")
    .select("branch_id")
    .eq("tenant_id", tenantId)
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString())
    .in("branch_id", [...branchIds])
    .neq("status", "cancelled");
  if (error) throw new Error(`loadBranchCapacity: ${error.message}`);

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as LessonCapacityRow[]) {
    if (!row.branch_id) continue;
    counts.set(row.branch_id, (counts.get(row.branch_id) ?? 0) + 1);
  }
  return counts;
}

export async function generateMultiBranchLessonSuggestions(
  client: SupabaseClient,
  input: GenerateMultiBranchLessonSuggestionsInput,
): Promise<MultiBranchLessonSuggestionResult> {
  if (!input.studentId) {
    return {
      suggestions: [],
      blockingReasons: [],
      balanceMinutes: 0,
      branchCount: 0,
      instructorCount: 0,
      scopeLabel: scopeLabel(input.allowedBranchIds),
    };
  }

  const { data: studentRaw, error: studentError } = await client
    .from("students")
    .select("id, tenant_id, branch_id")
    .eq("id", input.studentId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (studentError) throw new Error(`loadStudentRoutingProfile: ${studentError.message}`);

  const student = studentRaw as StudentRoutingProfile | null;
  if (!student) {
    return {
      suggestions: [],
      blockingReasons: ["Leerling niet gevonden."],
      balanceMinutes: 0,
      branchCount: 0,
      instructorCount: 0,
      scopeLabel: scopeLabel(input.allowedBranchIds),
    };
  }

  const allBranches = await listBranches(client, input.tenantId, {
    activeOnly: true,
  });
  const allowedBranchSet = input.allowedBranchIds
    ? new Set(input.allowedBranchIds)
    : null;
  const visibleBranches: CandidateBranch[] = allBranches.filter(
    (branch) => !allowedBranchSet || allowedBranchSet.has(branch.id),
  );
  if (visibleBranches.length === 0 && !input.allowedBranchIds) {
    visibleBranches.push({ id: null, name: "Tenantbreed", city: null });
  }
  const visibleBranchIds = visibleBranches
    .map((branch) => branch.id)
    .filter((id): id is string => Boolean(id));
  const capacityByBranch = await loadBranchCapacity(
    client,
    input.tenantId,
    visibleBranchIds,
  );

  const preferredBranchId = input.preferredBranchId ?? student.branch_id;
  const canConsiderCrossBranch = Boolean(input.allowCrossBranch);
  const candidateBranches = visibleBranches.filter((branch) => {
    if (!preferredBranchId) return true;
    if (branch.id && branch.id === preferredBranchId) return true;
    return canConsiderCrossBranch;
  });
  const effectiveBranches =
    candidateBranches.length > 0
      ? candidateBranches
      : visibleBranches.filter((branch) => branch.id === student.branch_id);

  const blockingReasons = new Set<string>();
  const suggestions: MultiBranchLessonSuggestion[] = [];
  let balanceMinutes = 0;
  let instructorCount = 0;

  for (const branch of effectiveBranches) {
    const instructors = await loadTenantInstructors(input.tenantId, {
      branchIds: branch.id ? [branch.id] : null,
    });
    const orderedInstructors = input.preferredInstructorId
      ? instructors.sort((a, b) => {
          if (a.id === input.preferredInstructorId) return -1;
          if (b.id === input.preferredInstructorId) return 1;
          return a.full_name.localeCompare(b.full_name, "nl");
        })
      : instructors;
    instructorCount += orderedInstructors.length;

    const capacity = branch.id ? (capacityByBranch.get(branch.id) ?? 0) : 0;
    const pressure = pressureForCount(capacity);

    for (const instructor of orderedInstructors.slice(0, 8)) {
      const result = await generateSmartLessonSuggestions(client, {
        tenantId: input.tenantId,
        studentId: input.studentId,
        instructorId: instructor.id,
        seedDate: input.seedDate,
        seedTime: input.seedTime,
        durationMin: input.durationMin,
        bufferMin: input.bufferMin,
        timeZone: input.timeZone,
        actor: input.actor,
        scope: scopeForTenantBranch(input.tenantId, branch.id),
        branchId: branch.id,
        allowInsufficientCredit: input.allowInsufficientCredit,
        limit: 2,
      });
      balanceMinutes = Math.max(balanceMinutes, result.balanceMinutes);
      for (const reason of result.blockingReasons) {
        blockingReasons.add(reason);
      }
      for (const suggestion of result.suggestions) {
        const crossBranch = Boolean(
          student.branch_id && branch.id && student.branch_id !== branch.id,
        );
        suggestions.push({
          ...suggestion,
          score: Math.max(0, suggestion.score + pressure.scoreBoost),
          branchId: branch.id,
          branchName: branch.name,
          branchCity: branch.city,
          instructorId: instructor.id,
          instructorName: instructor.full_name,
          branchUpcomingLessons7d: capacity,
          branchCapacityPressure: pressure.pressure,
          routingReasons: uniqueReasons([
            `Vestiging: ${branchLabel(branch)}`,
            `Instructeur: ${instructor.full_name}`,
            pressure.label,
            crossBranch ? "Cross-branch voorstel" : "",
          ]),
          warnings: uniqueReasons([
            ...suggestion.warnings,
            crossBranch
              ? "Deze suggestie gebruikt een andere vestiging dan de leerling. Controleer overdracht of vestigingswijziging voordat je plant."
              : "",
          ]),
        });
      }
    }
  }

  suggestions.sort(
    (a, b) =>
      b.score - a.score ||
      a.startsAt.localeCompare(b.startsAt) ||
      a.branchName.localeCompare(b.branchName, "nl") ||
      a.instructorName.localeCompare(b.instructorName, "nl"),
  );

  const deduped = new Map<string, MultiBranchLessonSuggestion>();
  for (const suggestion of suggestions) {
    const key = `${suggestion.startsAt}:${suggestion.instructorId}:${suggestion.branchId ?? "tenant"}`;
    if (!deduped.has(key)) deduped.set(key, suggestion);
  }

  return {
    suggestions: Array.from(deduped.values()).slice(0, input.limit ?? 8),
    blockingReasons: Array.from(blockingReasons).slice(0, 6),
    balanceMinutes,
    branchCount: effectiveBranches.length,
    instructorCount,
    scopeLabel: scopeLabel(input.allowedBranchIds),
  };
}
