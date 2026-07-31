import assert from "node:assert/strict";
import test from "node:test";
import {
  LESSON_COMPLETION_BOUNDARY_VERSION,
  normalizeLessonCompletionMeasurement,
} from "./completion-measurement";

const base = {
  sessionId: "019fb826-8263-7ec2-b1d5-d801fe8c4b97",
  startedAt: "2026-07-31T12:00:00.000Z",
  viewportWidth: 1024,
  viewportHeight: 768,
  boundaryVersion: LESSON_COMPLETION_BOUNDARY_VERSION,
} as const;

test("the canonical boundary includes exactly 60 seconds", () => {
  const result = normalizeLessonCompletionMeasurement({
    ...base,
    durationMs: 60_000,
  });
  assert.equal(result?.withinTarget, true);
  assert.equal(result?.targetMs, 60_000);
});

test("a completion above the canonical boundary fails the target", () => {
  const result = normalizeLessonCompletionMeasurement({
    ...base,
    durationMs: 60_001,
  });
  assert.equal(result?.withinTarget, false);
});

test("invalid or implausible client measurements are rejected", () => {
  assert.equal(
    normalizeLessonCompletionMeasurement({
      ...base,
      sessionId: "not-a-session",
      durationMs: 10_000,
    }),
    null,
  );
  assert.equal(
    normalizeLessonCompletionMeasurement({
      ...base,
      durationMs: -1,
    }),
    null,
  );
});
