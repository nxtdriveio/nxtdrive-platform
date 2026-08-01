import assert from "node:assert/strict";
import test from "node:test";
import { resolveInstructorAgendaPeriod } from "./agenda-period";

const now = new Date("2026-07-31T12:00:00.000Z");

test("agenda day resolves one selected calendar day", () => {
  const period = resolveInstructorAgendaPeriod({
    mode: "day",
    date: "2026-07-30",
    now,
    timeZone: "Europe/Amsterdam",
  });
  assert.equal(period.fromYmd, "2026-07-30");
  assert.equal(period.toYmd, "2026-07-31");
  assert.equal(period.previousDate, "2026-07-29");
  assert.equal(period.nextDate, "2026-07-31");
});

test("agenda week is Monday-first", () => {
  const period = resolveInstructorAgendaPeriod({
    mode: "week",
    date: "2026-07-31",
    now,
  });
  assert.equal(period.fromYmd, "2026-07-27");
  assert.equal(period.toYmd, "2026-08-03");
  assert.equal(period.previousDate, "2026-07-20");
  assert.equal(period.nextDate, "2026-08-03");
});

test("agenda month spans the selected month", () => {
  const period = resolveInstructorAgendaPeriod({
    mode: "month",
    date: "2026-07-31",
    now,
  });
  assert.equal(period.fromYmd, "2026-07-01");
  assert.equal(period.toYmd, "2026-08-01");
  assert.equal(period.previousDate, "2026-06-01");
  assert.equal(period.nextDate, "2026-08-01");
});

test("agenda history includes yesterday and the current day", () => {
  const period = resolveInstructorAgendaPeriod({
    mode: "history",
    now,
    timeZone: "Europe/Amsterdam",
  });
  assert.equal(period.fromYmd, "2026-01-01");
  assert.equal(period.toYmd, "2026-08-01");
  assert.equal(period.previousDate, null);
  assert.equal(period.nextDate, null);
});

test("invalid agenda inputs safely fall back to today and day mode", () => {
  const period = resolveInstructorAgendaPeriod({
    mode: "jaar",
    date: "niet-een-datum",
    now,
    timeZone: "Europe/Amsterdam",
  });
  assert.equal(period.mode, "day");
  assert.equal(period.selectedDate, "2026-07-31");
});
