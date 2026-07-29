import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FixedClock, SystemClock, todayInTimeZone } from "@/lib/time/clock";

describe("Clock", () => {
  it("returns defensive Date copies from a FixedClock", () => {
    const clock = new FixedClock("2026-06-23T22:30:00.000Z");
    const first = clock.now();
    first.setUTCFullYear(1999);

    assert.equal(clock.now().toISOString(), "2026-06-23T22:30:00.000Z");
  });

  it("derives today from the tenant timezone instead of UTC", () => {
    const clock = new FixedClock("2026-06-23T22:30:00.000Z");

    assert.equal(todayInTimeZone(clock, "Europe/Amsterdam"), "2026-06-24");
    assert.equal(todayInTimeZone(clock, "America/New_York"), "2026-06-23");
  });

  it("rejects invalid fixed instants", () => {
    assert.throws(() => new FixedClock("not-a-date"), TypeError);
  });

  it("provides a production system clock", () => {
    assert.ok(new SystemClock().now() instanceof Date);
  });
});
