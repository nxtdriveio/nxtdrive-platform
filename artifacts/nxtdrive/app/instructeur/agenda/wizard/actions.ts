"use server";

import { revalidatePath } from "next/cache";
import type {
  InstructorStudentSearchResult,
  ResolvedAppointmentContext,
  SmartAppointmentCreateResult,
  SmartAppointmentDraft,
  WizardActionResult,
} from "@/domains/planning/application/smart-appointment-contracts";
import type { InstructorPlanningType } from "@/lib/agenda/types";
import {
  SmartAppointmentServiceError,
  createSmartAppointment as createSmartAppointmentService,
  previewSmartAppointment as previewSmartAppointmentService,
  resolveInstructorAppointmentContext as resolveInstructorAppointmentContextService,
  searchInstructorStudents as searchInstructorStudentsService,
} from "@/lib/instructor/smart-appointment-service";

function failed<T>(error: unknown): WizardActionResult<T> {
  if (error instanceof SmartAppointmentServiceError) {
    return {
      ok: false,
      error: error.safeMessage,
      code: error.code,
    };
  }
  return {
    ok: false,
    error: "Er ging iets mis. Probeer het opnieuw.",
    code: "UNEXPECTED_ERROR",
  };
}

export async function searchInstructorStudents(
  query: string,
): Promise<WizardActionResult<readonly InstructorStudentSearchResult[]>> {
  try {
    return { ok: true, data: await searchInstructorStudentsService(query) };
  } catch (error) {
    return failed(error);
  }
}

export async function resolveInstructorAppointmentContext(input: {
  type: InstructorPlanningType;
  studentId?: string | null;
  selectedDate: string;
  selectedTime: string;
}): Promise<WizardActionResult<ResolvedAppointmentContext>> {
  try {
    return {
      ok: true,
      data: await resolveInstructorAppointmentContextService(input),
    };
  } catch (error) {
    return failed(error);
  }
}

export async function previewSmartAppointment(
  draft: SmartAppointmentDraft,
): Promise<WizardActionResult<ResolvedAppointmentContext>> {
  try {
    return { ok: true, data: await previewSmartAppointmentService(draft) };
  } catch (error) {
    return failed(error);
  }
}

export async function createSmartAppointment(
  draft: SmartAppointmentDraft,
): Promise<WizardActionResult<SmartAppointmentCreateResult>> {
  try {
    const data = await createSmartAppointmentService(draft);
    revalidatePath("/instructeur/agenda");
    return { ok: true, data };
  } catch (error) {
    return failed(error);
  }
}
