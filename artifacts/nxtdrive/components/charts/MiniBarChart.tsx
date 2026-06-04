"use client";

import {
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";

type Point = { label: string; cents: number };

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const euros = new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(payload[0]?.value ?? 0);
  return (
    <div className="rounded-lg border border-white/10 bg-gray-900 px-3 py-2 text-xs shadow-lg">
      <p className="text-gray-400">{label}</p>
      <p className="font-medium text-amber-400">{euros}</p>
    </div>
  );
}

export function MiniBarChart({ data, height = 56 }: { data: Point[]; height?: number }) {
  const formatted = data.map((d) => ({
    label: d.label,
    value: Math.round(d.cents / 100),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={formatted} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <Bar dataKey="value" fill="#f59e0b" radius={[2, 2, 0, 0]} />
        <XAxis dataKey="label" hide />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
