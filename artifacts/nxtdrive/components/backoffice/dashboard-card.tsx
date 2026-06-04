import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DashboardCard({
  title,
  actionLabel,
  actionHref,
  children,
  className,
  headerRight,
}: {
  title: ReactNode;
  actionLabel?: string;
  actionHref?: string;
  children: ReactNode;
  className?: string;
  headerRight?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border border-border bg-card shadow-sm",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          {title}
        </div>
        <div className="flex items-center gap-2">
          {headerRight}
          {actionLabel && actionHref && (
            <Link
              href={actionHref}
              className="text-xs text-primary hover:underline"
            >
              {actionLabel} →
            </Link>
          )}
        </div>
      </div>
      <div className="flex-1 px-5 py-4">{children}</div>
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
    <div className="flex min-h-[7rem] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
      {icon && <div className="text-muted-foreground/60">{icon}</div>}
      <span>{message}</span>
    </div>
  );
}
