import { Card, CardContent } from "@/components/ui/card";
import { formatTegoed, type StudentCreditBreakdown } from "@/lib/students/types";

type Row = {
  label: string;
  minutes: number;
  tone?: "default" | "positive" | "negative" | "muted";
  hint?: string;
};

/**
 * Hour-based tegoed breakdown (Module 5). Shows the canon split:
 * gekocht / gereden / ingepland / beschikbaar plus teruggegeven, correcties,
 * verlopen and (informational) ingehouden. All values come from the
 * student_credit_breakdown view; everything is shown in hours.
 */
export function CreditBreakdownCard({
  breakdown,
}: {
  breakdown: StudentCreditBreakdown;
}) {
  const rows: Row[] = [
    { label: "Gekocht", minutes: breakdown.purchased_minutes, tone: "positive" },
    { label: "Gereden", minutes: breakdown.driven_minutes, tone: "muted" },
    { label: "Ingepland", minutes: breakdown.planned_minutes, tone: "muted" },
  ];
  if (breakdown.refunded_minutes !== 0) {
    rows.push({
      label: "Teruggegeven",
      minutes: breakdown.refunded_minutes,
      tone: "positive",
      hint: "Teruggeboekt na annulering",
    });
  }
  if (breakdown.withheld_minutes !== 0) {
    rows.push({
      label: "Ingehouden",
      minutes: breakdown.withheld_minutes,
      tone: "muted",
      hint: "Niet teruggegeven bij annulering / no-show",
    });
  }
  if (breakdown.adjustment_minutes !== 0) {
    rows.push({
      label: "Correcties",
      minutes: breakdown.adjustment_minutes,
      tone: breakdown.adjustment_minutes >= 0 ? "positive" : "negative",
    });
  }
  if (breakdown.expired_minutes !== 0) {
    rows.push({
      label: "Verlopen",
      minutes: breakdown.expired_minutes,
      tone: "negative",
      hint: "Vervallen door geldigheid pakket",
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Tegoedoverzicht
        </div>
        <dl className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.label}
              className="flex items-baseline justify-between gap-3"
            >
              <dt className="text-sm text-foreground">
                {r.label}
                {r.hint ? (
                  <span className="ml-1 text-xs text-muted-foreground">
                    · {r.hint}
                  </span>
                ) : null}
              </dt>
              <dd
                className={`text-sm font-medium tabular-nums ${toneClass(r.tone)}`}
              >
                {formatTegoed(r.minutes)}
              </dd>
            </div>
          ))}
          <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-border pt-3">
            <dt className="text-sm font-semibold text-foreground">
              Vrij beschikbaar
            </dt>
            <dd
              className={`text-base font-bold tabular-nums ${
                breakdown.available_minutes > 0
                  ? "text-success"
                  : "text-danger"
              }`}
            >
              {formatTegoed(breakdown.available_minutes)}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function toneClass(tone: Row["tone"]): string {
  switch (tone) {
    case "positive":
      return "text-success";
    case "negative":
      return "text-danger";
    case "muted":
      return "text-muted-foreground";
    default:
      return "text-foreground";
  }
}
