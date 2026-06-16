"use server";

import { redirect } from "next/navigation";
import {
  setRisModuleTestAction,
  type RisModuleTestResult,
  type RisModuleTestType,
} from "@/lib/ris/actions";

const TEST_TYPES = [
  "instructor_test_1",
  "instructor_test_2",
  "ris_test_cbr",
  "ris_exam_cbr",
] as const satisfies readonly RisModuleTestType[];

const TEST_RESULTS = [
  "planned",
  "passed",
  "failed",
  "needs_repeat",
  "cancelled",
] as const satisfies readonly RisModuleTestResult[];

function text(value: FormDataEntryValue | null, maxLength = 1000): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw ? raw.slice(0, maxLength) : null;
}

function redirectPath(value: FormDataEntryValue | null): string {
  const raw = text(value, 200) ?? "/backoffice/ris";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/backoffice/ris";
}

function moduleNumber(value: FormDataEntryValue | null): 1 | 2 | 3 | 4 {
  const parsed = Number(value);
  if (parsed === 1 || parsed === 2 || parsed === 3 || parsed === 4) return parsed;
  throw new Error("Kies module 1 t/m 4.");
}

function testType(value: FormDataEntryValue | null): RisModuleTestType {
  const raw = text(value, 80);
  if (raw && (TEST_TYPES as readonly string[]).includes(raw)) {
    return raw as RisModuleTestType;
  }
  throw new Error("Kies een geldige RIS-toets.");
}

function testResult(value: FormDataEntryValue | null): RisModuleTestResult {
  const raw = text(value, 80);
  if (raw && (TEST_RESULTS as readonly string[]).includes(raw)) {
    return raw as RisModuleTestResult;
  }
  return "planned";
}

function dateTimeIso(value: FormDataEntryValue | null): string | null {
  const raw = text(value, 80);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function upsertRisModuleTestFromFormAction(formData: FormData) {
  const redirectTo = redirectPath(formData.get("redirect_to"));

  let result: Awaited<ReturnType<typeof setRisModuleTestAction>>;
  try {
    result = await setRisModuleTestAction({
      id: text(formData.get("id"), 80),
      studentId: text(formData.get("student_id"), 80) ?? "",
      moduleNumber: moduleNumber(formData.get("module_number")),
      testType: testType(formData.get("test_type")),
      result: testResult(formData.get("result")),
      plannedAt: dateTimeIso(formData.get("planned_at")),
      completedAt: dateTimeIso(formData.get("completed_at")),
      instructorId: text(formData.get("instructor_id"), 80),
      cbrReference: text(formData.get("cbr_reference"), 120),
      notes: text(formData.get("notes"), 1500),
      exemptionSpecialManoeuvres:
        formData.get("exemption_special_manoeuvres") === "on",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "RIS-moduletoets opslaan mislukt.";
    redirect(`${redirectTo}?ris_error=${encodeURIComponent(message)}`);
  }

  if (result.error) {
    redirect(`${redirectTo}?ris_error=${encodeURIComponent(result.error)}`);
  }
  redirect(`${redirectTo}?ris_saved=module-test`);
}
