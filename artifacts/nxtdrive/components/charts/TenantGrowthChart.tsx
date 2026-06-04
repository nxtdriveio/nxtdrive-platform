"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";

export type GrowthPoint = {
  label: string;
  newTenants: number;
  cumulative: number;
};

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-gray-900 px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-gray-300">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name === "newTenants" ? "Nieuw" : "Cumulatief"}: {p.value}
        </p>
      ))}
    </div>
  );
}

export function TenantGrowthChart({ data, height = 220 }: { data: GrowthPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: "#6b7280", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          yAxisId="left"
          tick={{ fill: "#6b7280", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={28}
          allowDecimals={false}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fill: "#6b7280", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={36}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
        <Legend
          wrapperStyle={{ fontSize: 11, color: "#9ca3af" }}
          formatter={(value) => (value === "newTenants" ? "Nieuw" : "Cumulatief")}
        />
        <Bar yAxisId="left" dataKey="newTenants" fill="#f59e0b" radius={[3, 3, 0, 0]} maxBarSize={32} />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="cumulative"
          stroke="#94a3b8"
          strokeWidth={2}
          dot={false}
          strokeDasharray="4 2"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
