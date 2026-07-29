import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildRetentionPreview,
  type RetentionRule,
} from "@/lib/privacy/retention";

const approvedRule: RetentionRule = {
  dataCategory: "lesson_draft",
  retentionPeriod: "P30D",
  action: "DELETE",
  approvalStatus: "APPROVED",
  legalBasisReference: "OWNER-APPROVED-POLICY",
};

describe("retention dry-run", () => {
  it("never invents a decision when the period is not configured", () => {
    const [item] = buildRetentionPreview({
      rules: [
        {
          ...approvedRule,
          retentionPeriod: null,
          approvalStatus: "LEGAL_REVIEW",
        },
      ],
      records: [
        {
          id: "record-1",
          dataCategory: "lesson_draft",
          createdAt: "2025-01-01T00:00:00.000Z",
          legalHold: false,
        },
      ],
      now: new Date("2026-07-29T12:00:00.000Z"),
    });
    assert.equal(item?.decision, "REVIEW");
    assert.equal(item?.reason, "PERIOD_NOT_CONFIGURED");
  });

  it("lets a legal hold override an otherwise elapsed rule", () => {
    const [item] = buildRetentionPreview({
      rules: [approvedRule],
      records: [
        {
          id: "record-1",
          dataCategory: "lesson_draft",
          createdAt: "2025-01-01T00:00:00.000Z",
          legalHold: true,
        },
      ],
      now: new Date("2026-07-29T12:00:00.000Z"),
    });
    assert.equal(item?.decision, "LEGAL_HOLD");
    assert.equal(item?.reason, "LEGAL_HOLD");
  });

  it("previews an approved elapsed action without executing it", () => {
    const [item] = buildRetentionPreview({
      rules: [approvedRule],
      records: [
        {
          id: "record-1",
          dataCategory: "lesson_draft",
          createdAt: "2026-01-01T00:00:00.000Z",
          legalHold: false,
        },
      ],
      now: new Date("2026-07-29T12:00:00.000Z"),
    });
    assert.equal(item?.decision, "DELETE");
    assert.equal(item?.reason, "PERIOD_ELAPSED");
  });
});
