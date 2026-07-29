export type FeatureFlag =
  | "ai.instructor.enabled"
  | "ai.student.enabled"
  | "ai.admin.enabled"
  | "readiness.shadow.enabled"
  | "readiness.production.enabled";

const ENVIRONMENT_KEYS: Record<FeatureFlag, string> = {
  "ai.instructor.enabled": "NXT_AI_INSTRUCTOR_ENABLED",
  "ai.student.enabled": "NXT_AI_STUDENT_ENABLED",
  "ai.admin.enabled": "NXT_AI_ADMIN_ENABLED",
  "readiness.shadow.enabled": "NXT_READINESS_SHADOW_ENABLED",
  "readiness.production.enabled": "NXT_READINESS_PRODUCTION_ENABLED",
};

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return process.env[ENVIRONMENT_KEYS[flag]] === "true";
}

export const DEFAULT_FEATURE_FLAGS: Record<FeatureFlag, false> = {
  "ai.instructor.enabled": false,
  "ai.student.enabled": false,
  "ai.admin.enabled": false,
  "readiness.shadow.enabled": false,
  "readiness.production.enabled": false,
};
