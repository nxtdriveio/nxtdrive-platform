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
  "linear-gradient(180deg, color-mix(in oklab, var(--primary) 10%, #121221), color-mix(in oklab, var(--primary) 6%, #0a0a16))";

export const STUDENT_ACCENT_SURFACE =
  "linear-gradient(180deg, color-mix(in oklab, var(--primary) 18%, #161628), color-mix(in oklab, var(--primary) 8%, #0a0a16))";

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
                ? "border-primary/50 bg-primary/18 text-primary"
                : "border-white/10 bg-card/72 text-white/62 hover:border-white/16 hover:text-white",
            )}
            style={
              active
                ? {
                    boxShadow: brandPrimaryGlowShadow({
                      y: 10,
                      blur: 30,
                      strength: 22,
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
                  active ? "bg-primary/18 text-primary" : "bg-white/8 text-white/58",
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
        "overflow-hidden rounded-[1.55rem] border border-white/10 shadow-[0_24px_60px_rgba(2,3,10,0.38)]",
        className,
      )}
      style={{ background: STUDENT_PANEL_SURFACE, ...style }}
    >
      {title || eyebrow || actionLabel ? (
        <div className="flex items-center justify-between gap-3 border-b border-white/7 px-3.5 py-3 sm:px-4 sm:py-3.5">
          <div className="min-w-0">
            {eyebrow ? (
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/42">
                {eyebrow}
              </div>
            ) : null}
            {title ? (
              <div className="mt-0.5 flex min-w-0 items-center gap-2 text-sm font-semibold text-white">
                <span className="truncate">{title}</span>
                {info ? (
                  <InfoBubble className="h-4 w-4 text-white/38" contentClassName="w-64">
                    {info}
                  </InfoBubble>
                ) : null}
              </div>
            ) : null}
          </div>
          {actionLabel && actionHref ? (
            <Link
              href={actionHref}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary transition hover:text-primary/80"
            >
              {actionLabel}
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : null}
        </div>
      ) : null}
      <div className={cn("px-3.5 py-3.5 sm:px-4 sm:py-4", bodyClassName)}>{children}</div>
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
        "flex min-w-0 items-center gap-3 rounded-[1.2rem] border border-white/10 bg-white/[0.04] px-3.5 py-3",
        className,
      )}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[1rem] bg-primary/18 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <div className="text-[1.65rem] font-black leading-none tracking-tight text-white">
          {value}
        </div>
        <div className="truncate text-sm font-semibold text-white">{label}</div>
        {hint ? <div className="text-xs text-white/50">{hint}</div> : null}
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
            <stop offset="0%" stopColor="color-mix(in oklab, var(--primary) 72%, white)" />
            <stop offset="100%" stopColor="var(--primary)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
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
      <div
        className="absolute inset-[1.1rem] flex flex-col items-center justify-center rounded-full text-center"
        style={{
          background:
            "radial-gradient(circle at top, color-mix(in oklab, var(--primary) 28%, transparent), color-mix(in oklab, var(--primary) 6%, #070811) 72%)",
        }}
      >
        <div className="text-[1.9rem] font-black leading-none tracking-tight text-white">
          {safe}%
        </div>
        <div className="mt-0.5 text-[11px] text-white/68 sm:mt-1 sm:text-xs">{label}</div>
        {caption ? (
          <div className="mt-1 max-w-[4.75rem] text-[9px] leading-3 text-white/42 sm:max-w-none sm:text-[10px]">
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
        <span className="truncate text-white/72">{label}</span>
        {rightLabel ? (
          <span className="shrink-0 text-xs font-semibold text-white/58">{rightLabel}</span>
        ) : null}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
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
        <span key={index} className={index < filled ? "text-[#ffd54a]" : "text-white/18"}>
          ★
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
                ? "border-emerald-400/40 bg-emerald-500/18 text-emerald-300"
                : "border-white/14 bg-transparent text-white/24",
            )}
          >
            {item.checked ? <Check className="h-3 w-3" aria-hidden /> : null}
          </span>
          <div className="min-w-0">
            <div className={cn("text-sm", item.checked ? "text-white" : "text-white/72")}>
              {item.label}
            </div>
            {item.detail ? (
              <div className="text-xs leading-5 text-white/42">{item.detail}</div>
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
        "flex min-w-0 items-start gap-3 rounded-[1.05rem] border border-white/10 bg-white/[0.02] px-3 py-2.5 transition sm:items-center sm:rounded-[1.15rem] sm:py-3",
        href ? "hover:border-white/14 hover:bg-white/[0.04]" : "",
        className,
      )}
    >
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[0.84rem] font-semibold text-white sm:text-sm">{title}</div>
        {subtitle ? (
          <div className="mt-0.5 line-clamp-3 text-[11px] leading-[1.05rem] text-white/50 sm:line-clamp-2 sm:text-xs sm:leading-5">
            {subtitle}
          </div>
        ) : null}
        {meta || badge || href ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/42 sm:hidden">
            {meta ? <span>{meta}</span> : null}
            {badge ? (
              <Badge
                variant={badgeVariant}
                className="whitespace-nowrap px-2 py-0.5 text-[10px] font-semibold"
              >
                {badge}
              </Badge>
            ) : null}
            {href ? <ChevronRight className="h-3.5 w-3.5 text-white/26" aria-hidden /> : null}
          </div>
        ) : null}
      </div>
      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        {meta ? <div className="text-[11px] text-white/40">{meta}</div> : null}
        {badge ? (
          <Badge
            variant={badgeVariant}
            className="whitespace-nowrap px-2 py-0.5 text-[10px] font-semibold"
          >
            {badge}
          </Badge>
        ) : null}
        {href ? <ChevronRight className="h-4 w-4 text-white/26" aria-hidden /> : null}
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
      ? "from-emerald-500/30 to-emerald-400/12 text-emerald-200"
      : tone === "orange"
        ? "from-amber-500/28 to-amber-400/12 text-amber-200"
        : tone === "blue"
          ? "from-sky-500/28 to-sky-400/12 text-sky-200"
          : tone === "pink"
            ? "from-fuchsia-500/28 to-fuchsia-400/12 text-fuchsia-200"
            : "from-primary/30 to-primary/12 text-primary";

  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-semibold sm:h-11 sm:w-11 sm:text-sm",
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
        "flex flex-col items-center justify-center rounded-[1.2rem] border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.04] text-primary">
          {icon}
        </div>
      ) : null}
      <div className="text-sm font-semibold text-white">{title}</div>
      <div className="mt-1 text-sm leading-6 text-white/54">{description}</div>
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
      ? "border-emerald-400/20 bg-emerald-500/[0.08]"
      : tone === "warning"
        ? "border-amber-400/22 bg-amber-500/[0.08]"
        : tone === "info"
          ? "border-sky-400/18 bg-sky-500/[0.08]"
          : tone === "danger"
            ? "border-rose-400/22 bg-rose-500/[0.08]"
            : "border-white/10 bg-white/[0.03]";
  const iconClass =
    tone === "success"
      ? "text-emerald-300"
      : tone === "warning"
        ? "text-amber-300"
        : tone === "info"
          ? "text-sky-300"
          : tone === "danger"
            ? "text-rose-300"
            : "text-primary";

  return (
    <div
      className={cn(
        "rounded-[1.2rem] border px-4 py-3.5 shadow-[0_16px_40px_rgba(2,3,10,0.18)]",
        toneClass,
        className,
      )}
      style={style}
    >
      <div className="flex items-start gap-3">
        {icon ? (
          <div
            className={cn(
              "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/10",
              iconClass,
            )}
          >
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="mt-1 text-sm leading-6 text-white/58">{description}</div>
          {children ? <div className="mt-3">{children}</div> : null}
        </div>
      </div>
    </div>
  );
}
