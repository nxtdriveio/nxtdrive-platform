import Link from "next/link";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  trendValue,
  trendHint,
  href,
  className,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  trendValue?: number | null;
  trendHint?: string;
  href?: string;
  className?: string;
}) {
  const inner = (
    <div
      className={cn(
        "group flex min-h-[6.6rem] flex-col justify-between rounded-xl border border-brand-border bg-white p-4 shadow-[var(--admin-card-shadow)] transition-all",
        href && "cursor-pointer hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[var(--admin-card-shadow-hover)]",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--primary)_11%,white)] text-primary">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <div>
        <p className="text-2xl font-black tracking-tight text-foreground">{value}</p>
        {trendHint && (
          <div className="mt-1 flex items-center gap-1">
            {trendValue !== null && trendValue !== undefined ? (
              <span
                className={cn(
                  "flex items-center gap-0.5 text-xs font-medium",
                  trendValue >= 0 ? "text-success" : "text-danger",
                )}
              >
                {trendValue >= 0 ? (
                  <TrendingUp className="h-3 w-3" aria-hidden />
                ) : (
                  <TrendingDown className="h-3 w-3" aria-hidden />
                )}
                {trendValue >= 0 ? "+" : ""}
                {trendValue}%
              </span>
            ) : null}
            <span className="text-xs text-muted-foreground">{trendHint}</span>
          </div>
        )}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{inner}</Link>;
  }
  return inner;
}
