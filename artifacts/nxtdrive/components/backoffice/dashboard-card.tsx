import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DashboardCard({
  title,
  actionLabel,
  actionHref,
  children,
  className,
  contentClassName,
  headerRight,
}: {
  title: ReactNode;
  actionLabel?: string;
  actionHref?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  headerRight?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-brand-border/90 bg-white shadow-[var(--admin-card-shadow)]",
        className,
      )}
    >
      <div className="flex min-h-12 items-center justify-between gap-2 border-b border-brand-border/80 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-black text-foreground">
          {title}
        </div>
        <div className="flex items-center gap-2">
          {headerRight}
          {actionLabel && actionHref && (
            <Link
              href={actionHref}
              className="rounded-full border border-brand-border bg-[var(--surface-2)] px-3 py-1.5 text-xs font-bold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              {actionLabel}
            </Link>
          )}
        </div>
      </div>
      <div
        className={cn(
          "min-h-0 flex-1 overflow-x-hidden px-4 py-4",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function DashboardEmptyState({
  icon,
  message,
}: {
  icon?: ReactNode;
  message: string;
}) {
  return (
    <div className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-[var(--surface-2)] p-4 text-center text-sm text-muted-foreground">
      {icon && <div className="text-muted-foreground/60">{icon}</div>}
      <span>{message}</span>
    </div>
  );
}
