export const LESSON_COMPLETION_TARGET_MS = 60_000;
export const LESSON_COMPLETION_BOUNDARY_VERSION =
  "quick_panel_interactive_to_publish_ack_v1";

export type LessonCompletionMeasurementInput = {
  sessionId: string;
  startedAt: string;
  durationMs: number;
  viewportWidth: number;
  viewportHeight: number;
  boundaryVersion: typeof LESSON_COMPLETION_BOUNDARY_VERSION;
};

export type LessonCompletionMeasurement = LessonCompletionMeasurementInput & {
  withinTarget: boolean;
  targetMs: number;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeLessonCompletionMeasurement(
  input: LessonCompletionMeasurementInput,
): LessonCompletionMeasurement | null {
  if (
    !UUID_PATTERN.test(input.sessionId) ||
    input.boundaryVersion !== LESSON_COMPLETION_BOUNDARY_VERSION
  ) {
    return null;
  }
  const startedAt = new Date(input.startedAt);
  if (Number.isNaN(startedAt.getTime())) return null;

  const durationMs = Math.round(input.durationMs);
  const viewportWidth = Math.round(input.viewportWidth);
  const viewportHeight = Math.round(input.viewportHeight);
  if (
    !Number.isFinite(durationMs) ||
    durationMs < 0 ||
    durationMs > 6 * 60 * 60 * 1000 ||
    viewportWidth < 240 ||
    viewportWidth > 10_000 ||
    viewportHeight < 240 ||
    viewportHeight > 10_000
  ) {
    return null;
  }

  return {
    sessionId: input.sessionId,
    startedAt: startedAt.toISOString(),
    durationMs,
    viewportWidth,
    viewportHeight,
    boundaryVersion: LESSON_COMPLETION_BOUNDARY_VERSION,
    targetMs: LESSON_COMPLETION_TARGET_MS,
    withinTarget: durationMs <= LESSON_COMPLETION_TARGET_MS,
  };
}
