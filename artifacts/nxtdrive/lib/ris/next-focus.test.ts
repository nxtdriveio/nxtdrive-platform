import assert from "node:assert/strict";
import test from "node:test";
import { buildNextFocusProposal } from "./next-focus";

test("next focus prioritizes safety and learner wish and returns at most four scripts", () => {
  const proposal = buildNextFocusProposal({
    learnerWish: "Ik wil rotondes oefenen",
    candidates: [
      {
        scriptId: "safe",
        code: "2.1",
        title: "Voorrang",
        moduleNumber: 2,
        safetyStatus: "BLOCKER",
      },
      {
        scriptId: "wish",
        code: "3.2",
        title: "Rotondes",
        moduleNumber: 3,
        performanceOutcome: "DEVELOPING",
      },
      {
        scriptId: "repeat",
        code: "1.4",
        title: "Spiegels",
        moduleNumber: 1,
        shouldRepeat: true,
      },
      {
        scriptId: "coverage",
        code: "4.1",
        title: "Snelweg",
        moduleNumber: 4,
        performanceOutcome: "NOT_OBSERVED",
      },
      {
        scriptId: "stable",
        code: "1.1",
        title: "Bediening",
        moduleNumber: 1,
        performanceOutcome: "STABLE",
        safetyStatus: "NO_BLOCKER",
      },
    ],
  });

  assert.deepEqual(
    proposal.recommendations.map((item) => item.scriptId),
    ["safe", "wish", "repeat", "coverage"],
  );
  assert.match(proposal.recommendations[1]!.reason, /leerwens/);
  assert.equal(proposal.recommendations.length, 4);
});

test("next focus remains deterministic without a learner wish", () => {
  const proposal = buildNextFocusProposal({
    candidates: [
      {
        scriptId: "b",
        code: "B",
        title: "Bochten",
        moduleNumber: 1,
      },
      {
        scriptId: "a",
        code: "A",
        title: "Afremmen",
        moduleNumber: 1,
      },
    ],
  });
  assert.deepEqual(
    proposal.recommendations.map((item) => item.scriptId),
    ["a", "b"],
  );
});
