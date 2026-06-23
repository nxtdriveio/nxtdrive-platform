import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseZonedDateTime,
  startOfZonedDayUtc,
  zonedMinuteOfDay,
  zonedYmd,
} from "@/lib/datetime";

describe("datetime timezone handling", () => {
  it("keeps Amsterdam wall-clock times stable around spring DST", () => {
    const beforeJump = parseZonedDateTime(
      "2026-03-29T01:30:00",
      "Europe/Amsterdam",
    );
    const afterJump = parseZonedDateTime(
      "2026-03-29T03:30:00",
      "Europe/Amsterdam",
    );

    assert.equal(beforeJump?.toISOString(), "2026-03-29T00:30:00.000Z");
    assert.equal(afterJump?.toISOString(), "2026-03-29T01:30:00.000Z");
    assert.equal(zonedYmd(afterJump!, "Europe/Amsterdam"), "2026-03-29");
    assert.equal(zonedMinuteOfDay(afterJump!, "Europe/Amsterdam"), 210);
  });

  it("keeps Amsterdam wall-clock times stable around autumn DST", () => {
    const beforeFallback = parseZonedDateTime(
      "2026-10-25T01:30:00",
      "Europe/Amsterdam",
    );
    const afterFallback = parseZonedDateTime(
      "2026-10-25T03:30:00",
      "Europe/Amsterdam",
    );

    assert.equal(beforeFallback?.toISOString(), "2026-10-24T23:30:00.000Z");
    assert.equal(afterFallback?.toISOString(), "2026-10-25T02:30:00.000Z");
    assert.equal(zonedYmd(afterFallback!, "Europe/Amsterdam"), "2026-10-25");
    assert.equal(zonedMinuteOfDay(afterFallback!, "Europe/Amsterdam"), 210);
  });

  it("uses the local tenant midnight for day-range boundaries", () => {
    assert.equal(
      startOfZonedDayUtc("2026-03-29", "Europe/Amsterdam").toISOString(),
      "2026-03-28T23:00:00.000Z",
    );
    assert.equal(
      startOfZonedDayUtc("2026-10-25", "Europe/Amsterdam").toISOString(),
      "2026-10-24T22:00:00.000Z",
    );
  });
});
