import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_APPOINTMENT_WIZARD_SETTINGS,
  PLATFORM_APPOINTMENT_TYPE_POLICIES,
  buildWizardSteps,
  clampDuration,
  resolveAppointmentBuffer,
  resolveAppointmentDuration,
  resolveVehicle,
} from "./appointment-policy";

const lesson = PLATFORM_APPOINTMENT_TYPE_POLICIES.lesson;
const exam = PLATFORM_APPOINTMENT_TYPE_POLICIES.exam;

test("duration resolver prefers student, then instructor, then tenant", () => {
  assert.deepEqual(
    resolveAppointmentDuration({
      policy: lesson,
      studentMinutes: 90,
      instructorMinutes: 80,
    }),
    { minutes: 90, source: "STUDENT", locked: false },
  );
  assert.deepEqual(
    resolveAppointmentDuration({ policy: lesson, instructorMinutes: 80 }),
    { minutes: 80, source: "INSTRUCTOR", locked: false },
  );
  assert.deepEqual(resolveAppointmentDuration({ policy: lesson }), {
    minutes: 50,
    source: "TENANT",
    locked: false,
  });
});

test("duration resolver applies tenant boundaries and step", () => {
  assert.equal(clampDuration(5, lesson), lesson.minDurationMinutes);
  assert.equal(clampDuration(999, lesson), lesson.maxDurationMinutes);
  assert.equal(clampDuration(83, lesson), 80);
});

test("locked exam duration ignores instructor and student preferences", () => {
  assert.deepEqual(
    resolveAppointmentDuration({
      policy: exam,
      studentMinutes: 90,
      instructorMinutes: 90,
    }),
    { minutes: 120, source: "TENANT", locked: true },
  );
});

test("buffer resolver prefers instructor but enforces minimum and locks", () => {
  assert.deepEqual(
    resolveAppointmentBuffer({
      policy: lesson,
      instructorBeforeMinutes: 5,
      instructorAfterMinutes: 20,
    }),
    {
      beforeMinutes: 5,
      afterMinutes: 20,
      source: "INSTRUCTOR",
      locked: false,
    },
  );
  assert.deepEqual(
    resolveAppointmentBuffer({
      policy: exam,
      instructorBeforeMinutes: 0,
      instructorAfterMinutes: 0,
    }),
    {
      beforeMinutes: 30,
      afterMinutes: 30,
      source: "TENANT",
      locked: true,
    },
  );
});

test("dynamic steps skip irrelevant student and vehicle steps", () => {
  assert.deepEqual(buildWizardSteps({ policy: lesson }), [
    "TYPE",
    "STUDENT",
    "PICKUP",
    "SCHEDULE",
    "SUMMARY",
  ]);
  assert.deepEqual(
    buildWizardSteps({
      policy: PLATFORM_APPOINTMENT_TYPE_POLICIES.break,
    }),
    ["TYPE", "SCHEDULE", "SUMMARY"],
  );
  assert.deepEqual(
    buildWizardSteps({
      policy: PLATFORM_APPOINTMENT_TYPE_POLICIES.private_block,
    }),
    ["TYPE", "PRIVATE_DETAILS", "SCHEDULE", "SUMMARY"],
  );
  assert.deepEqual(buildWizardSteps({ policy: exam }), [
    "TYPE",
    "STUDENT",
    "PICKUP",
    "DESTINATION",
    "SCHEDULE",
    "SUMMARY",
  ]);
});

test("conditional vehicle step appears only when resolution is ambiguous", () => {
  assert.ok(
    !buildWizardSteps({
      policy: lesson,
      vehicleResolution: {
        status: "RESOLVED",
        source: "FIXED_INSTRUCTOR",
        candidates: [],
      },
    }).includes("VEHICLE"),
  );
  assert.ok(
    buildWizardSteps({
      policy: lesson,
      vehicleResolution: {
        status: "SELECTION_REQUIRED",
        source: "NONE",
        candidates: [],
      },
    }).includes("VEHICLE"),
  );
});

const candidate = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  label: id,
  status: "active",
  branchId: "branch-1",
  available: true,
  capabilityMatch: true,
  ...overrides,
});

test("vehicle resolver follows fixed, preference, branch, tenant and single priorities", () => {
  const vehicles = [
    candidate("fixed", { defaultInstructorId: "instructor-1" }),
    candidate("preferred"),
    candidate("branch", { isBranchDefault: true }),
    candidate("tenant", { isTenantDefault: true }),
  ];
  assert.equal(
    resolveVehicle({
      policy: lesson,
      settings: DEFAULT_APPOINTMENT_WIZARD_SETTINGS,
      instructorId: "instructor-1",
      branchId: "branch-1",
      instructorPreferenceVehicleId: "preferred",
      vehicles,
    }).vehicle?.id,
    "fixed",
  );
  assert.equal(
    resolveVehicle({
      policy: lesson,
      settings: DEFAULT_APPOINTMENT_WIZARD_SETTINGS,
      instructorId: "other",
      branchId: "branch-1",
      instructorPreferenceVehicleId: "preferred",
      vehicles,
    }).vehicle?.id,
    "preferred",
  );
  assert.equal(
    resolveVehicle({
      policy: lesson,
      settings: DEFAULT_APPOINTMENT_WIZARD_SETTINGS,
      instructorId: "other",
      branchId: "branch-1",
      vehicles: [candidate("only")],
    }).source,
    "ONLY_AVAILABLE",
  );
});

test("vehicle resolver rejects unavailable, mismatched and ambiguous candidates", () => {
  const result = resolveVehicle({
    policy: lesson,
    settings: DEFAULT_APPOINTMENT_WIZARD_SETTINGS,
    instructorId: "instructor-1",
    branchId: "branch-1",
    vehicles: [
      candidate("maintenance", { status: "maintenance" }),
      candidate("mismatch", { capabilityMatch: false }),
      candidate("a"),
      candidate("b"),
    ],
  });
  assert.equal(result.status, "SELECTION_REQUIRED");
  assert.deepEqual(
    result.candidates.map((vehicle) => vehicle.id),
    ["a", "b"],
  );
});

test("vehicle-free appointment never exposes vehicle selection", () => {
  assert.deepEqual(
    resolveVehicle({
      policy: PLATFORM_APPOINTMENT_TYPE_POLICIES.private_block,
      settings: DEFAULT_APPOINTMENT_WIZARD_SETTINGS,
      instructorId: "instructor-1",
      vehicles: [candidate("car")],
    }),
    { status: "NOT_REQUIRED", candidates: [], source: "NONE" },
  );
});
