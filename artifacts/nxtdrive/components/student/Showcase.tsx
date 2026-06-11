import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { InfoBubble } from "@/components/ui/info-bubble";
import { cn } from "@/lib/utils";

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
        "flex min-w-0 gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
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
              "inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition",
              active
                ? "border-primary/50 bg-primary/18 text-primary shadow-[0_10px_30px_rgba(88,51,214,0.2)]"
                : "border-white/10 bg-card/72 text-white/62 hover:border-white/16 hover:text-white",
            )}
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
}: {
  title?: React.ReactNode;
  eyebrow?: React.ReactNode;
  info?: React.ReactNode;
  actionLabel?: string;
  actionHref?: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[1.55rem] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,33,0.96),rgba(10,10,22,0.98))] shadow-[0_24px_60px_rgba(2,3,10,0.38)]",
        className,
      )}
    >
      {title || eyebrow || actionLabel ? (
        <div className="flex items-center justify-between gap-3 border-b border-white/7 px-4 py-3.5">
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
      <div className={cn("px-4 py-4", bodyClassName)}>{children}</div>
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
  size = 126,
  stroke = 12,
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
            <stop offset="0%" stopColor="rgba(160,121,255,1)" />
            <stop offset="100%" stopColor="rgba(95,42,255,1)" />
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
      <div className="absolute inset-[1.1rem] flex flex-col items-center justify-center rounded-full bg-[radial-gradient(circle_at_top,rgba(76,44,162,0.28),rgba(7,8,17,0.94)_72%)] text-center">
        <div className="text-[1.9rem] font-black leading-none tracking-tight text-white">
          {safe}%
        </div>
        <div className="mt-1 text-xs text-white/68">{label}</div>
        {caption ? <div className="mt-1 text-[10px] text-white/42">{caption}</div> : null}
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
          className="h-full rounded-full bg-[linear-gradient(90deg,#7d55ff,#5d2aff)]"
          style={{ width: `${pct}%` }}
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
        "flex min-w-0 items-center gap-3 rounded-[1.15rem] border border-white/10 bg-white/[0.02] px-3 py-3 transition",
        href ? "hover:border-white/14 hover:bg-white/[0.04]" : "",
        className,
      )}
    >
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-white">{title}</div>
        {subtitle ? <div className="mt-0.5 text-xs leading-5 text-white/50">{subtitle}</div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {meta ? <div className="text-[11px] text-white/40">{meta}</div> : null}
        {badge ? <Badge variant={badgeVariant}>{badge}</Badge> : null}
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
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold",
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
}: {
  title: React.ReactNode;
  description: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "default" | "success" | "warning" | "info" | "danger";
  className?: string;
  children?: React.ReactNode;
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
