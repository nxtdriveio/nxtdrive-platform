import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveStudentNextAction,
  type StudentNextActionInput,
} from "./next-action";

const BASE: StudentNextActionInput = {
  nowIso: "2026-07-31T08:00:00.000Z",
  examInvitationCount: 0,
  lessonProposalCount: 0,
  overdueInvoiceCount: 0,
  creditAvailableMinutes: 600,
  nextLesson: {
    href: "/leerling/lessen/les-1",
    startsAt: "2026-08-02T08:00:00.000Z",
  },
  cbr: {
    theoryDone: true,
    authorizationReceived: true,
    healthDeclarationRequired: false,
    healthDeclarationDone: false,
  },
  fallback: {
    title: "Oefen kijkgedrag",
    body: "Blijf vooruit kijken.",
    href: "/leerling/voortgang",
  },
};

test("student action prioritizes a response over finance and planning", () => {
  const action = deriveStudentNextAction({
    ...BASE,
    examInvitationCount: 1,
    overdueInvoiceCount: 1,
    nextLesson: null,
  });
  assert.equal(action.kind, "response");
  assert.equal(action.href, "#openstaande-acties");
});

test("student action surfaces an overdue invoice", () => {
  const action = deriveStudentNextAction({
    ...BASE,
    overdueInvoiceCount: 1,
  });
  assert.equal(action.kind, "payment");
  assert.equal(action.href, "/leerling/betalingen");
});

test("student action opens a lesson starting within 24 hours", () => {
  const action = deriveStudentNextAction({
    ...BASE,
    nextLesson: {
      href: "/leerling/lessen/les-2",
      startsAt: "2026-08-01T07:30:00.000Z",
    },
  });
  assert.equal(action.kind, "lesson");
  assert.equal(action.href, "/leerling/lessen/les-2");
});

test("student action exposes concrete CBR blockers", () => {
  const action = deriveStudentNextAction({
    ...BASE,
    cbr: { ...BASE.cbr, authorizationReceived: false },
  });
  assert.equal(action.kind, "cbr");
  assert.match(action.title, /CBR-machtiging/);
});

test("student action asks for planning when no next lesson exists", () => {
  const action = deriveStudentNextAction({
    ...BASE,
    nextLesson: null,
  });
  assert.equal(action.kind, "planning");
  assert.equal(action.href, "/leerling/lessen");
});

test("student action falls back to the personal practice focus", () => {
  const action = deriveStudentNextAction(BASE);
  assert.equal(action.kind, "practice");
  assert.equal(action.title, BASE.fallback.title);
});
