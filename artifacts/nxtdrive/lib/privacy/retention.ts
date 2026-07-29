export type RetentionRule = {
  dataCategory: string;
  retentionPeriod: string | null;
  action: "DELETE" | "ANONYMIZE" | "REVIEW";
  legalBasisReference?: string;
  approvalStatus: "DRAFT" | "LEGAL_REVIEW" | "APPROVED";
};

export type RetentionRecord = {
  id: string;
  dataCategory: string;
  createdAt: string;
  legalHold: boolean;
};

export type RetentionPreviewItem = {
  recordId: string;
  dataCategory: string;
  decision: "DELETE" | "ANONYMIZE" | "REVIEW" | "KEEP" | "LEGAL_HOLD";
  reason:
    | "PERIOD_ELAPSED"
    | "PERIOD_NOT_ELAPSED"
    | "PERIOD_NOT_CONFIGURED"
    | "POLICY_NOT_APPROVED"
    | "LEGAL_HOLD"
    | "INVALID_DATE";
};

function subtractPeriod(now: Date, period: string): Date | null {
  const match = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?$/.exec(period);
  if (!match || (!match[1] && !match[2] && !match[3])) return null;
  const result = new Date(now);
  result.setUTCFullYear(result.getUTCFullYear() - Number(match[1] ?? 0));
  result.setUTCMonth(result.getUTCMonth() - Number(match[2] ?? 0));
  result.setUTCDate(result.getUTCDate() - Number(match[3] ?? 0));
  return result;
}

export function buildRetentionPreview(input: {
  rules: RetentionRule[];
  records: RetentionRecord[];
  now: Date;
}): RetentionPreviewItem[] {
  const rules = new Map(input.rules.map((rule) => [rule.dataCategory, rule]));
  return input.records.map((record) => {
    if (record.legalHold) {
      return {
        recordId: record.id,
        dataCategory: record.dataCategory,
        decision: "LEGAL_HOLD",
        reason: "LEGAL_HOLD",
      };
    }
    const rule = rules.get(record.dataCategory);
    if (!rule || !rule.retentionPeriod) {
      return {
        recordId: record.id,
        dataCategory: record.dataCategory,
        decision: "REVIEW",
        reason: "PERIOD_NOT_CONFIGURED",
      };
    }
    if (rule.approvalStatus !== "APPROVED") {
      return {
        recordId: record.id,
        dataCategory: record.dataCategory,
        decision: "REVIEW",
        reason: "POLICY_NOT_APPROVED",
      };
    }
    const createdAt = new Date(record.createdAt);
    const threshold = subtractPeriod(input.now, rule.retentionPeriod);
    if (Number.isNaN(createdAt.getTime()) || !threshold) {
      return {
        recordId: record.id,
        dataCategory: record.dataCategory,
        decision: "REVIEW",
        reason: "INVALID_DATE",
      };
    }
    const elapsed = createdAt <= threshold;
    return {
      recordId: record.id,
      dataCategory: record.dataCategory,
      decision: elapsed ? rule.action : "KEEP",
      reason: elapsed ? "PERIOD_ELAPSED" : "PERIOD_NOT_ELAPSED",
    };
  });
}
