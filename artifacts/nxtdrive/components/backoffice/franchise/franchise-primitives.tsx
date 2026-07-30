import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  LockKeyhole,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type IconType = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

export const FRANCHISE_NAV_ITEMS = [
  { href: "/backoffice/franchise", label: "Cockpit" },
  { href: "/backoffice/franchise/planning", label: "Planning" },
  { href: "/backoffice/franchise/prestaties", label: "Prestaties" },
  { href: "/backoffice/franchise/aandacht", label: "Aandacht" },
  { href: "/backoffice/franchise/templates", label: "Templates" },
  { href: "/backoffice/franchise/playbook", label: "Playbook" },
  { href: "/backoffice/franchise/governance", label: "Governance" },
  { href: "/backoffice/franchise/delegaties", label: "Delegaties" },
  { href: "/backoffice/franchise/audit", label: "Audit" },
  { href: "/backoffice/franchise/theming", label: "Theming" },
  { href: "/backoffice/franchise/entitlements", label: "Entitlements" },
  { href: "/backoffice/franchise/ai-insights", label: "Prioriteiten" },
  { href: "/backoffice/franchise/reports", label: "Rapportages" },
  { href: "/backoffice/franchise/architecture", label: "Architectuur" },
  { href: "/backoffice/franchise/settings", label: "Instellingen" },
] as const;

export type FranchiseTone =
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "readonly"
  | "delegated";

export function FranchisePage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[1560px] flex-col gap-4 text-brand-foreground sm:gap-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FranchisePageHeader({
  eyebrow = "Franchise",
  title,
  description,
  badges,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  description: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 space-y-3">
        <p className="text-[11px] font-black uppercase tracking-[0.28em] text-muted-foreground">
          {eyebrow}
        </p>
        <div className="space-y-2">
          <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
        {badges ? <div className="flex flex-wrap gap-2">{badges}</div> : null}
      </div>
      {actions ? (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
          {actions}
        </div>
      ) : null}
    </section>
  );
}

export function FranchiseActionLink({
  href,
  children,
  variant = "outline",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "outline" | "ghost";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-center text-sm font-black transition-all",
        variant === "primary" &&
          "theme-cta text-primary-foreground shadow-[0_14px_30px_rgba(91,77,255,0.24)] hover:opacity-90",
        variant === "outline" &&
          "border border-brand-border bg-white text-foreground shadow-sm hover:border-primary/40 hover:text-primary",
        variant === "ghost" &&
          "text-muted-foreground hover:bg-brand-muted hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

export function FranchiseModeBadge({
  mode = "readonly",
}: {
  mode?: "readonly" | "delegated" | "network";
}) {
  const label =
    mode === "delegated"
      ? "Gedelegeerd"
      : mode === "network"
        ? "Netwerkbreed"
        : "Read-only";
  const className =
    mode === "delegated"
      ? "bg-network-delegated text-network-delegated-foreground"
      : mode === "network"
        ? "bg-network-readonly text-network-readonly-foreground"
        : "bg-network-readonly text-network-readonly-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black",
        className,
      )}
    >
      <LockKeyhole className="h-3.5 w-3.5" aria-hidden />
      {label}
    </span>
  );
}

export function FranchisePanel({
  title,
  description,
  actionHref,
  actionLabel = "Bekijk",
  children,
  className,
  contentClassName,
}: {
  title: ReactNode;
  description?: ReactNode;
  actionHref?: string;
  actionLabel?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-brand-card-border bg-brand-card shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <div className="flex min-h-14 flex-col gap-3 border-b border-brand-card-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-black text-brand-card-foreground">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actionHref ? (
          <Link
            href={actionHref}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-full border border-brand-border bg-brand-muted px-3 py-1.5 text-xs font-black text-foreground transition-colors hover:border-primary/40 hover:text-primary sm:h-auto"
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

export function FranchiseKpiCard({
  label,
  value,
  hint,
  trend,
  icon: Icon,
  href,
  tone = "primary",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  trend?: ReactNode;
  icon: IconType;
  href?: string;
  tone?: FranchiseTone;
}) {
  const content = (
    <div
      className={cn(
        "group flex min-h-[6.35rem] flex-col justify-between rounded-2xl border border-brand-card-border bg-brand-card p-3 shadow-[var(--shadow-card)] transition-all sm:min-h-[7.4rem] sm:p-4",
        href && "hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[var(--admin-card-shadow-hover)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-muted-foreground">
            {label}
          </p>
          <div className="mt-2 text-xl font-black tracking-tight text-foreground sm:text-2xl">
            {value}
          </div>
        </div>
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10",
            toneClass(tone),
          )}
        >
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-muted-foreground">{hint}</p>
        {trend ? <div className="shrink-0 text-xs font-black">{trend}</div> : null}
      </div>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

export function FranchiseStatusBadge({
  children,
  tone = "primary",
}: {
  children: ReactNode;
  tone?: FranchiseTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-black",
        toneClass(tone),
      )}
    >
      {children}
    </span>
  );
}

export function FranchiseProgressBar({
  value,
  label,
  tone = "primary",
}: {
  value: number | null;
  label?: ReactNode;
  tone?: FranchiseTone;
}) {
  const width = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-muted">
        <div
          className={cn("h-full rounded-full", barClass(tone))}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="w-12 shrink-0 text-right text-xs font-black tabular-nums text-foreground">
        {label ?? (value === null ? "-" : `${value}%`)}
      </span>
    </div>
  );
}

export function FranchiseMiniTable({
  columns,
  children,
  minWidth = "760px",
}: {
  columns: string[];
  children: ReactNode;
  minWidth?: string;
}) {
  return (
    <div className="overflow-x-auto [scrollbar-color:color-mix(in_oklab,var(--brand-primary)_34%,transparent)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-primary/25 [&::-webkit-scrollbar-track]:bg-transparent">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead className="border-b border-brand-card-border bg-brand-muted text-left text-muted-foreground">
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em]"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-card-border">{children}</tbody>
      </table>
    </div>
  );
}

export function FranchiseTableCell({
  children,
  align = "left",
  className,
}: {
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={cn(
        "px-4 py-3 align-middle",
        align === "right" && "text-right",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function FranchiseFoundationCard({
  icon: Icon,
  title,
  description,
  status = "Actief",
}: {
  icon: IconType;
  title: string;
  description: string;
  status?: string;
}) {
  return (
    <div className="rounded-2xl border border-brand-card-border bg-white/78 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-accent text-primary">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-black text-foreground">{title}</h3>
            <FranchiseStatusBadge tone="success">{status}</FranchiseStatusBadge>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

export function FranchiseEmptyState({
  icon: Icon = CheckCircle2,
  title,
  description,
}: {
  icon?: IconType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-brand-border bg-brand-muted/60 p-6 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-accent text-primary">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <h3 className="mt-3 text-sm font-black text-foreground">{title}</h3>
      <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

export function FranchiseNavTabs({
  items,
}: {
  items: Array<{ href: string; label: string }>;
}) {
  return (
    <div className="-mx-4 flex snap-x gap-1 overflow-x-auto border-y border-brand-border bg-white px-4 py-1 shadow-sm [scrollbar-width:none] sm:mx-0 sm:rounded-2xl sm:border sm:p-1 [&::-webkit-scrollbar]:hidden">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="inline-flex h-9 shrink-0 snap-start items-center rounded-xl px-3 text-xs font-black text-muted-foreground transition-colors hover:bg-brand-muted hover:text-primary"
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

export function FranchiseSectionTabs() {
  return <FranchiseNavTabs items={[...FRANCHISE_NAV_ITEMS]} />;
}

export function FranchiseErrorState({
  title = "Franchisegegevens konden niet worden geladen",
  description,
}: {
  title?: string;
  description: string;
}) {
  return (
    <FranchisePage>
      <FranchisePageHeader
        eyebrow="Franchise"
        title={title}
        description={description}
        badges={<FranchiseModeBadge />}
      />
      <FranchiseEmptyState
        title="Controleer de franchiseconfiguratie"
        description="Deze tenant moet als franchisegever ingericht zijn en de onderliggende franchise-tabellen moeten beschikbaar zijn."
      />
    </FranchisePage>
  );
}

function toneClass(tone: FranchiseTone): string {
  if (tone === "success") return "bg-network-healthy text-network-healthy-foreground";
  if (tone === "warning") return "bg-network-watch text-network-watch-foreground";
  if (tone === "danger") return "bg-network-risk text-network-risk-foreground";
  if (tone === "info") return "bg-brand-accent text-primary";
  if (tone === "readonly") return "bg-network-readonly text-network-readonly-foreground";
  if (tone === "delegated") return "bg-network-delegated text-network-delegated-foreground";
  return "bg-brand-accent text-primary";
}

function barClass(tone: FranchiseTone): string {
  if (tone === "success") return "bg-success";
  if (tone === "warning") return "bg-warning";
  if (tone === "danger") return "bg-danger";
  if (tone === "info") return "bg-info";
  if (tone === "delegated") return "bg-network-delegated-strong";
  return "bg-primary";
}

export function FranchiseBadge({
  children,
  variant = "outline",
}: {
  children: ReactNode;
  variant?: "primary" | "success" | "warning" | "danger" | "info" | "outline";
}) {
  return <Badge variant={variant}>{children}</Badge>;
}

export function FranchiseRowLink({
  href,
  title,
  subtitle,
  meta,
}: {
  href: string;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 rounded-xl border border-brand-card-border bg-white px-3 py-3 transition-all hover:border-primary/35 hover:bg-brand-muted"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-foreground">{title}</p>
        {subtitle ? (
          <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        {meta}
        <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
    </Link>
  );
}
