"use client";

import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";

/**
 * Single-value radial gauge ring (Task #177) built on Recharts. Used for the
 * credit ring and exam-readiness ring in the student/instructor PWAs.
 *
 * `value` is 0–100. `color` accepts any CSS colour — callers pass the tenant
 * primary (`hsl(var(--primary))` style or the resolved brand colour) or a
 * threshold colour. The centre renders `label` (big) + `sublabel` (small).
 */
export function RadialRing({
  value,
  color = "var(--primary)",
  trackColor = "var(--muted)",
  size = 140,
  label,
  sublabel,
}: {
  value: number;
  color?: string;
  trackColor?: string;
  size?: number;
  label?: string;
  sublabel?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const data = [{ name: "value", value: pct, fill: color }];

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="74%"
          outerRadius="100%"
          data={data}
          startAngle={90}
          endAngle={-270}
        >
          <PolarAngleAxis
            type="number"
            domain={[0, 100]}
            angleAxisId={0}
            tick={false}
          />
          <RadialBar
            background={{ fill: trackColor }}
            dataKey="value"
            cornerRadius={999}
            angleAxisId={0}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        {label ? (
          <span className="text-lg font-semibold leading-none text-foreground">
            {label}
          </span>
        ) : null}
        {sublabel ? (
          <span className="mt-1 text-[11px] font-medium text-muted-foreground">
            {sublabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
