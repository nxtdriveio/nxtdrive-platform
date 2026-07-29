/**
 * The only training methods supported by the canonical training domain.
 *
 * `RIS_1_0_LEGACY` deliberately remains a first-class value so imported
 * history can be rendered and exported without pretending it is RIS 2.0.
 * It is never an active authoring mode.
 */
export const TRAINING_METHODS = [
  "STANDARD",
  "RIS_2_0",
  "RIS_1_0_LEGACY",
] as const;

export type TrainingMethod = (typeof TRAINING_METHODS)[number];

export type TrainingMethodOperation =
  | "CREATE_ENROLLMENT"
  | "PLAN_LESSON"
  | "RECORD_OBSERVATION"
  | "CREATE_ASSESSMENT"
  | "EVALUATE_READINESS"
  | "IMPORT_HISTORY"
  | "READ_HISTORY"
  | "EXPORT_HISTORY"
  | "PREPARE_MIGRATION"
  | "ADMINISTRATIVE_CORRECTION";

export type TrainingMethodCapability = {
  method: TrainingMethod;
  activeForNewEnrollments: boolean;
  immutable: boolean;
  allowedOperations: readonly TrainingMethodOperation[];
};

const ACTIVE_OPERATIONS = [
  "CREATE_ENROLLMENT",
  "PLAN_LESSON",
  "RECORD_OBSERVATION",
  "CREATE_ASSESSMENT",
  "EVALUATE_READINESS",
  "READ_HISTORY",
  "EXPORT_HISTORY",
] as const satisfies readonly TrainingMethodOperation[];

export const TRAINING_METHOD_CAPABILITIES: Readonly<
  Record<TrainingMethod, TrainingMethodCapability>
> = Object.freeze({
  STANDARD: Object.freeze({
    method: "STANDARD",
    activeForNewEnrollments: true,
    immutable: false,
    allowedOperations: ACTIVE_OPERATIONS,
  }),
  RIS_2_0: Object.freeze({
    method: "RIS_2_0",
    activeForNewEnrollments: true,
    immutable: false,
    allowedOperations: ACTIVE_OPERATIONS,
  }),
  RIS_1_0_LEGACY: Object.freeze({
    method: "RIS_1_0_LEGACY",
    activeForNewEnrollments: false,
    immutable: true,
    allowedOperations: Object.freeze([
      "IMPORT_HISTORY",
      "READ_HISTORY",
      "EXPORT_HISTORY",
      "PREPARE_MIGRATION",
      // Historical/shadow evaluation is allowed so imported evidence can be
      // compared during migration. It can never activate a current RIS 1.0
      // decision (the engine enforces SHADOW for this method).
      "EVALUATE_READINESS",
      "ADMINISTRATIVE_CORRECTION",
    ] as const satisfies readonly TrainingMethodOperation[]),
  }),
});

export function isTrainingMethod(value: unknown): value is TrainingMethod {
  return (
    typeof value === "string" &&
    (TRAINING_METHODS as readonly string[]).includes(value)
  );
}

export function isTrainingMethodOperationAllowed(
  method: TrainingMethod,
  operation: TrainingMethodOperation,
): boolean {
  return TRAINING_METHOD_CAPABILITIES[method].allowedOperations.includes(
    operation,
  );
}

export function assertTrainingMethodOperationAllowed(
  method: TrainingMethod,
  operation: TrainingMethodOperation,
): void {
  if (!isTrainingMethodOperationAllowed(method, operation)) {
    throw new TrainingMethodOperationError(method, operation);
  }
}

export class TrainingMethodOperationError extends Error {
  readonly code = "TRAINING_METHOD_OPERATION_FORBIDDEN";

  constructor(
    readonly method: TrainingMethod,
    readonly operation: TrainingMethodOperation,
  ) {
    super(
      operation === "CREATE_ENROLLMENT" && method === "RIS_1_0_LEGACY"
        ? "Nieuwe RIS 1.0-inschrijvingen zijn niet toegestaan."
        : `Operation ${operation} is not allowed for immutable training method ${method}.`,
    );
    this.name = "TrainingMethodOperationError";
  }
}
