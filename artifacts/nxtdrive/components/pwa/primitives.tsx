import type { ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";
import { InfoBubble } from "@/components/ui/info-bubble";
import { cn } from "@/lib/utils";

type PWAAppKind = "student" | "instructor";

export function PWAPage({
  children,
  className,
  contentClassName,
  app = "student",
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  app?: PWAAppKind;
}) {
  return (
    <div
      className={cn(
        "min-w-0 space-y-3.5 sm:space-y-[1.125rem]",
        app === "student"
          ? "mx-auto max-w-[28.5rem]"
          : "mx-auto w-full max-w-[100rem]",
        className,
      )}
    >
      <div className={cn("min-w-0", contentClassName)}>{children}</div>
    </div>
  );
}

export function PWAHero({
  eyebrow,
  title,
  subtitle,
  aside,
  className,
  app = "student",
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
  className?: string;
  app?: PWAAppKind;
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[1.75rem] border border-white/12 text-white shadow-2xl",
        app === "student"
          ? "px-4 py-[1.125rem] sm:px-5 sm:py-[1.375rem]"
          : "px-[1.125rem] py-4 sm:px-6 sm:py-5 lg:px-7",
        className,
      )}
      style={{
        background:
          app === "student"
            ? "radial-gradient(circle at 16% 0%, rgba(255,255,255,0.24), transparent 28%), radial-gradient(circle at 100% 0%, rgba(255,255,255,0.1), transparent 30%), linear-gradient(145deg, var(--hero-surface-start), var(--hero-surface-mid) 60%, var(--hero-surface-end))"
            : "radial-gradient(circle at 12% 0%, rgba(255,255,255,0.18), transparent 28%), radial-gradient(circle at 100% 18%, var(--hero-accent-soft), transparent 32%), linear-gradient(140deg, var(--hero-surface-start), var(--hero-surface-mid) 58%, var(--hero-surface-end))",
      }}
    >
      <div className="pointer-events-none absolute -right-14 -top-14 h-32 w-32 rounded-full border border-white/10" />
      <div className="pointer-events-none absolute -bottom-24 left-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
      <div className="relative flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-1.5">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">
              {eyebrow}
            </p>
          ) : null}
          <h1
            className={cn(
              "text-balance font-black leading-[1.02] tracking-tight text-white",
              app === "student"
                ? "text-[clamp(1.72rem,7vw,2.65rem)]"
                : "text-[clamp(1.75rem,4vw,3.5rem)]",
            )}
          >
            {title}
          </h1>
          {subtitle ? (
            <p
              className={cn(
                "max-w-2xl text-sm text-white/72",
                app === "student"
                  ? "leading-[1.375rem] sm:text-[0.94rem]"
                  : "leading-6 sm:text-[0.95rem]",
              )}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
        {aside ? <div className="min-w-0 shrink-0">{aside}</div> : null}
      </div>
    </section>
  );
}

export function PWAKpiGrid({
  children,
  className,
  compact = false,
}: {
  children: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 gap-3",
        compact ? "grid-cols-2 gap-2.5 sm:gap-3" : "grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PWAKpiTile({
  label,
  value,
  hint,
  info,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  info?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-[1.2rem] border border-border/70 bg-card/88 px-3 py-3 shadow-sm backdrop-blur sm:rounded-2xl sm:px-3.5 sm:py-3.5",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <p className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </p>
        {info ? (
          <InfoBubble className="h-4 w-4" contentClassName="w-64">
            {info}
          </InfoBubble>
        ) : null}
      </div>
      <p className="mt-1 truncate text-[1.05rem] font-bold tracking-tight text-foreground sm:text-xl">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-[11px] leading-[1.125rem] text-muted-foreground sm:text-xs sm:leading-5">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function PWACard({
  title,
  actionLabel,
  actionHref,
  headerRight,
  children,
  className,
  contentClassName,
}: {
  title?: ReactNode;
  actionLabel?: string;
  actionHref?: string;
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 overflow-hidden rounded-[1.35rem] border border-border/70 bg-card/88 shadow-sm backdrop-blur sm:rounded-[1.5rem]",
        className,
      )}
    >
      {title ? (
        <div className="flex min-w-0 items-center justify-between gap-2 border-b border-border/70 px-3.5 py-3 sm:px-4 sm:py-3.5">
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
            {title}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerRight}
            {actionLabel && actionHref ? (
              <Link
                href={actionHref}
                className="text-xs font-semibold text-primary hover:underline"
              >
                {actionLabel} {"->"}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className={cn("min-w-0 px-3.5 py-3.5 sm:px-4 sm:py-4", contentClassName)}>
        {children}
      </div>
    </section>
  );
}

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
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary shadow-sm">
            {icon}
          </span>
        ) : null}
        <span className="min-w-0 truncate text-sm font-bold text-foreground sm:text-[0.95rem]">
          {children}
        </span>
      </div>
      {right ? (
        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {right}
        </div>
      ) : null}
    </div>
  );
}

export function PWAPageHeader({
  eyebrow,
  title,
  subtitle,
  description,
  icon,
  actions,
  className,
  align = "default",
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
  align?: "default" | "wide" | "left";
}) {
  const supportingCopy = description ?? subtitle;

  return (
    <div
      className={cn(
        "mb-3 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1
          className={cn(
            "flex min-w-0 items-center gap-2 tracking-tight text-foreground",
            align === "wide"
              ? "text-[clamp(1.7rem,3vw,2.4rem)] font-black"
              : "text-lg font-black sm:text-2xl",
          )}
        >
          {icon ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary shadow-sm">
              {icon}
            </span>
          ) : null}
          <span className="min-w-0 truncate">{title}</span>
        </h1>
        {supportingCopy ? (
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            {supportingCopy}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

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
      {icon ? <span className="text-muted-foreground/50">{icon}</span> : null}
      {title ? <p className="text-sm font-medium text-foreground">{title}</p> : null}
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{message}</p>
    </div>
  );
}
