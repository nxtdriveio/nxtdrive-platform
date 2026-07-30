import assert from "node:assert/strict";
import test from "node:test";
import { computeReadiness } from "@workspace/leskaart";

const preconditions = {
  theorieBehaald: true,
  machtigingGeregeld: true,
  gezondheidsverklaringVereist: false,
  gezondheidsverklaringGeregeld: false,
};

test("legacy projection keeps N out of mastery and exposes coverage separately", () => {
  const result = computeReadiness({
    skills: [
      { skillId: "assessed", isCritical: false, score: 8 },
      { skillId: "not-assessed", isCritical: false, score: null },
    ],
    lessons: [],
    preconditions,
  });

  assert.equal(result.averageScore, 8);
  assert.equal(result.masteryPct, 100);
  assert.equal(result.coveragePct, 50);
  assert.equal(result.readinessPct, 50);
  assert.equal(result.advice, "niet_examenrijp");
  assert.match(result.blockers[0] ?? "", /Dekking is 50%/);
});

test("an unassessed critical skill remains an explicit blocker", () => {
  const result = computeReadiness({
    skills: [
      { skillId: "critical", isCritical: true, score: null },
      { skillId: "other", isCritical: false, score: 8 },
    ],
    lessons: [],
    preconditions,
  });

  assert.equal(result.criticalMinScore, null);
  assert.equal(result.criticalUnassessed, 1);
  assert.equal(result.criticalBelowThreshold, 1);
  assert.ok(
    result.blockers.some((blocker) =>
      blocker.includes("Kritieke veiligheidsvaardigheid"),
    ),
  );
});
