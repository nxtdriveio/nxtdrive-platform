import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseZonedDateTime,
  zonedHour,
  zonedMinuteOfDay,
  zonedYmd,
} from "@/lib/datetime";
import {
  getPlanningPreview,
  loadPlanningKernelData,
  type PlanningActorAccess,
  type PlanningScope,
} from "@/lib/planning-core";

type StudentPlanningProfile = {
  id: string;
  full_name: string;
  tenant_id: string;
  branch_id: string | null;
  preferred_dayparts: string[] | null;
};

export type SmartLessonSlotSuggestion = {
  startsAt: string;
  endsAt: string;
  date: string;
  time: string;
  score: number;
  reasons: string[];
  warnings: string[];
};

export type SmartLessonSuggestionResult = {
  suggestions: SmartLessonSlotSuggestion[];
  blockingReasons: string[];
  balanceMinutes: number;
};

export type GenerateSmartLessonSuggestionsInput = {
  tenantId: string;
  studentId: string;
  instructorId: string;
  seedDate: string;
  seedTime: string;
  durationMin: number;
  bufferMin: number;
  timeZone: string;
  actor: PlanningActorAccess;
  scope: PlanningScope;
  branchId?: string | null;
  allowInsufficientCredit?: boolean;
  limit?: number;
};

function daypartForHour(hour: number): "morning" | "afternoon" | "evening" {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function matchesPreferredDaypart(
  date: Date,
  timeZone: string,
  preferred: readonly string[],
): boolean {
  if (preferred.length === 0) return false;
  const daypart = daypartForHour(zonedHour(date, timeZone));
  if (preferred.includes(daypart)) return true;
  const day = new Date(`${zonedYmd(date, timeZone)}T00:00:00Z`).getUTCDay();
  return (day === 0 || day === 6) && preferred.includes("weekend");
}

function localTimeString(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
  }).format(date);
}

function candidateKey(date: Date): string {
  return date.toISOString().slice(0, 16);
}

function parseHm(value: string): { hour: number; minute: number } | null {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function addLocalDays(ymd: string, days: number): string {
  const date = new Date(`${ymd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildCandidateStarts(input: GenerateSmartLessonSuggestionsInput): Date[] {
  const hm = parseHm(input.seedTime) ?? { hour: 9, minute: 0 };
  const base =
    parseZonedDateTime(`${input.seedDate}T${input.seedTime}:00`, input.timeZone) ??
    parseZonedDateTime(`${input.seedDate}T09:00:00`, input.timeZone);
  if (!base) return [];

  const candidates = new Map<string, Date>();
  const add = (date: Date) => {
    if (date.getTime() <= Date.now()) return;
    candidates.set(candidateKey(date), date);
  };

  add(base);
  for (const minutes of [-60, -30, 30, 60, 90]) {
    add(new Date(base.getTime() + minutes * 60_000));
  }

  for (const dayOffset of [0, 1, 2, 3, 4, 5, 7]) {
    const date = addLocalDays(input.seedDate, dayOffset);
    const baseSameTime = parseZonedDateTime(
      `${date}T${String(hm.hour).padStart(2, "0")}:${String(hm.minute).padStart(2, "0")}:00`,
      input.timeZone,
    );
    if (baseSameTime) add(baseSameTime);
    for (const hour of [9, 11, 13, 15, 17]) {
      const start = parseZonedDateTime(
        `${date}T${String(hour).padStart(2, "0")}:00:00`,
        input.timeZone,
      );
      if (start) add(start);
    }
  }

  return Array.from(candidates.values()).sort(
    (a, b) =>
      Math.abs(a.getTime() - base.getTime()) -
        Math.abs(b.getTime() - base.getTime()) ||
      a.getTime() - b.getTime(),
  );
}

function scoreSuggestion(args: {
  start: Date;
  seed: Date | null;
  preferredDayparts: readonly string[];
  timeZone: string;
  warnings: readonly string[];
}): { score: number; reasons: string[] } {
  let score = 100;
  const reasons: string[] = [];

  if (args.seed) {
    const deltaMin = Math.abs(args.start.getTime() - args.seed.getTime()) / 60000;
    score -= Math.min(35, Math.floor(deltaMin / 30) * 4);
    if (deltaMin <= 30) reasons.push("Dicht bij gekozen starttijd");
  }

  if (
    matchesPreferredDaypart(
      args.start,
      args.timeZone,
      args.preferredDayparts,
    )
  ) {
    score += 20;
    reasons.push("Past bij voorkeursmoment leerling");
  }

  const minute = zonedMinuteOfDay(args.start, args.timeZone);
  if (minute >= 9 * 60 && minute <= 17 * 60) {
    score += 8;
    reasons.push("Binnen reguliere planningsuren");
  }

  if (args.warnings.length === 0) {
    score += 8;
    reasons.push("Geen waarschuwingen");
  } else {
    score -= args.warnings.length * 10;
  }

  return { score: Math.max(0, score), reasons };
}

export async function generateSmartLessonSuggestions(
  client: SupabaseClient,
  input: GenerateSmartLessonSuggestionsInput,
): Promise<SmartLessonSuggestionResult> {
  if (!input.studentId || !input.instructorId) {
    return { suggestions: [], blockingReasons: [], balanceMinutes: 0 };
  }
  const durationMin = Number.isFinite(input.durationMin)
    ? input.durationMin
    : 60;
  const bufferMin = Number.isFinite(input.bufferMin) ? input.bufferMin : 0;
  if (durationMin < 15 || bufferMin < 0) {
    return { suggestions: [], blockingReasons: ["Ongeldige lesduur."], balanceMinutes: 0 };
  }

  const [{ data: studentRaw }, { data: balanceRaw }] = await Promise.all([
    client
      .from("students")
      .select("id, full_name, tenant_id, branch_id, preferred_dayparts")
      .eq("id", input.studentId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle(),
    client
      .from("student_credit_balance")
      .select("student_id, balance")
      .eq("tenant_id", input.tenantId)
      .eq("student_id", input.studentId)
      .maybeSingle(),
  ]);

  const student = studentRaw as StudentPlanningProfile | null;
  const balanceMinutes =
    typeof balanceRaw?.balance === "number" ? balanceRaw.balance : 0;
  if (!student) {
    return { suggestions: [], blockingReasons: ["Leerling niet gevonden."], balanceMinutes };
  }
  const insufficientCredit = balanceMinutes < durationMin;
  if (insufficientCredit && !input.allowInsufficientCredit) {
    return {
      suggestions: [],
      blockingReasons: [
        `Onvoldoende tegoed: ${balanceMinutes} min beschikbaar voor ${durationMin} min les.`,
      ],
      balanceMinutes,
    };
  }

  const preferredDayparts = (student.preferred_dayparts ?? []).filter(
    (v): v is string => typeof v === "string",
  );
  const seed = parseZonedDateTime(
    `${input.seedDate}T${input.seedTime}:00`,
    input.timeZone,
  );
  const starts = buildCandidateStarts(input).slice(0, 24);
  const blockingReasons = new Set<string>();
  const suggestions: SmartLessonSlotSuggestion[] = [];

  for (const start of starts) {
    const end = new Date(start.getTime() + (durationMin + bufferMin) * 60_000);
    const planningInput = {
      actor: input.actor,
      scope: input.scope,
      entityType: "lesson" as const,
      entityId: null,
      tenantId: input.tenantId,
      branchId: input.branchId ?? student.branch_id,
      studentId: input.studentId,
      instructorId: input.instructorId,
      vehicleId: null,
      startAt: start,
      endAt: end,
      pickupServiceAreaId: null,
    };
    const kernelData = await loadPlanningKernelData(client, planningInput);
    const validation = await getPlanningPreview(planningInput, kernelData);
    if (!validation.allowed) {
      for (const reason of validation.blockingReasons) {
        blockingReasons.add(reason.message);
      }
      continue;
    }

    const warnings = validation.warnings.map((warning) => warning.message);
    if (insufficientCredit) {
      warnings.push(
        `Onvoldoende tegoed: ${balanceMinutes} min beschikbaar voor ${durationMin} min les. Dit moment wordt als aanvraag verstuurd.`,
      );
    }
    const { score, reasons } = scoreSuggestion({
      start,
      seed,
      preferredDayparts,
      timeZone: input.timeZone,
      warnings,
    });
    suggestions.push({
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      date: zonedYmd(start, input.timeZone),
      time: localTimeString(start, input.timeZone),
      score,
      reasons,
      warnings,
    });
  }

  suggestions.sort((a, b) => b.score - a.score || a.startsAt.localeCompare(b.startsAt));

  return {
    suggestions: suggestions.slice(0, input.limit ?? 5),
    blockingReasons: Array.from(blockingReasons).slice(0, 4),
    balanceMinutes,
  };
}
