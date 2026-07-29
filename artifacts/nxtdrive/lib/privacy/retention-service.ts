import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildRetentionPreview,
  type RetentionRecord,
  type RetentionRule,
} from "@/lib/privacy/retention";

function asRules(value: unknown): RetentionRule[] {
  if (!Array.isArray(value)) return [];
  return value.filter((rule): rule is RetentionRule => {
    if (!rule || typeof rule !== "object") return false;
    const candidate = rule as Partial<RetentionRule>;
    return (
      typeof candidate.dataCategory === "string" &&
      (candidate.retentionPeriod === null ||
        typeof candidate.retentionPeriod === "string") &&
      ["DELETE", "ANONYMIZE", "REVIEW"].includes(candidate.action ?? "") &&
      ["DRAFT", "LEGAL_REVIEW", "APPROVED"].includes(
        candidate.approvalStatus ?? "",
      )
    );
  });
}

export async function runRetentionDryRun(
  service: SupabaseClient,
  input: { tenantId: string; actorUserId: string; now: Date },
) {
  const { data: policy, error: policyError } = await service
    .from("retention_policy_versions")
    .select("id, version, approval_status, rules")
    .eq("tenant_id", input.tenantId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (policyError || !policy) {
    throw new Error(
      "No retention policy exists; configure periods and request legal review first.",
    );
  }

  const [{ data: students, error: studentError }, { data: holds, error: holdError }] =
    await Promise.all([
      service
        .from("students")
        .select("id, created_at")
        .eq("tenant_id", input.tenantId),
      service
        .from("privacy_legal_holds")
        .select("subject_student_id")
        .eq("tenant_id", input.tenantId)
        .is("released_at", null),
    ]);
  if (studentError || holdError) {
    throw new Error("Retention inventory could not be loaded.");
  }
  const heldStudentIds = new Set(
    (holds ?? [])
      .map((hold) => hold.subject_student_id as string | null)
      .filter((id): id is string => Boolean(id)),
  );
  const records: RetentionRecord[] = (students ?? []).map((student) => ({
    id: student.id as string,
    dataCategory: "student_profile",
    createdAt: student.created_at as string,
    legalHold: heldStudentIds.has(student.id as string),
  }));
  const preview = buildRetentionPreview({
    rules: asRules(policy.rules),
    records,
    now: input.now,
  });
  const counts = preview.reduce<Record<string, number>>((result, item) => {
    result[item.decision] = (result[item.decision] ?? 0) + 1;
    return result;
  }, {});
  const { data: run, error: runError } = await service
    .from("retention_runs")
    .insert({
      tenant_id: input.tenantId,
      policy_version_id: policy.id,
      mode: "DRY_RUN",
      status: "COMPLETED",
      summary: {
        policyVersion: policy.version,
        policyApprovalStatus: policy.approval_status,
        counts,
        reviewedRecords: preview.length,
      },
      started_by: input.actorUserId,
      completed_at: input.now.toISOString(),
    })
    .select("id")
    .single();
  if (runError || !run) throw new Error("Retention dry-run could not be audited.");
  return {
    runId: run.id as string,
    policyVersion: policy.version as number,
    approvalStatus: policy.approval_status as string,
    counts,
    preview: preview.slice(0, 100),
  };
}
