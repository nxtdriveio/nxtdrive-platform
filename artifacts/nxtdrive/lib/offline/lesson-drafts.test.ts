import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createOfflineLessonDraft,
  mergeLessonDraft,
} from "@/lib/offline/lesson-drafts";

function draft() {
  return createOfflineLessonDraft({
    lessonId: "lesson-1",
    tenantId: "tenant-1",
    actorId: "actor-1",
    now: new Date("2026-07-29T10:00:00.000Z"),
    expiresAt: new Date("2026-07-30T10:00:00.000Z"),
  });
}

describe("offline lesson draft synchronization", () => {
  it("creates an idempotent local-only draft with explicit expiry", () => {
    const created = draft();
    assert.equal(created.syncStatus, "LOCAL_ONLY");
    assert.match(created.idempotencyKey, /^[0-9a-f-]{36}$/);
    assert.equal(created.serverRevision, null);
  });

  it("does not silently overwrite conflicting safety evidence", () => {
    const base = draft();
    const observation = {
      competencyId: "safe-distance",
      instructionStage: 4 as const,
      performanceOutcome: "DEVELOPING" as const,
      safetyStatus: "NO_BLOCKER" as const,
    };
    base.observations = [observation];
    const local = {
      ...base,
      localRevision: 2,
      observations: [{ ...observation, safetyStatus: "ATTENTION" as const }],
    };
    const server = {
      ...base,
      serverRevision: 2,
      observations: [{ ...observation, safetyStatus: "BLOCKER" as const }],
    };
    const result = mergeLessonDraft({ base, local, server });
    assert.equal(result.status, "CONFLICT");
    if (result.status === "CONFLICT") {
      assert.equal(result.conflicts[0]?.reason, "SAFETY_EVIDENCE_CHANGED");
      assert.equal(result.draft.syncStatus, "CONFLICT");
    }
  });
});
