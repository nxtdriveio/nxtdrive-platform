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

export type StudentJourneyStep = {
  label: string;
  status: "complete" | "active" | "upcoming";
  value?: string;
};

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
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[1.65rem] border border-white/10 bg-[linear-gradient(180deg,rgba(22,22,39,0.96),rgba(14,14,27,0.98))] shadow-[0_24px_60px_rgba(1,2,8,0.4)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const safe = Math.max(0, Math.min(100, Math.round(pct)));
  const size = 166;
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference - (safe / 100) * circumference;

  return (
    <div className="relative h-[10.4rem] w-[10.4rem] shrink-0">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id="student-progress-ring" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(149,116,255,1)" />
            <stop offset="100%" stopColor="rgba(95,42,255,1)" />
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
      <div className="absolute inset-[1.5rem] flex flex-col items-center justify-center rounded-full bg-[radial-gradient(circle_at_top,rgba(68,38,142,0.35),rgba(7,8,17,0.92)_72%)] text-center">
        <div className="text-[2.05rem] font-black leading-none tracking-tight text-white">
          {safe}%
        </div>
        <div className="mt-1 text-sm text-white/72">Voortgang</div>
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
    <ol className="space-y-3">
      {steps.map((step, index) => {
        const dotClass =
          step.status === "complete"
            ? "border-emerald-400/40 bg-emerald-500/18 text-emerald-300"
            : step.status === "active"
              ? "border-primary/40 bg-primary/18 text-primary"
              : "border-white/16 bg-transparent text-transparent";

        return (
          <li key={step.label} className="relative flex items-start gap-3 pl-0.5">
            {index < steps.length - 1 ? (
              <span
                className={cn(
                  "absolute left-[0.82rem] top-7 h-7 w-px",
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
                "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                dotClass,
              )}
            >
              {step.status === "complete" ? (
                <Check className="h-3.5 w-3.5" aria-hidden />
              ) : step.status === "active" ? (
                <Circle className="h-3.5 w-3.5 fill-current" aria-hidden />
              ) : (
                <span className="h-2.5 w-2.5 rounded-full border border-white/20" />
              )}
            </span>
            <div className="flex min-w-0 flex-1 items-center justify-between gap-3 border-b border-white/6 pb-2.5">
              <span
                className={cn(
                  "truncate text-[1rem] font-medium",
                  step.status === "upcoming" ? "text-white/72" : "text-white",
                )}
              >
                {step.label}
              </span>
              {step.value ? (
                <span
                  className={cn(
                    "shrink-0 text-sm font-semibold",
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
      <div className="flex h-full flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/62">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/16 text-primary">
                {icon}
              </span>
              {eyebrow}
            </div>
            <div className="text-lg font-semibold text-white">{title}</div>
          </div>
          {badge ? <Badge variant={badgeVariant}>{badge}</Badge> : null}
        </div>

        <div className="mt-4 space-y-1.5">
          {lines.map((line, index) => (
            <p
              key={`${title}-${index}`}
              className={cn(
                index === 0
                  ? "text-[2.15rem] font-black leading-none tracking-tight text-white"
                  : "text-sm leading-6 text-white/76",
              )}
            >
              {line}
            </p>
          ))}
        </div>

        <Link
          href={href}
          className="mt-auto inline-flex h-12 items-center justify-between rounded-[1rem] bg-[linear-gradient(135deg,#7548ff,#5d2aff)] px-4 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(98,61,255,0.35)] transition hover:brightness-110"
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
    <div className="relative h-24 w-24 shrink-0">
      <div className="absolute inset-0 rounded-[2rem] bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.75),rgba(167,122,255,0.3)_34%,rgba(31,22,66,0.95)_70%)] shadow-[0_25px_50px_rgba(79,44,196,0.5)]" />
      <div className="absolute inset-[0.65rem] rounded-[1.7rem] border border-white/20 bg-[linear-gradient(180deg,rgba(18,18,34,0.9),rgba(8,8,20,0.96))]" />
      <div className="absolute inset-x-[1.45rem] top-[2.1rem] flex justify-between">
        <span className="h-3 w-3 rounded-full bg-primary shadow-[0_0_16px_rgba(118,84,255,0.85)]" />
        <span className="h-3 w-3 rounded-full bg-primary shadow-[0_0_16px_rgba(118,84,255,0.85)]" />
      </div>
      <div className="absolute left-1/2 top-[3.95rem] h-[0.38rem] w-9 -translate-x-1/2 rounded-full bg-primary/80 shadow-[0_0_12px_rgba(118,84,255,0.55)]" />
      <div className="absolute -left-2 top-[2.55rem] flex h-7 w-7 items-center justify-center rounded-full border border-white/12 bg-card/80">
        <Bot className="h-4 w-4 text-primary" aria-hidden />
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
    <div className="space-y-4 sm:space-y-5">
      <section className="px-1 pt-1">
        <h1 className="text-[clamp(2.1rem,8vw,2.75rem)] font-black leading-[1.02] tracking-tight text-white">
          {greeting}, {firstName}! <span aria-hidden>👋</span>
        </h1>
        <p className="mt-2 text-[1.02rem] leading-7 text-white/72">
          Klaar om weer een stap dichter bij je rijbewijs te komen?
        </p>
      </section>

      <DashboardSection className="border-primary/30 bg-[radial-gradient(circle_at_12%_0%,rgba(152,115,255,0.18),transparent_28%),linear-gradient(140deg,rgba(34,26,68,0.98),rgba(14,13,28,0.98)_62%,rgba(18,13,39,0.98))]">
        <div className="space-y-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[1.65rem] font-bold tracking-tight text-white">
              Mijn rijbewijsreis
            </h2>
            <Badge variant="primary" className="bg-primary/18 text-primary shadow-none">
              {journeyPct}% voltooid
            </Badge>
          </div>

          <div className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-4">
            <div className="space-y-4">
              <ProgressRing pct={journeyPct} />
              <p className="text-[1.05rem] font-medium text-white/86">{journeyStatus}</p>
            </div>

            <div className="min-w-0 space-y-4">
              <JourneyTimeline steps={journeySteps} />
              <div className="flex justify-end">
                <Sparkline values={sparklineValues} />
              </div>
            </div>
          </div>
        </div>
      </DashboardSection>

      <div className="grid grid-cols-2 gap-3">
        {nextLesson ? (
          <HomeInfoCard
            icon={<CalendarDays className="h-4.5 w-4.5" aria-hidden />}
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
            icon={<CalendarDays className="h-4.5 w-4.5" aria-hidden />}
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
          icon={<BadgeCheck className="h-4.5 w-4.5" aria-hidden />}
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
        <div className="flex items-center justify-between border-b border-white/6 px-4 pb-3 pt-4">
          <h2 className="text-[1.4rem] font-bold tracking-tight text-white">AI Coach</h2>
          <Badge variant="primary" className="gap-1 bg-primary/16 text-primary shadow-none">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Nieuw
          </Badge>
        </div>
        <div className="flex items-center gap-4 p-4">
          <CoachOrb />
          <div className="min-w-0 flex-1">
            {coach.eyebrow ? (
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
                {coach.eyebrow}
              </p>
            ) : null}
            <h3 className="mt-1 text-[1.15rem] font-semibold leading-6 text-white">
              {coach.title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-white/72">{coach.body}</p>
            <Link
              href={coach.ctaHref}
              className="mt-4 inline-flex h-11 items-center rounded-[0.95rem] bg-primary/18 px-4 text-sm font-semibold text-primary transition hover:bg-primary/24"
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
