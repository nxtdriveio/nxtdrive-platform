import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { InfoBubble } from "@/components/ui/info-bubble";
import {
  brandPrimaryGlowShadow,
  brandPrimaryProgressStyle,
} from "@/lib/brand-styles";
import { cn } from "@/lib/utils";

export const STUDENT_PANEL_SURFACE =
  "linear-gradient(180deg, #ffffff, color-mix(in oklab, var(--brand-background) 62%, #ffffff))";

export const STUDENT_ACCENT_SURFACE =
  "linear-gradient(180deg, #ffffff, color-mix(in oklab, var(--brand-accent) 34%, #ffffff))";

export type StudentTabItem = {
  key: string;
  label: string;
  href: string;
  count?: number | string;
};

export function StudentShowcaseTabs({
  items,
  activeKey,
  className,
}: {
  items: StudentTabItem[];
  activeKey: string;
  className?: string;
}) {
  return (
    <nav
      aria-label="Studentsecties"
      className={cn(
        "flex min-w-0 gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition sm:px-3.5 sm:py-2 sm:text-xs",
              active
                ? "border-brand-primary/40 bg-brand-accent text-brand-primary"
                : "border-brand-border bg-white text-brand-muted-foreground hover:border-brand-primary/30 hover:text-brand-foreground",
            )}
            style={
              active
                ? {
                    boxShadow: brandPrimaryGlowShadow({
                      y: 10,
                      blur: 30,
                      strength: 14,
                    }),
                  }
                : undefined
            }
          >
            <span>{item.label}</span>
            {item.count != null ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] leading-none",
                  active
                    ? "bg-brand-primary/10 text-brand-primary"
                    : "bg-brand-muted text-brand-muted-foreground",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function StudentShowcaseCard({
  title,
  eyebrow,
  info,
  actionLabel,
  actionHref,
  children,
  className,
  bodyClassName,
  style,
}: {
  title?: React.ReactNode;
  eyebrow?: React.ReactNode;
  info?: React.ReactNode;
  actionLabel?: string;
  actionHref?: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[var(--radius-card)] border border-brand-border/80 bg-white shadow-brand-card",
        className,
      )}
      style={{ background: STUDENT_PANEL_SURFACE, ...style }}
    >
      {title || eyebrow || actionLabel ? (
        <div className="flex items-center justify-between gap-3 border-b border-brand-border/70 px-3.5 py-3 sm:px-4 sm:py-3.5">
          <div className="min-w-0">
            {eyebrow ? (
              <div className="text-[10px] font-semibold uppercase text-brand-muted-foreground">
                {eyebrow}
              </div>
            ) : null}
            {title ? (
              <div className="mt-0.5 flex min-w-0 items-center gap-2 text-sm font-semibold text-brand-foreground">
                <span className="truncate">{title}</span>
                {info ? (
                  <InfoBubble className="h-4 w-4 text-brand-muted-foreground" contentClassName="w-64">
                    {info}
                  </InfoBubble>
                ) : null}
              </div>
            ) : null}
          </div>
          {actionLabel && actionHref ? (
            <Link
              href={actionHref}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-primary transition hover:text-brand-primary/80"
            >
              {actionLabel}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : null}
        </div>
      ) : null}
      <div className={cn("px-3.5 py-3.5 sm:px-4 sm:py-4", bodyClassName)}>
        {children}
      </div>
    </section>
  );
}

export function StudentShowcaseMetric({
  icon: Icon,
  label,
  value,
  hint,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-[1.1rem] border border-brand-border/75 bg-white px-3.5 py-3 shadow-sm",
        className,
      )}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[1rem] bg-brand-accent text-brand-primary">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <div className="text-[1.45rem] font-black leading-none text-brand-foreground">
          {value}
        </div>
        <div className="truncate text-sm font-semibold text-brand-foreground">{label}</div>
        {hint ? <div className="text-xs text-brand-muted-foreground">{hint}</div> : null}
      </div>
    </div>
  );
}

export function StudentRing({
  value,
  size = 116,
  stroke = 11,
  label = "Voortgang",
  caption,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
  caption?: React.ReactNode;
}) {
  const safe = Math.max(0, Math.min(100, Math.round(value)));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference - (safe / 100) * circumference;

  return (
    <div className="relative shrink-0" style={{ height: size, width: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id={`student-showcase-ring-${size}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="color-mix(in oklab, var(--brand-secondary) 82%, white)" />
            <stop offset="100%" stopColor="var(--brand-primary)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="color-mix(in oklab, var(--brand-border) 80%, white)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#student-showcase-ring-${size})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dash}
        />
      </svg>
      <div className="absolute inset-[1.1rem] flex flex-col items-center justify-center rounded-full bg-white text-center shadow-inner">
        <div className="text-[1.75rem] font-black leading-none text-brand-foreground">
          {safe}%
        </div>
        <div className="mt-0.5 text-[11px] text-brand-muted-foreground sm:mt-1 sm:text-xs">
          {label}
        </div>
        {caption ? (
          <div className="mt-1 max-w-[4.75rem] text-[9px] leading-3 text-brand-muted-foreground sm:max-w-none sm:text-[10px]">
            {caption}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function StudentProgressBar({
  label,
  value,
  rightLabel,
}: {
  label: string;
  value: number;
  rightLabel?: React.ReactNode;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="truncate text-brand-muted-foreground">{label}</span>
        {rightLabel ? (
          <span className="shrink-0 text-xs font-semibold text-brand-muted-foreground">
            {rightLabel}
          </span>
        ) : null}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-brand-muted">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            ...brandPrimaryProgressStyle({ startMix: 78 }),
          }}
        />
      </div>
    </div>
  );
}

export function StudentStars({ score }: { score: number | null }) {
  const filled = score == null ? 0 : Math.max(0, Math.min(5, Math.round(score / 2)));
  return (
    <div className="flex items-center gap-1 text-[0.72rem] leading-none">
      {Array.from({ length: 5 }).map((_, index) => (
        <span key={index} className={index < filled ? "text-[#f5b942]" : "text-brand-border"}>
          *
        </span>
      ))}
    </div>
  );
}

export function StudentChecklist({
  items,
}: {
  items: Array<{ label: string; checked: boolean; detail?: React.ReactNode }>;
}) {
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-start gap-2.5">
          <span
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
              item.checked
                ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                : "border-brand-border bg-white text-brand-muted-foreground",
            )}
          >
            {item.checked ? <Check className="h-3 w-3" aria-hidden /> : null}
          </span>
          <div className="min-w-0">
            <div className={cn("text-sm", item.checked ? "text-brand-foreground" : "text-brand-muted-foreground")}>
              {item.label}
            </div>
            {item.detail ? (
              <div className="text-xs leading-5 text-brand-muted-foreground">{item.detail}</div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function StudentListRow({
  href,
  title,
  subtitle,
  meta,
  badge,
  badgeVariant = "default",
  leading,
  className,
}: {
  href?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  badge?: React.ReactNode;
  badgeVariant?: "default" | "primary" | "success" | "warning" | "info" | "danger" | "outline";
  leading?: React.ReactNode;
  className?: string;
}) {
  const inner = (
    <div
      className={cn(
        "flex min-w-0 items-start gap-3 rounded-[1.05rem] border border-brand-border/75 bg-white px-3 py-2.5 transition sm:items-center sm:rounded-[1.15rem] sm:py-3",
        href ? "hover:border-brand-primary/30 hover:bg-brand-accent/35" : "",
        className,
      )}
    >
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[0.84rem] font-semibold text-brand-foreground sm:text-sm">
          {title}
        </div>
        {subtitle ? (
          <div className="mt-0.5 line-clamp-3 text-[11px] leading-[1.05rem] text-brand-muted-foreground sm:line-clamp-2 sm:text-xs sm:leading-5">
            {subtitle}
          </div>
        ) : null}
        {meta || badge || href ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-brand-muted-foreground sm:hidden">
            {meta ? <span>{meta}</span> : null}
            {badge ? (
              <Badge
                variant={badgeVariant}
                className="whitespace-nowrap px-2 py-0.5 text-[10px] font-semibold"
              >
                {badge}
              </Badge>
            ) : null}
            {href ? <ChevronRight className="h-3.5 w-3.5 text-brand-muted-foreground" aria-hidden /> : null}
          </div>
        ) : null}
      </div>
      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        {meta ? <div className="text-[11px] text-brand-muted-foreground">{meta}</div> : null}
        {badge ? (
          <Badge
            variant={badgeVariant}
            className="whitespace-nowrap px-2 py-0.5 text-[10px] font-semibold"
          >
            {badge}
          </Badge>
        ) : null}
        {href ? <ChevronRight className="h-4 w-4 text-brand-muted-foreground" aria-hidden /> : null}
      </div>
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function StudentInitialBadge({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "green" | "orange" | "blue" | "pink";
}) {
  const toneClass =
    tone === "green"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "orange"
        ? "bg-amber-50 text-amber-700"
        : tone === "blue"
          ? "bg-sky-50 text-sky-700"
          : tone === "pink"
            ? "bg-fuchsia-50 text-fuchsia-700"
            : "bg-brand-accent text-brand-primary";

  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold sm:h-11 sm:w-11 sm:text-sm",
        toneClass,
      )}
    >
      {label}
    </span>
  );
}

export function StudentShowcaseEmptyState({
  title,
  description,
  icon,
  className,
}: {
  title: React.ReactNode;
  description: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[1.15rem] border border-dashed border-brand-border bg-brand-muted/40 px-4 py-6 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white text-brand-primary shadow-sm">
          {icon}
        </div>
      ) : null}
      <div className="text-sm font-semibold text-brand-foreground">{title}</div>
      <div className="mt-1 text-sm leading-6 text-brand-muted-foreground">{description}</div>
    </div>
  );
}

export function StudentShowcaseNotice({
  title,
  description,
  icon,
  tone = "default",
  className,
  children,
  style,
}: {
  title: React.ReactNode;
  description: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "default" | "success" | "warning" | "info" | "danger";
  className?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50"
        : tone === "info"
          ? "border-sky-200 bg-sky-50"
          : tone === "danger"
            ? "border-rose-200 bg-rose-50"
            : "border-brand-border bg-white";
  const iconClass =
    tone === "success"
      ? "text-emerald-600"
      : tone === "warning"
        ? "text-amber-600"
        : tone === "info"
          ? "text-sky-600"
          : tone === "danger"
            ? "text-rose-600"
            : "text-brand-primary";

  return (
    <div
      className={cn(
        "rounded-[1.15rem] border px-4 py-3.5 shadow-sm",
        toneClass,
        className,
      )}
      style={style}
    >
      <div className="flex items-start gap-3">
        {icon ? (
          <div
            className={cn(
              "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white",
              iconClass,
            )}
          >
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-brand-foreground">{title}</div>
          <div className="mt-1 text-sm leading-6 text-brand-muted-foreground">
            {description}
          </div>
          {children ? <div className="mt-3">{children}</div> : null}
        </div>
      </div>
    </div>
  );
}
