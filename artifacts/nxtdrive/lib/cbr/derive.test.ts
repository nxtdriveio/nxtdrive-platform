import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveCbrExamStatus,
  type CbrAppointmentInput,
} from "./derive";

const NOW = new Date("2026-06-02T12:00:00.000Z");
function future(days: number): string {
  return new Date(NOW.getTime() + days * 86_400_000).toISOString();
}
function past(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}
function appt(
  type: CbrAppointmentInput["type"],
  status: CbrAppointmentInput["status"],
  starts_at: string,
  result: CbrAppointmentInput["result"] = null,
): CbrAppointmentInput {
  return { type, status, starts_at, result };
}

test("geen afspraken → geen", () => {
  const d = deriveCbrExamStatus([], NOW);
  assert.equal(d.examStatus, "geen");
  assert.equal(d.lastExamResult, null);
  assert.equal(d.nextAppointmentAt, null);
});

test("toekomstige toets → toets_gepland", () => {
  const d = deriveCbrExamStatus(
    [appt("interim_test", "planned", future(7))],
    NOW,
  );
  assert.equal(d.examStatus, "toets_gepland");
  assert.equal(d.nextToetsAt, future(7));
  assert.equal(d.nextAppointmentType, "interim_test");
});

test("toekomstig examen → examen_gepland (gaat boven toets)", () => {
  const d = deriveCbrExamStatus(
    [
      appt("interim_test", "planned", future(10)),
      appt("exam", "planned", future(20)),
    ],
    NOW,
  );
  assert.equal(d.examStatus, "examen_gepland");
  assert.equal(d.nextExamAt, future(20));
});

test("afgerond examen behaald → geslaagd (terminale fase)", () => {
  const d = deriveCbrExamStatus(
    [appt("exam", "completed", past(3), "passed")],
    NOW,
  );
  assert.equal(d.examStatus, "geslaagd");
  assert.equal(d.lastExamResult, "passed");
});

test("geslaagd blijft geslaagd, ook met oude gezakte poging", () => {
  const d = deriveCbrExamStatus(
    [
      appt("exam", "completed", past(30), "failed"),
      appt("exam", "completed", past(3), "passed"),
    ],
    NOW,
  );
  assert.equal(d.examStatus, "geslaagd");
  assert.equal(d.lastExamResult, "passed");
});

test("gezakt zonder nieuw examen → gezakt", () => {
  const d = deriveCbrExamStatus(
    [appt("exam", "completed", past(2), "failed")],
    NOW,
  );
  assert.equal(d.examStatus, "gezakt");
  assert.equal(d.lastExamResult, "failed");
  assert.equal(d.lastExamAt, past(2));
});

test("gezakt mét nieuw gepland examen → kop=examen_gepland, uitslag blijft zichtbaar", () => {
  const d = deriveCbrExamStatus(
    [
      appt("exam", "completed", past(10), "failed"),
      appt("exam", "planned", future(14)),
    ],
    NOW,
  );
  // Kop is voorwaarts (herexamen gepland) ...
  assert.equal(d.examStatus, "examen_gepland");
  assert.equal(d.nextExamAt, future(14));
  // ... maar de laatste gezakte uitslag + datum blijven beschikbaar voor de UI.
  assert.equal(d.lastExamResult, "failed");
  assert.equal(d.lastExamAt, past(10));
});

test("alleen afgeronde toets → afgerond", () => {
  const d = deriveCbrExamStatus(
    [appt("interim_test", "completed", past(5), "passed")],
    NOW,
  );
  assert.equal(d.examStatus, "afgerond");
  assert.equal(d.lastExamResult, null);
});

test("geannuleerd examen telt niet mee", () => {
  const d = deriveCbrExamStatus(
    [appt("exam", "cancelled", past(1), null)],
    NOW,
  );
  assert.equal(d.examStatus, "geen");
});

test("meest recente examen-uitslag wint", () => {
  const d = deriveCbrExamStatus(
    [
      appt("exam", "completed", past(40), "passed"),
      appt("exam", "completed", past(1), "failed"),
    ],
    NOW,
  );
  // Laatste poging is gezakt en niets nieuws gepland → gezakt.
  assert.equal(d.examStatus, "gezakt");
  assert.equal(d.lastExamResult, "failed");
});

test("nextAppointment = eerstvolgende van examen/toets", () => {
  const d = deriveCbrExamStatus(
    [
      appt("exam", "planned", future(20)),
      appt("interim_test", "planned", future(5)),
    ],
    NOW,
  );
  assert.equal(d.nextAppointmentAt, future(5));
  assert.equal(d.nextAppointmentType, "interim_test");
});
