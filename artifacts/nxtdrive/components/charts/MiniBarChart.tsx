type Point = { label: string; cents: number };

const EURO_FORMATTER = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Compact revenue trend without a chart runtime. The native title and
 * aria-label retain the exact month/value detail for pointer and assistive
 * technology users while avoiding a large Recharts dependency on the
 * exception-first dashboard route.
 */
export function MiniBarChart({
  data,
  height = 56,
  barColor = "var(--primary)",
  showLabels = false,
}: {
  data: Point[];
  height?: number;
  barColor?: string;
  showLabels?: boolean;
}) {
  const maxCents = Math.max(1, ...data.map((point) => point.cents));

  return (
    <div
      className="flex w-full items-end gap-2"
      style={{ height }}
      role="img"
      aria-label="Omzettrend per maand"
    >
      {data.map((point) => {
        const value = EURO_FORMATTER.format(point.cents / 100);
        const percentage = Math.max(4, (point.cents / maxCents) * 100);
        return (
          <span
            key={point.label}
            className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1.5"
            title={`${point.label}: ${value}`}
            aria-label={`${point.label}: ${value}`}
          >
            <span
              className="mx-auto min-h-1 w-full max-w-8 rounded-t-[3px] opacity-90 transition-opacity hover:opacity-100"
              style={{
                height: `${percentage}%`,
                backgroundColor: barColor,
              }}
            />
            {showLabels ? (
              <span className="truncate text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {point.label}
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
