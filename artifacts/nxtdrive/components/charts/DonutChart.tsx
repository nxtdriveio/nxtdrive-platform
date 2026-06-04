"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, type TooltipProps } from "recharts";

const SEGMENT_COLORS = [
  "#f59e0b", // amber
  "#a855f7", // purple
  "#22c55e", // green
  "#3b82f6", // blue
  "#f97316", // orange
  "#6b7280", // gray
];

type Segment = { label: string; count: number; pct: number };

function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-lg border border-white/10 bg-gray-900 px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-gray-200">{item.name}</p>
      <p className="text-amber-400">{item.value} leads</p>
    </div>
  );
}

export function DonutChart({ data }: { data: Segment[] }) {
  const chartData = data.map((d, i) => ({
    name: d.label,
    value: d.count,
    pct: d.pct,
    color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
  }));

  return (
    <div className="flex items-center gap-5">
      <div className="shrink-0">
        <ResponsiveContainer width={110} height={110}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={34}
              outerRadius={52}
              dataKey="value"
              strokeWidth={0}
              paddingAngle={2}
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex-1 space-y-1.5">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}
            />
            <span className="min-w-0 truncate text-muted-foreground">{d.label}</span>
            <span className="ml-auto shrink-0 font-semibold tabular-nums text-foreground">
              {d.pct}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
