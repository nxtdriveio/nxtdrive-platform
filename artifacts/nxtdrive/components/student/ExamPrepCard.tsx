import {
  GraduationCap,
  CalendarClock,
  MapPin,
  Car,
  CheckCircle2,
  Circle,
  ListChecks,
  Lightbulb,
  Clock3,
  History,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { StudentExamPrep } from "@/lib/exam/data";
import type { CbrPreconditions } from "@/lib/cbr/data";

const dateTimeFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const timeFmt = new Intl.DateTimeFormat("nl-NL", {
  hour: "2-digit",
  minute: "2-digit",
});

const dateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

const DAY_MS = 86_400_000;

function daysUntil(iso: string, now: Date): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return Number.NaN;
  const startOfDayNow = new Date(now);
  startOfDayNow.setHours(0, 0, 0, 0);
  const examDay = new Date(ms);
  examDay.setHours(0, 0, 0, 0);
  return Math.round((examDay.getTime() - startOfDayNow.getTime()) / DAY_MS);
}

function countdownLabel(days: number): string {
  if (Number.isNaN(days)) return "";
  if (days < 0) return "geweest";
  if (days === 0) return "vandaag";
  if (days === 1) return "morgen";
  return `over ${days} dagen`;
}

/**
 * Leerling-zicht op de examenvoorbereiding (read-only). Toont datum/tijd/locatie,
 * ophaalmoment, de afvinkbare documentenlijst, de voorwaarden (theorie/CBR/
 * tegoed), tips voor de examendag, aandachtspunten, de laatst gereden lessen en
 * een aftelindicator. Alleen renderen wanneer er een examen gepland staat.
 */
export function ExamPrepCard({
  prep,
  preconditions,
  balance,
  now = new Date(),
}: {
  prep: StudentExamPrep;
  preconditions: CbrPreconditions;
  balance: number;
  now?: Date;
}) {
  const isExam = prep.examType === "exam";
  const noun = isExam ? "Examen" : "Tussentijdse toets";
  const days = daysUntil(prep.startsAt, now);
  const countdown = countdownLabel(days);
  const tone =
    days <= 7 ? "danger" : days <= 21 ? "warning" : ("info" as const);

  const pickupAt = prep.details?.pickupAt ?? null;
  const pickupLocation = prep.details?.pickupLocation ?? null;
  const examDayNotes = prep.details?.examDayNotes ?? null;

  return (
    <Card className="border-primary/40 bg-primary-soft/40">
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary">
            <GraduationCap className="h-4 w-4" aria-hidden />
            {noun} gepland
          </div>
          {countdown ? (
            <Badge variant={tone}>{countdown}</Badge>
          ) : null}
        </div>

        {/* Datum / tijd / locatie */}
        <div className="space-y-1.5">
          <div className="flex items-start gap-2 text-sm text-foreground">
            <CalendarClock
              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span className="font-medium capitalize">
              {dateTimeFmt.format(new Date(prep.startsAt))}
            </span>
          </div>
          {prep.location ? (
            <div className="flex items-start gap-2 text-sm text-foreground">
              <MapPin
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <span>{prep.location}</span>
            </div>
          ) : null}
        </div>

        {/* Ophaalmoment */}
        {pickupAt || pickupLocation ? (
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <Car
              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <div>
              <div className="font-medium text-foreground">Ophalen</div>
              <div className="text-muted-foreground">
                {pickupAt ? timeFmt.format(new Date(pickupAt)) : null}
                {pickupAt && pickupLocation ? " — " : null}
                {pickupLocation}
              </div>
            </div>
          </div>
        ) : null}

        {/* Documentenchecklist */}
        {prep.documents.length > 0 ? (
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <ListChecks className="h-4 w-4" aria-hidden />
              Wat neem je mee?
            </div>
            <ul className="space-y-1.5">
              {prep.documents.map((doc) => (
                <li
                  key={doc.code}
                  className="flex items-start gap-2 text-sm text-foreground"
                >
                  {doc.checked ? (
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-success"
                      aria-hidden
                    />
                  ) : (
                    <Circle
                      className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  )}
                  <span>{doc.label}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Voorwaarden: theorie / CBR / tegoed */}
        <section className="space-y-1.5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Controles
          </div>
          {isExam ? (
            <CheckRow label="Theorie behaald" done={preconditions.theorieBehaald} />
          ) : null}
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Machtiging (CBR)</span>
            <Badge
              variant={
                preconditions.machtigingStatus === "ontvangen"
                  ? "success"
                  : preconditions.machtigingStatus === "aangevraagd"
                    ? "warning"
                    : "default"
              }
            >
              {preconditions.machtigingStatus === "ontvangen"
                ? "Geregeld"
                : preconditions.machtigingStatus === "aangevraagd"
                  ? "Aangevraagd"
                  : "Nog nodig"}
            </Badge>
          </div>
          {preconditions.gezondheidsverklaringVereist ? (
            <CheckRow
              label="Gezondheidsverklaring"
              done={preconditions.gezondheidsverklaringGeregeld}
            />
          ) : null}
          <CheckRow label="Voldoende lestegoed" done={balance > 0} />
        </section>

        {/* Aandachtspunten van de rijschool */}
        {examDayNotes ? (
          <div className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-sm text-foreground">
            <div className="font-medium">Aandachtspunten</div>
            <p className="mt-1 whitespace-pre-line text-muted-foreground">
              {examDayNotes}
            </p>
          </div>
        ) : null}

        {/* Tips voor de examendag */}
        {prep.policy.exam_day_tips.length > 0 ? (
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Lightbulb className="h-4 w-4" aria-hidden />
              Tips voor de examendag
            </div>
            <ul className="space-y-1">
              {prep.policy.exam_day_tips.map((tip, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Laatst gereden lessen */}
        {prep.recentLessons.length > 0 ? (
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <History className="h-4 w-4" aria-hidden />
              Laatste lessen
            </div>
            <ul className="space-y-1">
              {prep.recentLessons.map((l) => (
                <li key={l.id} className="text-sm text-muted-foreground">
                  {dateFmt.format(new Date(l.startsAt))}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CheckRow({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {done ? (
        <span className="inline-flex items-center gap-1 text-success">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          In orde
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-warning">
          <Circle className="h-4 w-4" aria-hidden />
          Open
        </span>
      )}
    </div>
  );
}
