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
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "0.5rem",
        padding: "6px 10px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      }}
    >
      <p style={{ color: "var(--muted-foreground)", fontSize: "0.7rem", marginBottom: 2 }}>
        {label}
      </p>
      <p style={{ color: "var(--primary)", fontSize: "0.75rem", fontWeight: 600 }}>{euros}</p>
    </div>
  );
}

export function MiniBarChart({
  data,
  height = 56,
  barColor = "var(--primary)",
}: {
  data: Point[];
  height?: number;
  barColor?: string;
}) {
  const formatted = data.map((d) => ({
    label: d.label,
    value: Math.round(d.cents / 100),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={formatted} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <Bar dataKey="value" fill={barColor} radius={[3, 3, 0, 0]} />
        <XAxis dataKey="label" hide />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ fill: "var(--muted)", opacity: 0.5 }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
