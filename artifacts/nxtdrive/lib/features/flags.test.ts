import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AI_TEMPORARILY_DISABLED,
  DEFAULT_FEATURE_FLAGS,
  isFeatureEnabled,
} from "@/lib/features/flags";

describe("pilot feature flags", () => {
  it("keeps AI disabled in every role by default", () => {
    assert.equal(DEFAULT_FEATURE_FLAGS["ai.instructor.enabled"], false);
    assert.equal(DEFAULT_FEATURE_FLAGS["ai.student.enabled"], false);
    assert.equal(DEFAULT_FEATURE_FLAGS["ai.admin.enabled"], false);
    assert.equal(isFeatureEnabled("ai.instructor.enabled"), false);
  });

  it("ignores stale AI enablement environment variables while paused", () => {
    const previous = process.env["NXT_AI_INSTRUCTOR_ENABLED"];
    process.env["NXT_AI_INSTRUCTOR_ENABLED"] = "true";
    try {
      assert.equal(AI_TEMPORARILY_DISABLED, true);
      assert.equal(isFeatureEnabled("ai.instructor.enabled"), false);
    } finally {
      if (previous === undefined) {
        delete process.env["NXT_AI_INSTRUCTOR_ENABLED"];
      } else {
        process.env["NXT_AI_INSTRUCTOR_ENABLED"] = previous;
      }
    }
  });
});
