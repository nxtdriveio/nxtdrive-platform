export type StudentJourneyStep = {
  label: string;
  status: "complete" | "active" | "upcoming";
  value?: string;
};

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function roundedJourneyPct(progressValues: number[]) {
  if (progressValues.length === 0) return 0;
  return Math.max(0, Math.min(100, Math.round(average(progressValues))));
}

export function buildStudentJourneySteps(params: {
  theoryDone: boolean;
  completedLessonsCount: number;
  drivingTarget: number;
  hasCompletedTtt: boolean;
  hasPlannedTtt: boolean;
  hasCompletedExam: boolean;
  hasPlannedExam: boolean;
  passedExam: boolean;
}): StudentJourneyStep[] {
  return [
    { label: "Intake", status: "complete" },
    {
      label: "Theorie",
      status: params.theoryDone ? "complete" : "active",
      value: params.theoryDone ? "Gehaald" : undefined,
    },
    {
      label: "Rijlessen",
      status:
        params.passedExam || params.completedLessonsCount >= params.drivingTarget
          ? "complete"
          : params.completedLessonsCount > 0
            ? "active"
            : "upcoming",
      value: `${params.completedLessonsCount} / ${params.drivingTarget}`,
    },
    {
      label: "TTT",
      status: params.hasCompletedTtt
        ? "complete"
        : params.hasPlannedTtt
          ? "active"
          : "upcoming",
    },
    {
      label: "Praktijkexamen",
      status: params.hasCompletedExam
        ? "complete"
        : params.hasPlannedExam
          ? "active"
          : "upcoming",
    },
    {
      label: "Rijbewijs",
      status: params.passedExam ? "complete" : "upcoming",
    },
  ];
}
