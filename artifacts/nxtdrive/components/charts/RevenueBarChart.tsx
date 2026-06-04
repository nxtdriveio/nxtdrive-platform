"use client";

import {
  ComposedChart,
  Bar,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";

type Point = { label: string; cents: number };

function fmtEuros(cents: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-gray-900 px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-gray-300">{label}</p>
      <p className="text-amber-400">{fmtEuros((payload[0]?.value ?? 0) * 100)}</p>
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
      ? formatted.reduce((s, d) => s + d.value, 0) / formatted.length
      : 0;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={formatted} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: "#6b7280", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) =>
            v >= 1000 ? `€${(v / 1000).toFixed(0)}k` : `€${v}`
          }
          tick={{ fill: "#6b7280", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
        <Bar dataKey="value" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={52} />
        {avgEuros > 0 && (
          <ReferenceLine
            y={avgEuros}
            stroke="#f59e0b"
            strokeDasharray="6 3"
            strokeWidth={1.5}
            strokeOpacity={0.6}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
