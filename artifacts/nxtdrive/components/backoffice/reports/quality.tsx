import {
  ADVICE_LABELS,
  PHASE_LABELS,
  type ReadinessAdvice,
  type ReadinessPhase,
} from "@workspace/leskaart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  InstructorProgressRow,
  QualityOverview,
  StudentReadinessRow,
} from "@/lib/reports/quality-overview";

const adviceVariant: Record<ReadinessAdvice, "success" | "warning" | "danger"> = {
  examenwaardig: "success",
  bijna_examenrijp: "warning",
  niet_examenrijp: "danger",
};

const PHASE_ORDER: ReadinessPhase[] = [
  "beginfase",
  "ontwikkelfase",
  "gevorderd",
  "bijna_examenrijp",
  "examenwaardig",
];

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  timeZone: "Europe/Amsterdam",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatLessonDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dateFmt.format(d);
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

export function QualityKpis({ data }: { data: QualityOverview }) {
  const examReadyShare = pct(
    data.examenwaardigCount + data.bijnaExamenrijpCount,
    data.studentCount,
  );
  const theoryShare = pct(data.theoriePassedCount, data.studentCount);
  const totalLessons =
    data.completedLessons + data.cancelledLessons + data.noShowLessons;
  const completionShare = pct(data.completedLessons, totalLessons);

  const cards = [
    {
      title: "Actieve leerlingen",
      value: data.studentCount.toLocaleString("nl-NL"),
      hint: `${data.studentsWithScores.toLocaleString("nl-NL")} met beoordelingen`,
    },
    {
      title: "Gem. examenrijpheid",
      value: data.avgReadinessPct === null ? "—" : `${data.avgReadinessPct}%`,
      hint: "gemiddelde readinessscore",
    },
    {
      title: "Examenrijp of bijna",
      value: (data.examenwaardigCount + data.bijnaExamenrijpCount).toLocaleString(
        "nl-NL",
      ),
      hint: `${examReadyShare}% van de leerlingen`,
    },
    {
      title: "Kritieke aandachtspunten",
      value: data.criticalConcernCount.toLocaleString("nl-NL"),
      hint: "leerlingen met kernvaardigheid < 8",
    },
    {
      title: "Theorie behaald",
      value: data.theoriePassedCount.toLocaleString("nl-NL"),
      hint: `${theoryShare}% van de leerlingen`,
    },
    {
      title: "Lesvoltooiing",
      value: `${completionShare}%`,
      hint: `${data.cancelledLessons.toLocaleString("nl-NL")} geannuleerd · ${data.noShowLessons.toLocaleString("nl-NL")} no-show`,
    },
  ];

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => (
        <Card key={c.title}>
          <CardHeader>
            <CardTitle>{c.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-foreground tabular-nums">
              {c.value}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

export function PhaseDistribution({ data }: { data: QualityOverview }) {
  const total = data.studentCount;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Examenrijpheid per fase</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {PHASE_ORDER.map((phase) => {
          const count = data.phaseBands[phase];
          const share = pct(count, total);
          return (
            <div key={phase} className="space-y-1">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-foreground">{PHASE_LABELS[phase]}</span>
                <span className="text-muted-foreground tabular-nums">
                  {count.toLocaleString("nl-NL")} · {share}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${share}%` }}
                />
              </div>
            </div>
          );
        })}
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nog geen actieve leerlingen om te tonen.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function StudentReadinessTable({
  students,
}: {
  students: StudentReadinessRow[];
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Examenrijpheid per leerling</CardTitle>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-y border-border bg-muted/40 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Leerling</th>
              <th className="px-4 py-3 text-right font-medium">Readiness</th>
              <th className="px-4 py-3 font-medium">Fase</th>
              <th className="px-4 py-3 font-medium">Advies</th>
              <th className="px-4 py-3 text-right font-medium">Beoordeeld</th>
              <th className="px-4 py-3 text-right font-medium">Kritiek &lt; 8</th>
              <th className="px-4 py-3 text-right font-medium">Laatste les</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {students.map((s) => (
              <tr key={s.studentId}>
                <td className="px-4 py-2.5 text-foreground">{s.name}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                  {s.readiness.readinessPct}%
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {PHASE_LABELS[s.readiness.phase]}
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant={adviceVariant[s.readiness.advice]}>
                    {ADVICE_LABELS[s.readiness.advice]}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {s.readiness.scoredLeaves}/{s.readiness.totalLeaves}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {s.readiness.criticalBelowThreshold}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {formatLessonDate(s.lastLessonAt)}
                </td>
              </tr>
            ))}
            {students.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-6 text-center text-sm text-muted-foreground"
                >
                  Nog geen actieve leerlingen.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function InstructorProgressTable({
  instructors,
}: {
  instructors: InstructorProgressRow[];
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Voortgang per instructeur</CardTitle>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-y border-border bg-muted/40 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Instructeur</th>
              <th className="px-4 py-3 text-right font-medium">Lessen gegeven</th>
              <th className="px-4 py-3 text-right font-medium">Leerlingen</th>
              <th className="px-4 py-3 text-right font-medium">Gem. lescijfer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {instructors.map((i) => (
              <tr key={i.instructorId}>
                <td className="px-4 py-2.5 text-foreground">{i.name}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-foreground">
                  {i.completedLessons.toLocaleString("nl-NL")}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {i.studentsTaught.toLocaleString("nl-NL")}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {i.avgLessonScore === null ? "—" : i.avgLessonScore.toFixed(1)}
                </td>
              </tr>
            ))}
            {instructors.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-center text-sm text-muted-foreground"
                >
                  Nog geen instructeurs.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
