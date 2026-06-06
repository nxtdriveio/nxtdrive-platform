import type { ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Shared PWA primitives — used by both the student and instructor PWAs.
 * Modelled after the backoffice DashboardCard / StatusBadge (task #227) but
 * tuned for the denser, app-like PWA context.
 */

// ─── PWACard ─────────────────────────────────────────────────────────────────

export function PWACard({
  title,
  actionLabel,
  actionHref,
  headerRight,
  children,
  className,
}: {
  title?: ReactNode;
  actionLabel?: string;
  actionHref?: string;
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-[1.45rem] border border-border/80 bg-card/85 shadow-sm backdrop-blur",
        className,
      )}
    >
      {title ? (
        <div className="flex min-w-0 items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
            {title}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerRight}
            {actionLabel && actionHref ? (
              <Link
                href={actionHref}
                className="text-xs font-semibold text-primary hover:underline"
              >
                {actionLabel} →
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="min-w-0 px-4 py-4">{children}</div>
    </div>
  );
}

// ─── PWASectionHeader ────────────────────────────────────────────────────────

/**
 * Consistent section title treatment: icon badge + text.
 * Replaces the ad-hoc `text-xs uppercase tracking-wider text-muted-foreground`
 * pattern scattered across both PWAs.
 */
export function PWASectionHeader({
  icon,
  children,
  right,
  className,
}: {
  icon?: ReactNode;
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex min-w-0 items-center justify-between gap-2", className)}>
      <div className="flex min-w-0 items-center gap-2">
        {icon ? (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            {icon}
          </span>
        ) : null}
        <span className="min-w-0 truncate text-sm font-bold text-foreground">{children}</span>
      </div>
      {right ? (
        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {right}
        </div>
      ) : null}
    </div>
  );
}

// ─── PWAPageHeader ───────────────────────────────────────────────────────────

/**
 * Consistent page header: h1 + optional subtitle. Used at the top of every
 * student/instructor PWA page so they all share the same visual rhythm.
 */
export function PWAPageHeader({
  title,
  subtitle,
  icon,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3", className)}>
      <h1 className="flex min-w-0 items-center gap-2 text-xl font-black tracking-tight text-foreground sm:text-2xl">
        {icon ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            {icon}
          </span>
        ) : null}
        <span className="min-w-0 truncate">{title}</span>
      </h1>
      {subtitle ? (
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{subtitle}</p>
      ) : null}
    </div>
  );
}

// ─── PWAStatusBadge ──────────────────────────────────────────────────────────

const LESSON_STATUS: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  planned: { label: "Gepland", variant: "primary" },
  in_progress: { label: "Bezig", variant: "info" },
  completed: { label: "Gereed", variant: "success" },
  cancelled_with_refund: { label: "Geannuleerd", variant: "default" },
  cancelled_no_refund: { label: "Geannuleerd", variant: "danger" },
  no_show: { label: "No-show", variant: "danger" },
};

const CBR_STATUS: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  nog_nodig: { label: "Nog nodig", variant: "warning" },
  aangevraagd: { label: "Aangevraagd", variant: "info" },
  ontvangen: { label: "Ontvangen", variant: "success" },
};

const THEORY_STATUS: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  not_started: { label: "Niet gestart", variant: "default" },
  in_progress: { label: "Bezig", variant: "info" },
  passed: { label: "Geslaagd", variant: "success" },
  failed: { label: "Gezakt", variant: "danger" },
};

type StatusDomain = "lesson" | "cbr" | "theory";

/**
 * Maps rijles/CBR/theorie statuses to consistently styled badges.
 * Both PWAs use this component so badge semantics stay in sync.
 */
export function PWAStatusBadge({
  status,
  domain,
}: {
  status: string;
  domain: StatusDomain;
}) {
  const map =
    domain === "lesson"
      ? LESSON_STATUS
      : domain === "cbr"
        ? CBR_STATUS
        : THEORY_STATUS;
  const resolved = map[status] ?? { label: status, variant: "default" as const };
  return <Badge variant={resolved.variant}>{resolved.label}</Badge>;
}

// ─── PWAEmptyState ───────────────────────────────────────────────────────────

/**
 * Consistent empty-state treatment: icon + heading + message.
 * Replaces bare `<p className="text-sm text-muted-foreground">` throughout
 * both PWAs. Uses a dashed border container so the page never looks empty.
 */
export function PWAEmptyState({
  icon,
  title,
  message,
  className,
}: {
  icon?: ReactNode;
  title?: string;
  message: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[6rem] min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-6 text-center",
        className,
      )}
    >
      {icon ? (
        <span className="text-muted-foreground/50">{icon}</span>
      ) : null}
      {title ? (
        <p className="text-sm font-medium text-foreground">{title}</p>
      ) : null}
      <p className="text-sm leading-6 text-muted-foreground">{message}</p>
    </div>
  );
}
