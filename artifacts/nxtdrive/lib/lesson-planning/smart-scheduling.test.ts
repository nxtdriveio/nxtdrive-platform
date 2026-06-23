import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  generateSmartLessonSuggestions,
  type GenerateSmartLessonSuggestionsInput,
} from "@/lib/lesson-planning/smart-scheduling";

const baseInput: GenerateSmartLessonSuggestionsInput = {
  tenantId: "tenant-1",
  studentId: "student-1",
  instructorId: "instructor-1",
  seedDate: "2026-06-23",
  seedTime: "10:00",
  durationMin: 50,
  bufferMin: 0,
  timeZone: "Europe/Amsterdam",
  actor: {
    userId: "student-1",
    roles: ["student"],
    branchAccess: [{ tenantId: "tenant-1", branchIds: "all" }],
  },
  scope: { type: "branch", tenantId: "tenant-1", branchId: "branch-a" },
  branchId: "branch-a",
};

class FakeQuery {
  constructor(
    private readonly table: string,
    private readonly rows: Record<string, unknown>,
  ) {}

  select(_columns: string): this {
    return this;
  }

  eq(_column: string, _value: unknown): this {
    return this;
  }

  maybeSingle() {
    return { data: this.rows[this.table] ?? null, error: null };
  }
}

function clientWithRows(rows: Record<string, unknown>): any {
  return {
    from(table: string) {
      return new FakeQuery(table, rows);
    },
  };
}

describe("generateSmartLessonSuggestions", () => {
  it("returns an empty result without student or instructor ids", async () => {
    const result = await generateSmartLessonSuggestions({} as any, {
      ...baseInput,
      studentId: "",
    });

    assert.deepEqual(result, {
      suggestions: [],
      blockingReasons: [],
      balanceMinutes: 0,
    });
  });

  it("rejects invalid lesson durations before querying planning data", async () => {
    const result = await generateSmartLessonSuggestions({} as any, {
      ...baseInput,
      durationMin: 10,
    });

    assert.deepEqual(result, {
      suggestions: [],
      blockingReasons: ["Ongeldige lesduur."],
      balanceMinutes: 0,
    });
  });

  it("blocks suggestions when credit is insufficient and requests are not allowed", async () => {
    const result = await generateSmartLessonSuggestions(
      clientWithRows({
        students: {
          id: "student-1",
          full_name: "Leerling",
          tenant_id: "tenant-1",
          branch_id: "branch-a",
          preferred_dayparts: ["morning"],
        },
        student_credit_balance: {
          student_id: "student-1",
          balance: 30,
        },
      }),
      {
        ...baseInput,
        durationMin: 50,
        allowInsufficientCredit: false,
      },
    );

    assert.equal(result.balanceMinutes, 30);
    assert.deepEqual(result.suggestions, []);
    assert.deepEqual(result.blockingReasons, [
      "Onvoldoende tegoed: 30 min beschikbaar voor 50 min les.",
    ]);
  });
});
