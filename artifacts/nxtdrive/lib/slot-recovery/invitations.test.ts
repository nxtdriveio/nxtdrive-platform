import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { listOpenSlotRecoveryInvitationsForStudent } from "@/lib/slot-recovery/invitations";

type QueryResult = { data: unknown[]; error: null };

class FakeQuery {
  readonly filters: Array<[string, string, unknown]> = [];

  constructor(private readonly result: QueryResult) {}

  select(_columns: string): this {
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push(["eq", column, value]);
    return this;
  }

  in(column: string, value: unknown): this {
    this.filters.push(["in", column, value]);
    return this;
  }

  gt(column: string, value: unknown): this {
    this.filters.push(["gt", column, value]);
    return this;
  }

  order(column: string, options: unknown): QueryResult {
    this.filters.push(["order", column, options]);
    return this.result;
  }
}

function clientForRows(rows: unknown[]): {
  client: any;
  query: FakeQuery;
} {
  const query = new FakeQuery({ data: rows, error: null });
  return {
    client: {
      from(table: string) {
        assert.equal(table, "booking_candidates");
        return query;
      },
    },
    query,
  };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "candidate-1",
    tenant_id: "tenant-1",
    booking_request_id: "request-1",
    candidate_student_id: "student-1",
    instructor_id: "instructor-1",
    starts_at: new Date(Date.now() + 60 * 60_000).toISOString(),
    ends_at: new Date(Date.now() + 110 * 60_000).toISOString(),
    duration_min: 50,
    pickup_location: "Thuis",
    status: "generated",
    score: 84,
    reason: "Vrijgevallen plek",
    metadata: null,
    booking_candidate_preferences: [],
    ...overrides,
  };
}

describe("slot recovery invitations", () => {
  it("filters expired hold metadata out of open student invitations", async () => {
    const futureExpiry = new Date(Date.now() + 15 * 60_000).toISOString();
    const pastExpiry = new Date(Date.now() - 15 * 60_000).toISOString();
    const { client, query } = clientForRows([
      row({ id: "open", metadata: { expires_at: futureExpiry } }),
      row({ id: "expired", metadata: { expires_at: pastExpiry } }),
      row({ id: "without-expiry", metadata: {} }),
    ]);

    const result = await listOpenSlotRecoveryInvitationsForStudent(
      client,
      "tenant-1",
      "student-1",
    );

    assert.deepEqual(
      result.map((invitation) => invitation.id),
      ["open", "without-expiry"],
    );
    assert.deepEqual(query.filters.slice(0, 3), [
      ["eq", "tenant_id", "tenant-1"],
      ["eq", "candidate_student_id", "student-1"],
      ["in", "status", ["generated", "selected"]],
    ]);
    assert.equal(query.filters[3]?.[0], "gt");
    assert.equal(query.filters[3]?.[1], "starts_at");
  });

  it("marks selected candidates and selected preferences as interest shown", async () => {
    const { client } = clientForRows([
      row({ id: "selected-candidate", status: "selected" }),
      row({
        id: "selected-preference",
        booking_candidate_preferences: [{ id: "pref-1", status: "selected" }],
      }),
      row({ id: "generated", booking_candidate_preferences: [] }),
    ]);

    const result = await listOpenSlotRecoveryInvitationsForStudent(
      client,
      "tenant-1",
      "student-1",
    );

    assert.deepEqual(
      result.map((invitation) => [
        invitation.id,
        invitation.interestShown,
      ]),
      [
        ["selected-candidate", true],
        ["selected-preference", true],
        ["generated", false],
      ],
    );
  });
});
