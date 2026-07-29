import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createTraceContext,
  serializeError,
} from "@/lib/observability/logger";

describe("vendor-neutral observability", () => {
  it("creates W3C-sized trace and span identifiers", () => {
    const context = createTraceContext("request-12345678");
    assert.equal(context.correlationId, "request-12345678");
    assert.match(context.traceId, /^[a-f0-9]{32}$/);
    assert.match(context.spanId, /^[a-f0-9]{16}$/);
  });

  it("serializes safe error fields without arbitrary object data", () => {
    const serialized = serializeError(new Error("Database unavailable"));
    assert.equal(serialized["type"], "Error");
    assert.equal(serialized["message"], "Database unavailable");
    assert.equal(
      serializeError({ token: "must-not-leak" })["message"],
      "Unknown failure",
    );
  });
});
