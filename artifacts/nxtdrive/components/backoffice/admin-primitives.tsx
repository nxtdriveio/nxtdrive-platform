import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { ArrowUpRight, ChevronRight } from "lucide-react";

import { InfoBubble } from "@/components/ui/info-bubble";
import { cn } from "@/lib/utils";

type IconType = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

export function AdminPage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto flex max-w-[1540px] flex-col gap-5", className)}>
      {children}
    </div>
  );
}

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-border bg-[var(--surface-1)] p-5 shadow-sm md:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 space-y-3">
          {eyebrow ? (
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">
              {eyebrow}
            </div>
          ) : null}
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {title}
            </h1>
            {description ? (
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {meta}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </section>
  );
}

export function AdminGrid({
  children,
  columns = "3",
  className,
}: {
  children: ReactNode;
  columns?: "2" | "3" | "4";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-4",
        columns === "2" && "lg:grid-cols-2",
        columns === "3" && "xl:grid-cols-3",
        columns === "4" && "md:grid-cols-2 xl:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AdminPanel({
  title,
  description,
  info,
  actionHref,
  actionLabel = "Bekijk",
  children,
  className,
  contentClassName,
}: {
  title: ReactNode;
  description?: ReactNode;
  info?: string;
  actionHref?: string;
  actionLabel?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-[var(--surface-1)] shadow-sm",
        className,
      )}
    >
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <span className="truncate">{title}</span>
            {info ? <InfoBubble>{info}</InfoBubble> : null}
          </div>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actionHref ? (
          <Link
            href={actionHref}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-[var(--surface-2)] px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            {actionLabel}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>
      <div className={cn("p-4", contentClassName)}>{children}</div>
    </section>
  );
}

export function AdminList({
  children,
  maxHeight,
}: {
  children: ReactNode;
  maxHeight?: string;
}) {
  return (
    <div
      className={cn(
        "divide-y divide-border overflow-hidden rounded-xl border border-border bg-[var(--surface-2)]",
        maxHeight && "overflow-y-auto",
      )}
      style={maxHeight ? { maxHeight } : undefined}
    >
      {children}
    </div>
  );
}

export function AdminListRow({
  href,
  icon,
  title,
  subtitle,
  meta,
  tone = "default",
}: {
  href?: string;
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  tone?: "default" | "warning" | "danger" | "success" | "info";
}) {
  const toneClass =
    tone === "danger"
      ? "bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] text-danger"
      : tone === "warning"
        ? "bg-[color-mix(in_oklab,var(--warning)_12%,transparent)] text-warning"
        : tone === "success"
          ? "bg-[color-mix(in_oklab,var(--success)_10%,transparent)] text-success"
          : tone === "info"
            ? "bg-[color-mix(in_oklab,var(--info)_10%,transparent)] text-info"
            : "bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] text-primary";

  const inner = (
    <div className="group flex min-h-[4.25rem] items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--admin-row-hover)]">
      {icon ? (
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            toneClass,
          )}
        >
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">
          {title}
        </div>
        {subtitle ? (
          <div className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {subtitle}
          </div>
        ) : null}
      </div>
      {meta ? (
        <div className="shrink-0 text-right text-xs text-muted-foreground">
          {meta}
        </div>
      ) : null}
      {href ? (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      ) : null}
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function AdminModuleTile({
  href,
  icon: Icon,
  label,
  description,
  badge,
}: {
  href: string;
  icon: IconType;
  label: string;
  description: string;
  badge?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-28 flex-col justify-between rounded-2xl border border-border bg-[var(--surface-2)] p-4 transition-colors hover:border-primary/40 hover:bg-[var(--admin-row-hover)]"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] text-primary">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        {badge}
      </div>
      <div>
        <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          {label}
          <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
    </Link>
  );
}
