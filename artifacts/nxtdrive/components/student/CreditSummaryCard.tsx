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
    <Link href="/student/betalingen" className="block min-w-0">
      <PWACard className="transition-colors hover:border-muted-foreground/40">
        <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
          <PWASectionHeader
            icon={<Wallet className="h-3.5 w-3.5" aria-hidden />}
            className="mb-0 min-w-0"
          >
            Resterend tegoed
          </PWASectionHeader>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </div>

        <div className="min-w-0 space-y-3">
          <div className="flex min-w-0 items-end justify-between gap-2">
            <div className={`text-4xl font-black tabular-nums ${tone.text}`}>
              {formatTegoed(Math.max(0, availableMinutes))}
            </div>
            {purchasedMinutes > 0 ? (
              <div className="pb-1 text-right text-xs text-muted-foreground tabular-nums">
                van {formatTegoed(purchasedMinutes)}
              </div>
            ) : null}
          </div>

          {purchasedMinutes > 0 ? (
            <div className="space-y-1.5">
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
            <div className={`rounded-2xl px-3 py-2 ${tone.bg}`}>
              <p className="text-xs font-medium leading-5 text-danger">
                Je tegoed is op. Bekijk je betalingen of koop een nieuw pakket.
              </p>
            </div>
          ) : availableMinutes < 90 ? (
            <div className={`rounded-2xl px-3 py-2 ${tone.bg}`}>
              <p className="text-xs font-medium leading-5 text-warning">
                Je tegoed raakt op. Denk op tijd aan bijkopen.
              </p>
            </div>
          ) : null}
        </div>
      </PWACard>
    </Link>
  );
}
