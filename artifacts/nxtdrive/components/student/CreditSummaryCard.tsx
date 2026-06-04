import Link from "next/link";
import { Wallet, ChevronRight } from "lucide-react";
import { PWACard, PWASectionHeader } from "@/components/pwa/primitives";
import { formatTegoed } from "@/lib/students/types";

/**
 * Home "resterend tegoed" card with a visual progress bar showing % used.
 * Tone: green when comfortable, amber when low, red when empty.
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
      ? { text: "text-danger", bar: "bg-danger", bg: "bg-danger/10" }
      : availableMinutes < 90
        ? { text: "text-warning", bar: "bg-warning", bg: "bg-warning/10" }
        : { text: "text-success", bar: "bg-success", bg: "bg-success/10" };

  return (
    <Link href="/student/betalingen" className="block">
      <PWACard className="transition-colors hover:border-muted-foreground/40">
        <div className="flex items-center justify-between mb-3">
          <PWASectionHeader
            icon={<Wallet className="h-3.5 w-3.5" aria-hidden />}
            className="mb-0"
          >
            Resterend tegoed
          </PWASectionHeader>
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
        </div>

        <div className="space-y-3">
          <div className="flex items-end justify-between gap-2">
            <div className={`text-3xl font-bold tabular-nums ${tone.text}`}>
              {formatTegoed(Math.max(0, availableMinutes))}
            </div>
            {purchasedMinutes > 0 ? (
              <div className="text-xs text-muted-foreground tabular-nums pb-1">
                van {formatTegoed(purchasedMinutes)}
              </div>
            ) : null}
          </div>

          {purchasedMinutes > 0 ? (
            <div className="space-y-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${tone.bar}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground">{pct}% resterend</div>
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
      </PWACard>
    </Link>
  );
}
