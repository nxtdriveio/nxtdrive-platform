import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CALENDAR_START_HOUR,
  currentTimeMinutes,
  formatMinuteOffset,
  initialScrollMinutes,
  layoutOverlappingEvents,
  minutesFromPointerPosition,
  minutesSinceStart,
  pixelsFromMinutes,
  snapMinutes,
  visibleCalendarInterval,
} from "./instructor-day-calendar";

const TIME_ZONE = "Europe/Amsterdam";

describe("instructor day calendar positioning", () => {
  it("maps every required wall-clock sample proportionally", () => {
    const samples = [
      ["2026-08-11T05:00:00.000Z", 0],
      ["2026-08-11T05:15:00.000Z", 15],
      ["2026-08-11T05:30:00.000Z", 30],
      ["2026-08-11T06:00:00.000Z", 60],
      ["2026-08-11T10:45:00.000Z", 345],
      ["2026-08-11T19:45:00.000Z", 885],
      ["2026-08-11T20:00:00.000Z", 900],
    ] as const;
    for (const [instant, minutes] of samples) {
      assert.equal(minutesSinceStart(instant, TIME_ZONE), minutes);
      assert.equal(pixelsFromMinutes(minutes, 72), minutes * 1.2);
    }
  });

  it("clips partially visible events without changing their proportional duration", () => {
    assert.deepEqual(
      visibleCalendarInterval(
        {
          startsAt: "2026-08-11T04:30:00.000Z",
          endsAt: "2026-08-11T05:30:00.000Z",
        },
        "2026-08-11",
        TIME_ZONE,
      ),
      {
        startsBeforeWindow: true,
        endsAfterWindow: false,
        startMinutes: 0,
        endMinutes: 30,
        durationMinutes: 30,
      },
    );
    assert.deepEqual(
      visibleCalendarInterval(
        {
          startsAt: "2026-08-11T19:30:00.000Z",
          endsAt: "2026-08-11T20:30:00.000Z",
        },
        "2026-08-11",
        TIME_ZONE,
      ),
      {
        startsBeforeWindow: false,
        endsAfterWindow: true,
        startMinutes: 870,
        endMinutes: 900,
        durationMinutes: 30,
      },
    );
  });

  it("keeps 15, 30, 45, 60 and 90 minute heights exact", () => {
    for (const duration of [15, 30, 45, 60, 90]) {
      assert.equal(pixelsFromMinutes(duration, 72), duration * 1.2);
    }
  });
});

describe("quarter-hour pointer snapping", () => {
  it("snaps around every requested boundary", () => {
    const samples = [
      [0, 0],
      [7, 0],
      [14, 15],
      [16, 15],
      [29, 30],
      [31, 30],
      [44, 45],
      [46, 45],
      [59, 60],
    ] as const;
    for (const [input, expected] of samples) {
      assert.equal(snapMinutes(input), expected);
    }
  });

  it("clamps pointer positions to the 07:00–22:00 canvas", () => {
    assert.equal(minutesFromPointerPosition(-50, 60), 0);
    assert.equal(minutesFromPointerPosition(900, 60), 899);
  });
});

type Event = { id: string; start: number; end: number };
const interval = (event: Event) => ({ start: event.start, end: event.end });

describe("calendar overlap layout", () => {
  it("uses the full width without overlap or on direct adjacency", () => {
    const result = layoutOverlappingEvents(
      [
        { id: "a", start: 120, end: 180 },
        { id: "b", start: 180, end: 240 },
      ],
      interval,
    );
    assert.deepEqual(
      result.map(({ column, columnCount }) => [column, columnCount]),
      [
        [0, 1],
        [0, 1],
      ],
    );
  });

  it("lays out two complete overlaps in two columns", () => {
    const result = layoutOverlappingEvents(
      [
        { id: "a", start: 120, end: 180 },
        { id: "b", start: 120, end: 180 },
      ],
      interval,
    );
    assert.deepEqual(
      result.map(({ column, columnCount }) => [column, columnCount]),
      [
        [0, 2],
        [1, 2],
      ],
    );
  });

  it("handles partial, nested and three-way overlaps deterministically", () => {
    const result = layoutOverlappingEvents(
      [
        { id: "outer", start: 100, end: 240 },
        { id: "partial", start: 160, end: 280 },
        { id: "nested", start: 180, end: 200 },
      ],
      interval,
    );
    assert.equal(result.length, 3);
    assert.ok(result.every((entry) => entry.columnCount === 3));
    assert.deepEqual(
      result.map((entry) => entry.column),
      [0, 1, 2],
    );
  });

  it("supports very short events", () => {
    const [result] = layoutOverlappingEvents(
      [{ id: "short", start: 135, end: 140 }],
      interval,
    );
    assert.equal(result?.columnCount, 1);
  });
});

describe("current time and initial scroll", () => {
  const today = "2026-08-11";
  it("only displays the tenant-local current time on today within range", () => {
    assert.equal(
      currentTimeMinutes({
        selectedDate: "2026-08-10",
        now: new Date("2026-08-11T14:58:00.000Z"),
        timeZone: TIME_ZONE,
      }),
      null,
    );
    assert.equal(
      currentTimeMinutes({
        selectedDate: today,
        now: new Date("2026-08-11T04:59:00.000Z"),
        timeZone: TIME_ZONE,
      }),
      null,
    );
    assert.equal(
      currentTimeMinutes({
        selectedDate: today,
        now: new Date("2026-08-11T05:00:00.000Z"),
        timeZone: TIME_ZONE,
      }),
      0,
    );
    assert.equal(
      currentTimeMinutes({
        selectedDate: today,
        now: new Date("2026-08-11T14:58:00.000Z"),
        timeZone: TIME_ZONE,
      }),
      598,
    );
    assert.equal(
      currentTimeMinutes({
        selectedDate: today,
        now: new Date("2026-08-11T20:00:00.000Z"),
        timeZone: TIME_ZONE,
      }),
      null,
    );
    assert.equal(
      currentTimeMinutes({
        selectedDate: "2026-08-12",
        now: new Date("2026-08-11T14:58:00.000Z"),
        timeZone: TIME_ZONE,
      }),
      null,
    );
  });

  it("chooses a useful one-time initial scroll position", () => {
    assert.equal(
      initialScrollMinutes({
        selectedDate: today,
        today,
        nowMinuteOfDay: 6 * 60,
      }),
      0,
    );
    assert.equal(
      initialScrollMinutes({
        selectedDate: today,
        today,
        nowMinuteOfDay: 16 * 60 + 58,
      }),
      538,
    );
    assert.equal(
      initialScrollMinutes({
        selectedDate: today,
        today,
        nowMinuteOfDay: 22 * 60,
      }),
      660,
    );
    assert.equal(
      initialScrollMinutes({
        selectedDate: "2026-08-12",
        today,
        nowMinuteOfDay: 100,
        firstVisibleEventMinute: 195,
      }),
      135,
    );
  });

  it("formats offsets from 07:00", () => {
    assert.equal(
      formatMinuteOffset(0),
      `${String(CALENDAR_START_HOUR).padStart(2, "0")}:00`,
    );
    assert.equal(formatMinuteOffset(405), "13:45");
  });
});

describe("timezone and DST", () => {
  it("uses tenant time even when the device timezone differs", () => {
    const instant = "2026-01-15T07:15:00.000Z";
    assert.equal(minutesSinceStart(instant, "Europe/Amsterdam"), 75);
    assert.equal(minutesSinceStart(instant, "America/New_York"), -285);
  });

  it("keeps wall-clock positions stable across summer and winter time", () => {
    assert.equal(minutesSinceStart("2026-03-29T06:15:00.000Z", TIME_ZONE), 75);
    assert.equal(minutesSinceStart("2026-10-25T07:15:00.000Z", TIME_ZONE), 75);
  });
});
