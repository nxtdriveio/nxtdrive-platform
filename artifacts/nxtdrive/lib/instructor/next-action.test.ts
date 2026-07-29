import assert from "node:assert/strict";
import test from "node:test";
import { deriveNextInstructorAction } from "./next-action";

test("an overdue instructor task takes precedence over a planned lesson", () => {
  const action = deriveNextInstructorAction({
    appointments: [
      {
        id: "lesson-1",
        type: "lesson",
        title: "Rijles",
        studentName: "Noor",
        startsAt: "10:00",
        endsAt: "11:00",
        duration: "60 min",
        location: "Utrecht",
        status: "planned",
        href: "/instructeur/lessen/lesson-1",
      },
    ],
    tasks: [
      {
        id: "task-1",
        title: "Leskaart afronden",
        subject: "Noor",
        due: "09:00",
        priority: "high",
        status: "late",
      },
    ],
    radar: [],
  });

  assert.deepEqual(action, {
    reasonCode: "OVERDUE_TASK",
    title: "Leskaart afronden",
    reason: "Deze taak is te laat en blokkeert een complete lesdag.",
    urgency: "Nu",
    subject: "Noor",
    time: "09:00",
    href: "/instructeur/taken",
  });
});

test("the next lesson is the primary action when no blocker exists", () => {
  const action = deriveNextInstructorAction({
    appointments: [
      {
        id: "lesson-1",
        type: "lesson",
        title: "Rijles",
        studentName: "Noor",
        startsAt: "10:00",
        endsAt: "11:00",
        duration: "60 min",
        location: "Utrecht",
        status: "planned",
        href: "/instructeur/lessen/lesson-1",
      },
    ],
    tasks: [],
    radar: [],
  });

  assert.equal(action.reasonCode, "NEXT_LESSON");
  assert.equal(action.subject, "Noor");
  assert.equal(action.href, "/instructeur/lessen/lesson-1");
});
