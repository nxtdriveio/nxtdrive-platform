"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";

const SEGMENT_COLORS = [
  "var(--warning)",
  "var(--primary)",
  "var(--success)",
  "var(--info)",
  "var(--accent-foreground)",
  "var(--muted-foreground)",
];

type Segment = { label: string; count: number; pct: number };

function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-popover-foreground">{item.name}</p>
      <p className="text-primary">{item.value} leads</p>
    </div>
  );
}

export function DonutChart({ data }: { data: Segment[] }) {
  const chartData = data.map((item, index) => ({
    name: item.label,
    value: item.count,
    pct: item.pct,
    color: SEGMENT_COLORS[index % SEGMENT_COLORS.length],
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
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex-1 space-y-1.5">
        {data.map((item, index) => (
          <li key={item.label} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: SEGMENT_COLORS[index % SEGMENT_COLORS.length] }}
            />
            <span className="min-w-0 truncate text-muted-foreground">{item.label}</span>
            <span className="ml-auto shrink-0 font-semibold tabular-nums text-foreground">
              {item.pct}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
