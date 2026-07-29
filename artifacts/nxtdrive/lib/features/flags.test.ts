import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
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
});
