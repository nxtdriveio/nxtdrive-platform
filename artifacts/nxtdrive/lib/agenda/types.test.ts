import assert from "node:assert/strict";
import test from "node:test";
import {
  INSTRUCTOR_PLANNING_TYPE_LABEL,
  isInstructorPlanningType,
  isStudentLinkedPlanningType,
} from "./types";

test("the instructor planning catalog includes a canonical driving lesson", () => {
  assert.equal(isInstructorPlanningType("lesson"), true);
  assert.equal(INSTRUCTOR_PLANNING_TYPE_LABEL.lesson, "Rijles");
  assert.equal(isStudentLinkedPlanningType("lesson"), true);
});

test("unknown planning types remain rejected", () => {
  assert.equal(isInstructorPlanningType("unknown"), false);
});
