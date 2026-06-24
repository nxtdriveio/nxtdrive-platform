import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LESSON_STATUS_LABEL,
  LESSON_STATUS_VARIANT,
  type Lesson,
} from "@/lib/lessons/types";
import { formatTegoed, formatHours } from "@/lib/students/types";
import { formatEuros } from "@/lib/invoices/types";
import type {
  CockpitProgress,
  CockpitPayment,
} from "@/lib/instructor/cockpit-data";

const timeFmt = new Intl.DateTimeFormat("nl-NL", {
  hour: "2-digit",
  minute: "2-digit",
});

function Ring({ pct }: { pct: number }) {
  const safe = Math.max(0, Math.min(100, pct));
  const r = 36;
  const c = 2 * Math.PI * r;
  const offset = c - (safe / 100) * c;
  return (
    <svg viewBox="0 0 100 100" className="h-24 w-24 shrink-0" aria-hidden>
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        className="stroke-border"
        strokeWidth="10"
      />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        className="stroke-primary"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 50 50)"
      />
      <text
        x="50"
        y="55"
        textAnchor="middle"
        className="fill-foreground text-[22px] font-bold"
      >
        {Math.round(safe)}%
      </text>
    </svg>
  );
}

function PaymentBadge({ payment }: { payment: CockpitPayment }) {
  if (payment.state === "outstanding") {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/8 px-3 py-2">
        <span className="text-xs text-muted-foreground">Betaling</span>
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatEuros(payment.outstandingCents)}
          </span>
          <Badge variant="warning">Openstaand</Badge>
        </span>
      </div>
    );
  }
  if (payment.state === "paid") {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-success/30 bg-success/8 px-3 py-2">
        <span className="text-xs text-muted-foreground">Betaling</span>
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatEuros(payment.paidCents)}
          </span>
          <Badge variant="success">Betaald</Badge>
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
      <span className="text-xs text-muted-foreground">Betaling</span>
      <Badge variant="default">Geen facturen</Badge>
    </div>
  );
}

export function InstructorProgressCard({
  lesson,
  progressScore,
  progress,
  payment,
}: {
  lesson: Lesson;
  progressScore: number | null;
  progress: CockpitProgress;
  payment: CockpitPayment;
}) {
  const durMin = Math.round(
    (new Date(lesson.ends_at).getTime() -
      new Date(lesson.starts_at).getTime()) /
      60000,
  );

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        {/* Lesson timing + status */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase text-muted-foreground">
              Les voortgang
            </div>
            <div className="mt-0.5 text-sm font-medium text-foreground">
              {timeFmt.format(new Date(lesson.starts_at))}
              {"–"}
              {timeFmt.format(new Date(lesson.ends_at))}
              <span className="ml-1 text-muted-foreground">· {durMin} min</span>
            </div>
          </div>
          <Badge variant={LESSON_STATUS_VARIANT[lesson.status]}>
            {LESSON_STATUS_LABEL[lesson.status]}
          </Badge>
        </div>

        {/* Progress ring + stats */}
        <div className="flex items-center gap-4">
          <Ring pct={progress.ringPct} />
          <div className="flex-1 space-y-2.5">
            <div>
              <div className="text-[11px] uppercase text-muted-foreground">
                Voortgang in lesuren
              </div>
              <div className="mt-0.5 text-base font-bold text-foreground">
                {formatHours(progress.completedMinutes)}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  / {formatHours(progress.purchasedMinutes)} uur
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border bg-muted/40 px-2.5 py-2">
                <div className="text-[10px] uppercase text-muted-foreground">
                  Gereden
                </div>
                <div className="mt-0.5 font-semibold tabular-nums text-foreground">
                  {formatHours(progress.completedMinutes)} u
                </div>
              </div>
              <div className="rounded-lg border border-border bg-muted/40 px-2.5 py-2">
                <div className="text-[10px] uppercase text-muted-foreground">
                  Tegoed
                </div>
                <div className="mt-0.5 font-semibold tabular-nums text-primary">
                  {formatHours(progress.balanceMinutes)} u
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Extra stats */}
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Voortgangscore</span>
            <span className="font-semibold tabular-nums text-foreground">
              {progressScore != null ? `${Math.min(8, progressScore)} / 8` : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Tegoed deze les</span>
            <span className="font-semibold tabular-nums text-foreground">
              {formatTegoed(lesson.credits_cost)}
            </span>
          </div>
        </div>

        <PaymentBadge payment={payment} />

        {lesson.location ? (
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Locatie:</span>{" "}
            {lesson.location}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
