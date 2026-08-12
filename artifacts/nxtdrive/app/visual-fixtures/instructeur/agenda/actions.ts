"use server";

import { redirect } from "next/navigation";
import type {
  InstructorStudentSearchResult,
  ResolvedAppointmentContext,
  SmartAppointmentDraft,
  WizardActionResult,
} from "@/domains/planning/application/smart-appointment-contracts";

function ensureEnabled() {
  if (process.env.VISUAL_FIXTURES_ENABLED !== "true") {
    throw new Error("Visual fixtures are disabled.");
  }
}

const STUDENTS: readonly InstructorStudentSearchResult[] = [
  {
    id: "student-1",
    displayName: "Noah Jansen",
    contextualLabel: "Eigen leerling",
  },
  {
    id: "student-2",
    displayName: "Milan de Vries",
    contextualLabel: "Eigen leerling",
  },
  {
    id: "student-3",
    displayName: "Milou van Dijk",
    contextualLabel: "Eigen leerling",
  },
];

export async function searchFixtureStudents(
  query: string,
): Promise<WizardActionResult<readonly InstructorStudentSearchResult[]>> {
  ensureEnabled();
  const normalized = query.trim().toLocaleLowerCase("nl-NL");
  if (normalized.length < 3) return { ok: true, data: [] };
  return {
    ok: true,
    data: STUDENTS.filter((student) =>
      student.displayName.toLocaleLowerCase("nl-NL").includes(normalized),
    ).slice(0, 10),
  };
}

export async function resolveFixtureAppointmentContext(input: {
  type: SmartAppointmentDraft["type"];
  studentId?: string | null;
  selectedDate: string;
  selectedTime: string;
}): Promise<WizardActionResult<ResolvedAppointmentContext>> {
  ensureEnabled();
  const student = STUDENTS.find(
    (candidate) => candidate.id === input.studentId,
  );
  const studentLinked = [
    "lesson",
    "exam",
    "interim_test",
    "theory_guidance",
  ].includes(input.type);
  const vehicleSelectionRequired = input.type === "maintenance";
  if (studentLinked && !student) {
    return {
      ok: false,
      error: "Kies eerst een leerling.",
      code: "student_required",
    };
  }
  const exam = input.type === "exam" || input.type === "interim_test";
  return {
    ok: true,
    data: {
      student: student
        ? {
            id: student.id,
            displayName: student.displayName,
            phone: "06 12 34 56 78",
            branchId: "branch-1",
          }
        : undefined,
      pickup: student
        ? {
            defaultLocation: {
              key: "pickup-home",
              label: "Thuis",
              formattedAddress: "Duivelandsestraat 12, 2583 JB Den Haag",
              locationRecordId: "location-1",
              locationVersionId: "location-version-1",
              role: "PICKUP_DEFAULT",
              isDefault: true,
            },
            alternatives: [
              {
                key: "pickup-school",
                label: "School",
                formattedAddress: "Houtrustweg 2, Den Haag",
                locationRecordId: "location-2",
                locationVersionId: "location-version-2",
                role: "FAVORITE",
                isDefault: false,
              },
            ],
          }
        : { alternatives: [] },
      destinations: exam
        ? [
            {
              id: "cbr-rijswijk",
              label: "CBR Rijswijk",
              formattedAddress: "Lange Kleiweg 30, Rijswijk",
              locationRecordId: "location-cbr",
              locationVersionId: "location-cbr-v1",
            },
          ]
        : [],
      duration: {
        suggestedMinutes: exam
          ? input.type === "exam"
            ? 120
            : 90
          : input.type === "break"
            ? 30
            : input.type === "lesson"
              ? 90
              : 60,
        source: student ? "STUDENT" : "TENANT",
        locked: exam,
      },
      buffer: {
        beforeMinutes: exam ? (input.type === "exam" ? 30 : 20) : 0,
        afterMinutes: exam
          ? input.type === "exam"
            ? 30
            : 20
          : input.type === "lesson"
            ? 15
            : 0,
        source: "TENANT",
        locked: exam,
      },
      vehicle: vehicleSelectionRequired
        ? {
            status: "SELECTION_REQUIRED",
            source: "NONE",
            reason: "Er zijn meerdere passende voertuigen beschikbaar.",
            candidates: [
              {
                id: "vehicle-1",
                label: "Toyota Yaris 04",
                transmission: "automaat",
                status: "active",
                branchId: "branch-1",
                available: true,
              },
              {
                id: "vehicle-2",
                label: "Volkswagen Golf 12",
                transmission: "schakel",
                status: "active",
                branchId: "branch-1",
                available: true,
              },
            ],
          }
        : studentLinked
          ? {
              status: "RESOLVED",
              source: "FIXED_INSTRUCTOR",
              vehicle: {
                id: "vehicle-1",
                label: "Toyota Yaris 04",
                transmission: "automaat",
                status: "active",
                branchId: "branch-1",
                defaultInstructorId: "instructor-1",
                available: true,
              },
              candidates: [
                {
                  id: "vehicle-1",
                  label: "Toyota Yaris 04",
                  transmission: "automaat",
                  status: "active",
                  branchId: "branch-1",
                  defaultInstructorId: "instructor-1",
                  available: true,
                },
              ],
            }
          : { status: "NOT_REQUIRED", source: "NONE", candidates: [] },
      planning: { allowed: true, blockingReasons: [], warnings: [] },
    },
  };
}

export async function previewFixtureSmartAppointment(
  draft: SmartAppointmentDraft,
): Promise<WizardActionResult<ResolvedAppointmentContext>> {
  ensureEnabled();
  const resolved = await resolveFixtureAppointmentContext({
    type: draft.type,
    studentId: draft.studentId,
    selectedDate: draft.selectedDate,
    selectedTime: draft.selectedTime,
  });
  if (!resolved.ok) return resolved;
  const warning = draft.selectedTime === "13:45";
  return {
    ok: true,
    data: {
      ...resolved.data,
      planning: warning
        ? {
            allowed: false,
            blockingReasons: [
              {
                code: "INSUFFICIENT_TRAVEL_TIME_AFTER",
                message: "24 min reistijd, maar 15 min beschikbaar.",
                severity: "blocking",
                meta: { requiredTravelMinutes: 24, availableGapMinutes: 15 },
              },
            ],
            warnings: [],
          }
        : { allowed: true, blockingReasons: [], warnings: [] },
    },
  };
}

export async function createFixtureSmartAppointment(
  draft: SmartAppointmentDraft,
): Promise<never> {
  ensureEnabled();
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(draft.selectedDate) ||
    !/^\d{2}:\d{2}$/.test(draft.selectedTime)
  ) {
    throw new Error("Invalid visual calendar fixture input.");
  }
  const params = new URLSearchParams({
    fixture: "empty",
    created: draft.type,
    date: draft.selectedDate,
    time: draft.selectedTime,
    student: draft.studentId ?? "",
    duration: String(draft.durationMinutes),
  });
  redirect(`/visual-fixtures/instructeur/agenda?${params.toString()}`);
}
