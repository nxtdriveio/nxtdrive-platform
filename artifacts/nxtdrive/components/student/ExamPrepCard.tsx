import {
  CalendarClock,
  Car,
  CheckCircle2,
  Circle,
  Clock3,
  GraduationCap,
  History,
  Lightbulb,
  ListChecks,
  MapPin,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  StudentChecklist,
  StudentShowcaseCard,
} from "@/components/student/Showcase";
import { createNlDateTimeFormatter } from "@/lib/datetime";
import type { StudentExamPrep } from "@/lib/exam/data";
import type { CbrPreconditions } from "@/lib/cbr/data";

const dateTimeFmt = createNlDateTimeFormatter({
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const timeFmt = createNlDateTimeFormatter({
  hour: "2-digit",
  minute: "2-digit",
});

const dateFmt = createNlDateTimeFormatter({
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
    <StudentShowcaseCard
      title={`${noun} voorbereiding`}
      eyebrow="Dossier"
      info="Alle belangrijke informatie voor je toets of praktijkexamen staat hier overzichtelijk bij elkaar."
      className="border-primary/20"
      style={{
        background:
          "linear-gradient(180deg, color-mix(in oklab, var(--primary) 18%, rgba(35,26,68,0.94)), rgba(10,10,22,0.98))",
      }}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary">
            <GraduationCap className="h-4 w-4" aria-hidden />
            {noun} gepland
          </div>
          {countdown ? <Badge variant={tone}>{countdown}</Badge> : null}
        </div>

        <div className="space-y-2 rounded-[1.15rem] border border-white/10 bg-white/[0.03] px-3 py-3">
          <Row icon={CalendarClock} value={dateTimeFmt.format(new Date(prep.startsAt))} />
          {prep.location ? <Row icon={MapPin} value={prep.location} /> : null}
          {pickupAt || pickupLocation ? (
            <Row
              icon={Car}
              value={[
                pickupAt ? `Ophalen ${timeFmt.format(new Date(pickupAt))}` : null,
                pickupLocation,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          ) : null}
        </div>

        {prep.documents.length > 0 ? (
          <StudentShowcaseCard title="Wat neem je mee?" eyebrow="Checklist" bodyClassName="px-0 py-0">
            <div className="px-4 py-4">
              <StudentChecklist
                items={prep.documents.map((document) => ({
                  label: document.label,
                  checked: document.checked,
                }))}
              />
            </div>
          </StudentShowcaseCard>
        ) : null}

        <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.03] px-3 py-3">
          <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/42">
            <ListChecks className="h-3.5 w-3.5 text-primary" aria-hidden />
            Controles
          </div>
          <div className="space-y-2">
            {isExam ? (
              <CheckRow label="Theorie behaald" done={preconditions.theorieBehaald} />
            ) : null}
            <CheckRow
              label="Machtiging (CBR)"
              done={preconditions.machtigingStatus === "ontvangen"}
              pending={preconditions.machtigingStatus === "aangevraagd"}
            />
            {preconditions.gezondheidsverklaringVereist ? (
              <CheckRow
                label="Gezondheidsverklaring"
                done={preconditions.gezondheidsverklaringGeregeld}
              />
            ) : null}
            <CheckRow label="Voldoende lestegoed" done={balance > 0} />
          </div>
        </div>

        {examDayNotes ? (
          <div className="rounded-[1.15rem] border border-amber-400/20 bg-amber-500/[0.08] px-3 py-3">
            <div className="text-sm font-semibold text-white">Aandachtspunten</div>
            <p className="mt-1 whitespace-pre-line text-sm leading-6 text-white/62">
              {examDayNotes}
            </p>
          </div>
        ) : null}

        {prep.policy.exam_day_tips.length > 0 ? (
          <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.03] px-3 py-3">
            <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/42">
              <Lightbulb className="h-3.5 w-3.5 text-primary" aria-hidden />
              Tips voor de examendag
            </div>
            <ul className="space-y-2">
              {prep.policy.exam_day_tips.map((tip, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-white/62">
                  <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {prep.recentLessons.length > 0 ? (
          <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.03] px-3 py-3">
            <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/42">
              <History className="h-3.5 w-3.5 text-primary" aria-hidden />
              Laatste lessen
            </div>
            <ul className="space-y-1.5">
              {prep.recentLessons.map((lesson) => (
                <li key={lesson.id} className="text-sm text-white/62">
                  {dateFmt.format(new Date(lesson.startsAt))}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </StudentShowcaseCard>
  );
}

function Row({
  icon: Icon,
  value,
}: {
  icon: typeof CalendarClock;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2 text-sm text-white/76">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span>{value}</span>
    </div>
  );
}

function CheckRow({
  label,
  done,
  pending = false,
}: {
  label: string;
  done: boolean;
  pending?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-white/64">{label}</span>
      {done ? (
        <span className="inline-flex items-center gap-1 text-emerald-300">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          In orde
        </span>
      ) : pending ? (
        <span className="inline-flex items-center gap-1 text-amber-300">
          <Circle className="h-4 w-4" aria-hidden />
          Aangevraagd
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-amber-300">
          <Circle className="h-4 w-4" aria-hidden />
          Open
        </span>
      )}
    </div>
  );
}
