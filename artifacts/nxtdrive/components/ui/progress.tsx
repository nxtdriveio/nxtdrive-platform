import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "primary" | "success" | "warning" | "danger";

const toneClass: Record<Tone, string> = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

/**
 * Minimal shadcn-style Progress bar (Task #177). `value` is 0–100; `tone`
 * colours the fill (used across the PWA for credit/skill bars).
 */
export function Progress({
  value,
  tone = "primary",
  className,
  ...props
}: {
  value: number;
  tone?: Tone;
} & React.HTMLAttributes<HTMLDivElement>) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "h-2.5 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500 ease-out",
          toneClass[tone],
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
