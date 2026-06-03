import Link from "next/link";
import { Wallet, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatTegoed } from "@/lib/students/types";

/**
 * Compact home "resterend tegoed" bar — available vs purchased hours with a
 * progress bar — linking through to the full Betalingen tab. All values are in
 * minutes (canon) and shown in hours. Tone: green when comfortable, amber when
 * low, red when empty.
 */
export function CreditSummaryCard({
  availableMinutes,
  purchasedMinutes,
}: {
  availableMinutes: number;
  purchasedMinutes: number;
}) {
  const pct =
    purchasedMinutes > 0
      ? Math.max(
          0,
          Math.min(100, Math.round((availableMinutes / purchasedMinutes) * 100)),
        )
      : 0;
  const tone =
    availableMinutes <= 0
      ? { bar: "bg-danger", text: "text-danger" }
      : availableMinutes < 90
        ? { bar: "bg-warning", text: "text-warning" }
        : { bar: "bg-success", text: "text-success" };

  return (
    <Link href="/student/betalingen" className="block">
      <Card className="transition-colors hover:border-muted-foreground/40">
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Wallet className="h-4 w-4" aria-hidden />
              Resterend tegoed
            </div>
            <ChevronRight
              className="h-4 w-4 text-muted-foreground"
              aria-hidden
            />
          </div>

          <div className="flex items-baseline justify-between gap-3">
            <span className={`text-2xl font-bold tabular-nums ${tone.text}`}>
              {formatTegoed(Math.max(0, availableMinutes))}
            </span>
            {purchasedMinutes > 0 ? (
              <span className="text-xs text-muted-foreground tabular-nums">
                van {formatTegoed(purchasedMinutes)} gekocht
              </span>
            ) : null}
          </div>

          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Resterend tegoed"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`h-full rounded-full transition-all ${tone.bar}`}
              style={{ width: `${pct}%` }}
            />
          </div>

          {availableMinutes <= 0 ? (
            <p className="text-xs text-danger">
              Je tegoed is op. Koop een nieuw pakket om lessen te kunnen
              inplannen.
            </p>
          ) : availableMinutes < 90 ? (
            <p className="text-xs text-warning">
              Je tegoed raakt op. Denk op tijd aan bijkopen.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  );
}
