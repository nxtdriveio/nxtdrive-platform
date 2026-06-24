"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

type Point = { label: string; cents: number };

function formatEuros(value: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtEuros(cents: number): string {
  return formatEuros(cents / 100);
}

function fmtAxisEuros(value: number): string {
  const compactValue = value >= 1000 ? value / 1000 : value;
  const formatted = formatEuros(compactValue);
  return value >= 1000 ? `${formatted}k` : formatted;
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-popover-foreground">{label}</p>
      <p className="text-primary">{fmtEuros((payload[0]?.value ?? 0) * 100)}</p>
    </div>
  );
}

export function RevenueBarChart({
  data,
  height = 200,
}: {
  data: Point[];
  height?: number;
}) {
  const formatted = data.map((d) => ({ label: d.label, value: d.cents / 100 }));
  const avgEuros =
    formatted.length > 0
      ? formatted.reduce((sum, item) => sum + item.value, 0) / formatted.length
      : 0;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={formatted} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(value) => fmtAxisEuros(Number(value))}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
        <Bar dataKey="value" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={52} />
        {avgEuros > 0 ? (
          <ReferenceLine
            y={avgEuros}
            stroke="var(--info)"
            strokeDasharray="6 3"
            strokeWidth={1.5}
            strokeOpacity={0.6}
          />
        ) : null}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
