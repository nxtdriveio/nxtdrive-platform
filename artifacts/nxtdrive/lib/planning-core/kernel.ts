import {
  PlanningValidationError,
  type PlanningCandidateInput,
  type PlanningKernelData,
  type PlanningSuggestion,
  type PlanningValidationResult,
} from "@/lib/planning-core/types";
import {
  scoreValidationResult,
  validateScheduleCandidate,
} from "@/lib/planning-core/validation";

export async function canScheduleAppointment(
  input: PlanningCandidateInput,
  data: PlanningKernelData,
): Promise<PlanningValidationResult> {
  return validateScheduleCandidate(input, data);
}

export async function getPlanningPreview(
  input: PlanningCandidateInput,
  data: PlanningKernelData,
): Promise<PlanningValidationResult> {
  return canScheduleAppointment(input, data);
}

type PlanningWriter<TResult> = (input: PlanningCandidateInput) => Promise<TResult>;

async function runValidatedWrite<TResult>(
  input: PlanningCandidateInput,
  data: PlanningKernelData,
  writer: PlanningWriter<TResult>,
): Promise<{ validation: PlanningValidationResult; result: TResult }> {
  const validation = await canScheduleAppointment(input, data);
  if (!validation.allowed) throw new PlanningValidationError(validation);
  return { validation, result: await writer(input) };
}

export async function scheduleAppointment<TResult>(
  input: PlanningCandidateInput,
  data: PlanningKernelData,
  writer: PlanningWriter<TResult>,
): Promise<{ validation: PlanningValidationResult; result: TResult }> {
  return runValidatedWrite(input, data, writer);
}

export async function rescheduleAppointment<TResult>(
  input: PlanningCandidateInput,
  data: PlanningKernelData,
  writer: PlanningWriter<TResult>,
): Promise<{ validation: PlanningValidationResult; result: TResult }> {
  return runValidatedWrite(input, data, writer);
}

export async function unassignAppointment<TResult>(
  input: PlanningCandidateInput,
  writer: PlanningWriter<TResult>,
): Promise<TResult> {
  return writer(input);
}

export async function getPlanningSuggestions(
  candidates: readonly { input: PlanningCandidateInput; data: PlanningKernelData }[],
): Promise<PlanningSuggestion[]> {
  return candidates
    .map(({ input, data }) => {
      const validation = validateScheduleCandidate(input, data);
      return {
        candidate: input,
        validation,
        score: scoreValidationResult(validation),
        reasons: validation.blockingReasons.map((item) => item.message),
        warnings: validation.warnings.map((item) => item.message),
      };
    })
    .sort((left, right) => right.score - left.score);
}
