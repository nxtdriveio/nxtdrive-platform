import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  RATE_LIMIT_POLICIES,
  rateLimitHeaders,
} from "@/lib/security/rate-limit";

describe("distributed rate-limit contract", () => {
  it("defines stricter limits for authentication and privacy operations", () => {
    assert.ok(RATE_LIMIT_POLICIES.login.limit <= 10);
    assert.ok(RATE_LIMIT_POLICIES.otp.limit <= RATE_LIMIT_POLICIES.login.limit);
    assert.ok(RATE_LIMIT_POLICIES.privacy_export.limit <= 3);
    assert.equal(
      RATE_LIMIT_POLICIES.privacy_deletion.windowSeconds,
      24 * 60 * 60,
    );
  });

  it("emits standards-compatible retry information for blocked requests", () => {
    assert.deepEqual(
      rateLimitHeaders({
        allowed: false,
        remaining: 0,
        retryAfterSeconds: 42,
      }),
      { "RateLimit-Remaining": "0", "Retry-After": "42" },
    );
  });
});
