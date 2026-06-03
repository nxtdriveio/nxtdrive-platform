"use client";

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export type SkillRadarPoint = {
  label: string;
  /** Average score on the 1–10 scale, or null when not yet graded. */
  value: number | null;
};

/**
 * Driving-skill radar (Task #177) on the 0–10 NXTDRIVE score scale, styled in
 * the tenant primary colour. Ungraded categories render as 0 so the shape stays
 * closed; the tooltip shows the real value (or "nog niet beoordeeld").
 */
export function SkillRadar({
  data,
  color = "var(--primary)",
}: {
  data: SkillRadarPoint[];
  color?: string;
}) {
  const chartData = data.map((d) => ({
    label: d.label,
    value: d.value ?? 0,
    graded: d.value != null,
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={chartData} outerRadius="72%">
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis
            dataKey="label"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
          <Radar
            dataKey="value"
            stroke={color}
            fill={color}
            fillOpacity={0.25}
            strokeWidth={2}
          />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              fontSize: 12,
              color: "var(--foreground)",
            }}
            formatter={(_v, _n, item) => {
              const p = item?.payload as
                | { value: number; graded: boolean }
                | undefined;
              if (!p?.graded) return ["nog niet beoordeeld", "Score"];
              return [`${p.value.toFixed(1)} / 10`, "Score"];
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
