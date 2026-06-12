"use client";

import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  CalendarDays,
  Check,
  Circle,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { QuickActions } from "@/components/student/QuickActions";
import type { StudentJourneyStep } from "@/lib/students/app-summary";

export type StudentNextLessonSummary = {
  href: string;
  dayLabel: string;
  timeLabel: string;
  primary: string;
  secondary?: string | null;
  vehicle?: string | null;
};

export type StudentExamReadinessSummary = {
  href: string;
  readinessPct: number;
  badgeLabel: string;
  badgeVariant: "success" | "warning" | "default";
  title: string;
  detail: string;
  eta: string;
};

export type StudentCoachSummary = {
  title: string;
  body: string;
  ctaHref: string;
  eyebrow?: string;
};

function DashboardSection({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(22,22,39,0.96),rgba(14,14,27,0.98))] shadow-[0_20px_48px_rgba(1,2,8,0.34)] sm:rounded-[1.65rem] sm:shadow-[0_24px_60px_rgba(1,2,8,0.4)]",
        className,
      )}
      style={style}
    >
      {children}
    </section>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const safe = Math.max(0, Math.min(100, Math.round(pct)));
  const size = 148;
  const stroke = 16;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference - (safe / 100) * circumference;

  return (
    <div className="relative h-[7.25rem] w-[7.25rem] shrink-0 sm:h-[9.5rem] sm:w-[9.5rem]">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id="student-progress-ring" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="color-mix(in oklab, var(--primary) 72%, white)" />
            <stop offset="100%" stopColor="var(--primary)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#student-progress-ring)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dash}
        />
      </svg>
      <div className="absolute inset-[1rem] flex flex-col items-center justify-center rounded-full bg-[radial-gradient(circle_at_top,rgba(68,38,142,0.35),rgba(7,8,17,0.92)_72%)] text-center sm:inset-[1.35rem]">
        <div className="text-[1.38rem] font-black leading-none tracking-tight text-white sm:text-[1.9rem]">
          {safe}%
        </div>
        <div className="mt-0.5 text-[10px] text-white/72 sm:mt-1 sm:text-sm">Voortgang</div>
      </div>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const width = 120;
  const height = 30;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-8 w-28 text-primary">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function JourneyTimeline({ steps }: { steps: StudentJourneyStep[] }) {
  return (
    <ol className="space-y-2.5 sm:space-y-3">
      {steps.map((step, index) => {
        const dotClass =
          step.status === "complete"
            ? "border-emerald-400/40 bg-emerald-500/18 text-emerald-300"
            : step.status === "active"
              ? "border-primary/40 bg-primary/18 text-primary"
              : "border-white/16 bg-transparent text-transparent";

        return (
          <li key={step.label} className="relative flex items-start gap-2 pl-0.5 sm:gap-3">
            {index < steps.length - 1 ? (
              <span
                className={cn(
                  "absolute left-[0.72rem] top-[1.625rem] h-[1.625rem] w-px sm:left-[0.82rem] sm:top-7 sm:h-7",
                  step.status === "complete"
                    ? "bg-emerald-400/40"
                    : step.status === "active"
                      ? "bg-primary/35"
                      : "bg-white/10",
                )}
                aria-hidden
              />
            ) : null}
            <span
              className={cn(
                "relative z-10 flex h-[1.375rem] w-[1.375rem] shrink-0 items-center justify-center rounded-full border sm:h-6 sm:w-6",
                dotClass,
              )}
            >
              {step.status === "complete" ? (
                <Check className="h-[0.8125rem] w-[0.8125rem] sm:h-3.5 sm:w-3.5" aria-hidden />
              ) : step.status === "active" ? (
                <Circle className="h-[0.8125rem] w-[0.8125rem] fill-current sm:h-3.5 sm:w-3.5" aria-hidden />
              ) : (
                <span className="h-[0.5625rem] w-[0.5625rem] rounded-full border border-white/20 sm:h-2.5 sm:w-2.5" />
              )}
            </span>
            <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5 border-b border-white/6 pb-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:pb-2.5">
              <span
                className={cn(
                  "block min-w-0 max-w-full text-[0.84rem] font-medium leading-[1.125rem] sm:flex-1 sm:text-[0.98rem] sm:leading-5",
                  step.status === "upcoming" ? "text-white/72" : "text-white",
                )}
              >
                {step.label}
              </span>
              {step.value ? (
                <span
                  className={cn(
                    "shrink-0 text-[11px] font-semibold sm:text-sm",
                    step.status === "complete"
                      ? "text-emerald-300"
                      : step.status === "active"
                        ? "text-primary"
                        : "text-white/48",
                  )}
                >
                  {step.value}
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function HomeInfoCard({
  icon,
  eyebrow,
  title,
  lines,
  ctaLabel,
  href,
  badge,
  badgeVariant = "default",
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  lines: string[];
  ctaLabel: string;
  href: string;
  badge?: string;
  badgeVariant?: "success" | "warning" | "default";
}) {
  return (
    <DashboardSection className="h-full">
      <div className="flex h-full flex-col p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/62 sm:text-[11px] sm:tracking-[0.22em]">
              <span className="flex h-8 w-8 items-center justify-center rounded-[0.95rem] bg-primary/16 text-primary sm:h-9 sm:w-9 sm:rounded-2xl">
                {icon}
              </span>
              {eyebrow}
            </div>
            <div className="text-[0.96rem] font-semibold leading-5 text-white sm:text-lg">{title}</div>
          </div>
          {badge ? (
            <Badge
              variant={badgeVariant}
              className="shrink-0 whitespace-nowrap px-2 py-0.5 text-[10px] font-semibold sm:text-xs"
            >
              {badge}
            </Badge>
          ) : null}
        </div>

        <div className="mt-3 space-y-1 sm:mt-4 sm:space-y-1.5">
          {lines.map((line, index) => (
            <p
              key={`${title}-${index}`}
              className={cn(
                index === 0
                  ? "text-[1.08rem] font-black leading-tight tracking-tight text-white sm:text-[1.86rem] sm:leading-none"
                  : "text-[11px] leading-[1.05rem] text-white/76 sm:text-sm sm:leading-6",
              )}
            >
              {line}
            </p>
          ))}
        </div>

        <Link
          href={href}
          className="mt-auto inline-flex h-10 items-center justify-between rounded-[0.95rem] bg-[linear-gradient(135deg,#7548ff,#5d2aff)] px-3.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(98,61,255,0.32)] transition hover:brightness-110 sm:h-12 sm:rounded-[1rem] sm:px-4"
        >
          <span>{ctaLabel}</span>
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </DashboardSection>
  );
}

function CoachOrb() {
  return (
    <div className="relative h-20 w-20 shrink-0 sm:h-24 sm:w-24">
      <div className="absolute inset-0 rounded-[2rem] bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.75),rgba(167,122,255,0.3)_34%,rgba(31,22,66,0.95)_70%)] shadow-[0_25px_50px_rgba(79,44,196,0.5)]" />
      <div className="absolute inset-[0.6rem] rounded-[1.45rem] border border-white/20 bg-[linear-gradient(180deg,rgba(18,18,34,0.9),rgba(8,8,20,0.96))] sm:inset-[0.65rem] sm:rounded-[1.7rem]" />
      <div className="absolute inset-x-[1.2rem] top-[1.8rem] flex justify-between sm:inset-x-[1.45rem] sm:top-[2.1rem]">
        <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_16px_rgba(118,84,255,0.85)] sm:h-3 sm:w-3" />
        <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_16px_rgba(118,84,255,0.85)] sm:h-3 sm:w-3" />
      </div>
      <div className="absolute left-1/2 top-[3.25rem] h-[0.34rem] w-8 -translate-x-1/2 rounded-full bg-primary/80 shadow-[0_0_12px_rgba(118,84,255,0.55)] sm:top-[3.95rem] sm:h-[0.38rem] sm:w-9" />
      <div className="absolute -left-1.5 top-[2.1rem] flex h-6 w-6 items-center justify-center rounded-full border border-white/12 bg-card/80 sm:-left-2 sm:top-[2.55rem] sm:h-7 sm:w-7">
        <Bot className="h-3.5 w-3.5 text-primary sm:h-4 sm:w-4" aria-hidden />
      </div>
    </div>
  );
}

export function StudentHomeDashboard({
  greeting,
  firstName,
  journeyPct,
  journeyStatus,
  journeySteps,
  sparklineValues,
  nextLesson,
  examStatus,
  coach,
  messageUnreadCount,
}: {
  greeting: string;
  firstName: string;
  journeyPct: number;
  journeyStatus: string;
  journeySteps: StudentJourneyStep[];
  sparklineValues: number[];
  nextLesson: StudentNextLessonSummary | null;
  examStatus: StudentExamReadinessSummary;
  coach: StudentCoachSummary;
  messageUnreadCount: number;
}) {
  return (
    <div className="space-y-3 sm:space-y-4">
      <section className="px-1 pt-0.5">
        <h1 className="text-[clamp(1.48rem,5.8vw,2.15rem)] font-black leading-[1.02] tracking-tight text-white sm:text-[clamp(2.02rem,8vw,2.65rem)]">
          {greeting}, {firstName}! <span aria-hidden>👋</span>
        </h1>
        <p className="mt-1.5 text-[0.84rem] leading-[1.25rem] text-white/72 sm:mt-2 sm:text-[0.98rem] sm:leading-[1.625rem]">
          Klaar om weer een stap dichter bij je rijbewijs te komen?
        </p>
      </section>

      <DashboardSection className="border-primary/30 bg-[radial-gradient(circle_at_12%_0%,rgba(152,115,255,0.18),transparent_28%),linear-gradient(140deg,rgba(34,26,68,0.98),rgba(14,13,28,0.98)_62%,rgba(18,13,39,0.98))]">
        <div className="space-y-3 p-3 sm:space-y-4 sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[1.06rem] font-bold tracking-tight text-white sm:text-[1.42rem]">
              Mijn rijbewijsreis
            </h2>
            <Badge
              variant="primary"
              className="shrink-0 whitespace-nowrap bg-primary/18 px-2 py-0.5 text-[10px] text-primary shadow-none sm:text-xs"
            >
              {journeyPct}% voltooid
            </Badge>
          </div>

          <div className="space-y-3 sm:grid sm:grid-cols-[minmax(0,9.1rem)_minmax(0,1fr)] sm:gap-4 sm:space-y-0">
            <div className="flex items-center gap-3 sm:block sm:space-y-4">
              <ProgressRing pct={journeyPct} />
              <div className="min-w-0 flex-1 space-y-2 sm:space-y-0">
                <p className="text-[0.82rem] font-medium leading-[1.15rem] text-white/86 sm:text-[1.02rem] sm:leading-6">
                  {journeyStatus}
                </p>
                <div className="flex justify-start sm:hidden">
                  <Sparkline values={sparklineValues} />
                </div>
              </div>
            </div>

            <div className="min-w-0 space-y-2.5 sm:space-y-4">
              <JourneyTimeline steps={journeySteps} />
              <div className="hidden justify-end sm:flex">
                <Sparkline values={sparklineValues} />
              </div>
            </div>
          </div>
        </div>
      </DashboardSection>

      <div className="grid grid-cols-1 gap-2.5 min-[390px]:grid-cols-2 sm:gap-3">
        {nextLesson ? (
          <HomeInfoCard
            icon={<CalendarDays className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
            eyebrow="Volgende les"
            title={nextLesson.dayLabel}
            lines={[
              nextLesson.timeLabel,
              nextLesson.primary,
              [nextLesson.secondary, nextLesson.vehicle].filter(Boolean).join(" • "),
            ].filter(Boolean)}
            ctaLabel="Bekijk les"
            href={nextLesson.href}
          />
        ) : (
          <HomeInfoCard
            icon={<CalendarDays className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
            eyebrow="Volgende les"
            title="Nog niet ingepland"
            lines={[
              "Plan je ritme",
              "Neem contact op met je rijschool",
              "om je volgende les vast te zetten.",
            ]}
            ctaLabel="Open planning"
            href="/student/lessons"
          />
        )}

        <HomeInfoCard
          icon={<BadgeCheck className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
          eyebrow="Examenstatus"
          title={examStatus.title}
          lines={[
            `${examStatus.readinessPct}%`,
            examStatus.detail,
            examStatus.eta,
          ]}
          ctaLabel="Bekijk details"
          href={examStatus.href}
          badge={examStatus.badgeLabel}
          badgeVariant={examStatus.badgeVariant}
        />
      </div>

      <DashboardSection className="border-white/8">
        <div className="flex items-center justify-between border-b border-white/6 px-3.5 pb-2.5 pt-3.5 sm:px-4 sm:pb-3 sm:pt-4">
          <h2 className="text-[1.03rem] font-bold tracking-tight text-white sm:text-[1.18rem]">AI Coach</h2>
          <Badge
            variant="primary"
            className="gap-1 whitespace-nowrap bg-primary/16 px-2 py-0.5 text-[10px] text-primary shadow-none sm:text-xs"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Nieuw
          </Badge>
        </div>
        <div className="flex items-center gap-2.5 p-3 sm:gap-4 sm:p-4">
          <CoachOrb />
          <div className="min-w-0 flex-1">
            {coach.eyebrow ? (
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
                {coach.eyebrow}
              </p>
            ) : null}
            <h3 className="mt-1 text-[0.98rem] font-semibold leading-[1.375rem] text-white sm:text-[1.1rem] sm:leading-6">
              {coach.title}
            </h3>
            <p className="mt-1.5 text-[12px] leading-[1.125rem] text-white/72 sm:mt-2 sm:text-sm sm:leading-6">
              {coach.body}
            </p>
            <Link
              href={coach.ctaHref}
              className="mt-3 inline-flex h-10 items-center rounded-[0.9rem] bg-primary/18 px-3.5 text-sm font-semibold text-primary transition hover:bg-primary/24 sm:mt-4 sm:h-11 sm:px-4"
            >
              Bekijk advies
            </Link>
          </div>
        </div>
      </DashboardSection>

      <QuickActions messageUnreadCount={messageUnreadCount} />
    </div>
  );
}
