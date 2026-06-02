// ---------------------------------------------------------------------------
// Task #101 — Slimme examenkandidaat-voorstellen. Given an available exam /
// interim-test moment in the agenda, rank the existing STUDENTS who fit it best,
// CBR-aware. Purely advisory: nothing is booked or invited here (a separate
// follow-up, "Examenmoment uitnodigen met één klik", handles acting on it).
//
// Two layers, mirroring the slot-student engine (candidates.ts):
//   1. Pure, synchronous eligibility (evaluateExamEligibility) + scoring
//      (scoreExamCandidate). Unit-tested with no DB / network.
//   2. DB orchestration (suggestExamCandidatesForSlot) that batches the CBR
//      overview, balances and busy intervals, derives eligibility, loads
//      readiness only for the eligible pool, scores and ranks.
//
// Hard CBR preconditions gate eligibility: theorie behaald, machtiging
// ontvangen, gezondheidsverklaring geregeld (when required) and voldoende
// tegoed. A student who misses one is shown as BLOCKED with the reason(s) — not
// silently dropped — so the planner sees who is close. Students who are simply
// irrelevant (already passed, already have an exam/toets planned, or busy over
// the slot) are omitted entirely. Route/travel intelligence is deliberately NOT
// used: an exam happens at a fixed CBR test centre, so pickup-route reasoning
// does not apply. Daypart availability still counts as a soft preference.
// ---------------------------------------------------------------------------
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReadinessAdvice } from "@workspace/leskaart";
import type { AgendaAppointmentResult } from "@/lib/agenda/types";
import type { CbrExamStatus } from "@/lib/cbr/derive";
import { loadTenantCbrOverview } from "@/lib/cbr/data";
import { loadStudentReadiness } from "@/lib/skills/readiness-data";
import { slotMatchesDayparts, type SlotInfo } from "./candidates";
import { loadLessonPlanPolicy, type LessonPlanPolicy } from "./policy";
import type {
  BlockedExamCandidate,
  CandidateScoreFactor,
  ExamCandidate,
  ExamSlotCandidates,
} from "./types";

// The two agenda appointment types that represent a CBR moment a student can be
// proposed for.
export type ExamSlotType = "exam" | "interim_test";

// ---------------------------------------------------------------------------
// Layer 1 — pure eligibility + scoring.
// ---------------------------------------------------------------------------

// Everything the engine needs about one student, pre-loaded by the caller.
export type ExamCandidateInput = {
  studentId: string;
  fullName: string;
  balanceMin: number;
  preferredDayparts: string[]; // may be empty
  // CBR preconditions.
  theorieBehaald: boolean;
  machtigingOntvangen: boolean;
  gezondheidsverklaringVereist: boolean;
  gezondheidsverklaringGeregeld: boolean;
  // Derived CBR exam status + last completed exam result.
  examStatus: CbrExamStatus;
  lastExamResult: AgendaAppointmentResult | null;
  // True when the student already has a future planned moment of the slot's type
  // (an exam for an exam slot, a toets for an interim-test slot).
  hasUpcomingExam: boolean;
  // L1 readiness verdict + count of critical safety skills still below niveau 8
  // ("aandachtspunten") + the 0..100 readiness score. null/0 when readiness has
  // not been evaluated (e.g. no skill data yet).
  readinessAdvice: ReadinessAdvice | null;
  criticalBelowThreshold: number;
  readinessPct?: number | null;
};

export type ExamEligibility =
  // Eligible: passes every hard CBR precondition → gets scored + ranked.
  | { kind: "eligible" }
  // Irrelevant for this slot → omitted entirely (not shown anywhere).
  | { kind: "excluded" }
  // Misses one or more fixable CBR preconditions → shown with reason(s).
  | { kind: "blocked"; blockers: string[] };

/**
 * Hard eligibility gate for an exam moment (pure).
 *
 *  - excluded  : already passed, already has a moment of this type planned, or
 *                busy over the slot → not a meaningful suggestion at all.
 *  - blocked   : a CBR precondition (theorie / machtiging / gezondheidsverklaring
 *                / tegoed) is not met → surfaced with the Dutch reason(s).
 *  - eligible  : everything is in order → scored + ranked.
 */
export function evaluateExamEligibility(
  c: ExamCandidateInput,
  slot: SlotInfo,
  alreadyBusy: boolean,
): ExamEligibility {
  // Irrelevant — never surfaced.
  if (alreadyBusy) return { kind: "excluded" };
  if (c.examStatus === "geslaagd") return { kind: "excluded" };
  if (c.hasUpcomingExam) return { kind: "excluded" };

  // Hard CBR preconditions — surfaced as blockers when unmet.
  const blockers: string[] = [];
  if (!c.theorieBehaald) blockers.push("Theorie nog niet behaald");
  if (!c.machtigingOntvangen) blockers.push("Machtiging nog niet ontvangen");
  if (c.gezondheidsverklaringVereist && !c.gezondheidsverklaringGeregeld) {
    blockers.push("Gezondheidsverklaring nog niet geregeld");
  }
  if (c.balanceMin < slot.durationMin) blockers.push("Onvoldoende tegoed");

  if (blockers.length > 0) return { kind: "blocked", blockers };
  return { kind: "eligible" };
}

/**
 * Score a single (already-eligible) exam candidate. Pure + synchronous; each
 * matching criterion pushes an explainable factor. Higher = better fit for the
 * exam moment.
 */
export function scoreExamCandidate(
  c: ExamCandidateInput,
  slot: SlotInfo,
  policy: LessonPlanPolicy,
): { score: number; factors: CandidateScoreFactor[] } {
  const factors: CandidateScoreFactor[] = [];

  // Readiness verdict — the central exam-fit signal.
  if (c.readinessAdvice === "examenwaardig") {
    factors.push({
      key: "exam_ready",
      points: policy.exam_ready_points,
      label: "Examenwaardig",
    });
  } else if (c.readinessAdvice === "bijna_examenrijp") {
    factors.push({
      key: "exam_near_ready",
      points: policy.exam_near_ready_points,
      label: "Bijna examenrijp",
    });
  } else if (c.readinessAdvice === "niet_examenrijp") {
    factors.push({
      key: "exam_not_ready",
      points: policy.exam_not_ready_points,
      label: "Nog niet examenrijp",
    });
  }

  // Urgency — failed a previous exam and needs a re-exam (herexamen).
  if (c.lastExamResult === "failed") {
    factors.push({
      key: "exam_failed_before",
      points: policy.exam_failed_before_points,
      label: "Herexamen nodig",
    });
  }

  // Urgency — (near-)ready but no moment planned yet → has been waiting.
  if (
    !c.hasUpcomingExam &&
    (c.readinessAdvice === "examenwaardig" ||
      c.readinessAdvice === "bijna_examenrijp")
  ) {
    factors.push({
      key: "exam_waiting",
      points: policy.exam_waiting_points,
      label: "Klaar, nog geen examen gepland",
    });
  }

  // Availability — slot daypart matches a preferred daypart.
  if (slotMatchesDayparts(slot.startMs, c.preferredDayparts)) {
    factors.push({
      key: "exam_preferred_daypart",
      points: policy.exam_preferred_daypart_points,
      label: "Voorkeursdagdeel",
    });
  }

  // Attention points — critical safety skills still below threshold.
  if (c.criticalBelowThreshold > 0) {
    factors.push({
      key: "exam_critical_gap",
      points: policy.exam_critical_gap_points,
      label: "Kritieke aandachtspunten open",
    });
  }

  const score = factors.reduce((sum, f) => sum + f.points, 0);
  return { score, factors };
}

function reasonFromFactors(
  factors: CandidateScoreFactor[],
  fallback = "Voldoet aan alle examenvoorwaarden.",
): string {
  if (factors.length === 0) return fallback;
  return factors.map((f) => f.label).join(" · ");
}

// ---------------------------------------------------------------------------
// Layer 2 — DB orchestration.
// ---------------------------------------------------------------------------

export type SuggestExamCandidatesArgs = {
  tenantId: string;
  startsAt: string;
  durationMin: number;
  // Which kind of moment the slot represents.
  slotType: ExamSlotType;
  // The student already assigned to this moment (excluded from suggestions).
  excludeStudentId?: string | null;
  // The number of eligible candidates / blocked students to return.
  limit?: number;
  blockedLimit?: number;
};

/**
 * Suggest the best-fit students for an available exam / interim-test moment.
 * Read-only: nothing is booked or invited. Returns eligible candidates ranked
 * best-first plus blocked students (with reasons) ordered closest-to-ready.
 */
export async function suggestExamCandidatesForSlot(
  client: SupabaseClient,
  args: SuggestExamCandidatesArgs,
): Promise<ExamSlotCandidates> {
  const empty: ExamSlotCandidates = { eligible: [], blocked: [] };

  const startMs = Date.parse(args.startsAt);
  if (Number.isNaN(startMs)) return empty;
  const durationMin = args.durationMin;
  if (!Number.isFinite(durationMin) || durationMin < 15) return empty;
  const endMs = startMs + durationMin * 60 * 1000;
  const slot: SlotInfo = { startMs, endMs, durationMin };
  const limit = args.limit ?? 6;
  const blockedLimit = args.blockedLimit ?? 12;
  const { tenantId, slotType } = args;
  const excludeStudentId = args.excludeStudentId ?? null;

  const now = new Date();
  const policy = await loadLessonPlanPolicy(client, tenantId);

  // --- Batched per-student CBR signals (preconditions + derived status) ---
  const cbr = await loadTenantCbrOverview(client, tenantId, now);
  const rows = cbr.filter((r) => r.studentId !== excludeStudentId);
  if (rows.length === 0) return empty;
  const studentIds = rows.map((r) => r.studentId);

  // --- Preferred dayparts (not in the CBR overview) ----------------------
  const { data: studentRows } = await client
    .from("students")
    .select("id, preferred_dayparts")
    .eq("tenant_id", tenantId)
    .in("id", studentIds);
  const daypartsByStudent = new Map<string, string[]>();
  for (const s of studentRows ?? []) {
    const dp = ((s as { preferred_dayparts: string[] | null })
      .preferred_dayparts ?? []).filter(
      (x): x is string => typeof x === "string",
    );
    daypartsByStudent.set((s as { id: string }).id, dp);
  }

  // --- Balances ----------------------------------------------------------
  const { data: balancesRaw } = await client
    .from("student_credit_balance")
    .select("student_id, balance")
    .eq("tenant_id", tenantId);
  const balanceByStudent = new Map<string, number>();
  for (const b of balancesRaw ?? []) {
    balanceByStudent.set(b.student_id as string, (b.balance as number) ?? 0);
  }

  // --- Students already booked over the slot (excluded) ------------------
  const slotStartIso = new Date(startMs).toISOString();
  const slotEndIso = new Date(endMs).toISOString();
  const busyStudentIds = new Set<string>();
  const { data: overlapLessons } = await client
    .from("lessons")
    .select("student_id")
    .eq("tenant_id", tenantId)
    .eq("status", "planned")
    .lt("starts_at", slotEndIso)
    .gt("ends_at", slotStartIso);
  for (const l of overlapLessons ?? []) {
    if (l.student_id) busyStudentIds.add(l.student_id as string);
  }
  const { data: overlapAppts } = await client
    .from("agenda_appointments")
    .select("student_id")
    .eq("tenant_id", tenantId)
    .eq("status", "planned")
    .not("student_id", "is", null)
    .lt("starts_at", slotEndIso)
    .gt("ends_at", slotStartIso);
  for (const a of overlapAppts ?? []) {
    if (a.student_id) busyStudentIds.add(a.student_id as string);
  }

  // --- Build inputs + split eligible / blocked ---------------------------
  type Pending = { input: ExamCandidateInput };
  const eligiblePending: Pending[] = [];
  const blocked: BlockedExamCandidate[] = [];

  for (const r of rows) {
    const sid = r.studentId;
    const hasUpcomingExam =
      slotType === "exam"
        ? r.derived.nextExamAt !== null
        : r.derived.nextToetsAt !== null;
    const input: ExamCandidateInput = {
      studentId: sid,
      fullName: r.fullName,
      balanceMin: balanceByStudent.get(sid) ?? 0,
      preferredDayparts: daypartsByStudent.get(sid) ?? [],
      theorieBehaald: r.preconditions.theorieBehaald,
      machtigingOntvangen: r.preconditions.machtigingStatus === "ontvangen",
      gezondheidsverklaringVereist:
        r.preconditions.gezondheidsverklaringVereist,
      gezondheidsverklaringGeregeld:
        r.preconditions.gezondheidsverklaringGeregeld,
      examStatus: r.derived.examStatus,
      lastExamResult: r.derived.lastExamResult,
      hasUpcomingExam,
      readinessAdvice: null, // loaded for the eligible pool below
      criticalBelowThreshold: 0,
    };

    const verdict = evaluateExamEligibility(input, slot, busyStudentIds.has(sid));
    if (verdict.kind === "excluded") continue;
    if (verdict.kind === "blocked") {
      blocked.push({
        student_id: sid,
        full_name: r.fullName,
        blockers: verdict.blockers,
      });
      continue;
    }
    eligiblePending.push({ input });
  }

  // --- Readiness for the eligible pool (the central exam-fit signal) ------
  // Loaded only for eligible students (already small after the CBR gates).
  await Promise.all(
    eligiblePending.map(async (p) => {
      try {
        const readiness = await loadStudentReadiness(
          client,
          tenantId,
          p.input.studentId,
        );
        p.input.readinessAdvice = readiness.advice;
        p.input.criticalBelowThreshold = readiness.criticalBelowThreshold;
        p.input.readinessPct = readiness.readinessPct;
      } catch {
        // Readiness is a refinement; ignore failures (e.g. no skill data yet).
      }
    }),
  );

  const eligible: ExamCandidate[] = eligiblePending.map((p) => {
    const { score, factors } = scoreExamCandidate(p.input, slot, policy);
    return {
      student_id: p.input.studentId,
      full_name: p.input.fullName,
      balance_min: p.input.balanceMin,
      readiness_advice: p.input.readinessAdvice,
      readiness_pct: p.input.readinessPct ?? null,
      exam_status: p.input.examStatus,
      score,
      factors,
      reason: reasonFromFactors(factors),
    };
  });

  eligible.sort(
    (a, b) => b.score - a.score || a.full_name.localeCompare(b.full_name),
  );
  // Blocked: closest-to-ready first (fewest unmet preconditions), then name.
  blocked.sort(
    (a, b) =>
      a.blockers.length - b.blockers.length ||
      a.full_name.localeCompare(b.full_name),
  );

  return {
    eligible: eligible.slice(0, limit),
    blocked: blocked.slice(0, blockedLimit),
  };
}
