import Link from "next/link";
import { Wallet, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { RadialRing } from "@/components/charts/RadialRing";
import { formatTegoed } from "@/lib/students/types";

/**
 * Home "resterend tegoed" card (Task #177): a premium radial credit ring
 * (available vs purchased) next to the hours, linking through to the full
 * Betalingen tab. All values are minutes (canon), shown in hours. Tone: green
 * when comfortable, amber when low, red when empty — the ring inherits the tone.
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
      ? { text: "text-danger", ring: "var(--danger)" }
      : availableMinutes < 90
        ? { text: "text-warning", ring: "var(--warning)" }
        : { text: "text-success", ring: "var(--success)" };

  return (
    <Link href="/student/betalingen" className="block">
      <Card className="transition-colors hover:border-muted-foreground/40">
        <CardContent className="pt-5">
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

          <div className="mt-3 flex items-center gap-4">
            <RadialRing
              value={pct}
              color={tone.ring}
              size={92}
              label={`${pct}%`}
            />
            <div className="min-w-0 flex-1 space-y-1">
              <div
                className={`text-2xl font-bold tabular-nums ${tone.text}`}
              >
                {formatTegoed(Math.max(0, availableMinutes))}
              </div>
              {purchasedMinutes > 0 ? (
                <div className="text-xs text-muted-foreground tabular-nums">
                  van {formatTegoed(purchasedMinutes)} gekocht
                </div>
              ) : null}
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
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
