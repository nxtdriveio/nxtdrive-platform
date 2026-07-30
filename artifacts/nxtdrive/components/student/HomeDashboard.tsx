"use client";

import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Check,
  MapPin,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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

const HOURS_FMT = new Intl.NumberFormat("nl-NL", {
  maximumFractionDigits: 1,
});

function formatHours(minutes: number) {
  return `${HOURS_FMT.format(Math.max(0, minutes) / 60)} lesuur`;
}

function cleanDisplayText(text: string) {
  return text
    .replace(/\u00c2\u00b7/g, "-")
    .replace(/\u00c3\u0082\u00c2\u00b7/g, "-")
    .replace(/!\s.+$/, "")
    .trim();
}

function DashboardCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-[var(--radius-card)] border border-brand-border/80 bg-white shadow-brand-card",
        className,
      )}
    >
      {children}
    </section>
  );
}

function CardHeader({
  icon,
  label,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.95rem] bg-brand-accent text-brand-primary">
          {icon}
        </span>
        <span className="truncate text-[11px] font-semibold uppercase text-brand-muted-foreground">
          {label}
        </span>
      </div>
      {badge}
    </div>
  );
}

function ProgressRing({
  pct,
  size = 104,
  stroke = 10,
}: {
  pct: number;
  size?: number;
  stroke?: number;
}) {
  const safe = Math.max(0, Math.min(100, Math.round(pct)));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference - (safe / 100) * circumference;

  return (
    <div className="relative shrink-0" style={{ height: size, width: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id="student-home-progress-ring" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--brand-secondary)" />
            <stop offset="100%" stopColor="var(--brand-primary)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="color-mix(in oklab, var(--brand-border) 82%, white)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#student-home-progress-ring)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dash}
        />
      </svg>
      <div className="absolute inset-[1.05rem] flex items-center justify-center rounded-full bg-white shadow-inner">
        <span className="text-xl font-black text-brand-foreground">
          {safe}%
        </span>
      </div>
    </div>
  );
}

function HeroRoad() {
  return (
    <svg
      viewBox="0 0 260 120"
      className="pointer-events-none absolute inset-y-0 right-0 h-full w-2/3 opacity-75"
      aria-hidden
    >
      <defs>
        <linearGradient id="student-road-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7c5cff" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <path
        d="M26 111 C82 76 93 74 119 63 C151 49 142 29 187 19 C213 13 236 17 252 23"
        fill="none"
        stroke="url(#student-road-gradient)"
        strokeWidth="11"
        strokeLinecap="round"
        opacity="0.34"
      />
      <path
        d="M40 112 C88 82 101 78 124 66 C152 52 150 34 190 24 C216 18 238 22 252 28"
        fill="none"
        stroke="#ffffff"
        strokeDasharray="10 13"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.54"
      />
      <circle cx="206" cy="22" r="5" fill="#38bdf8" opacity="0.85" />
    </svg>
  );
}

function NextStepHero({ coach }: { coach: StudentCoachSummary }) {
  return (
    <section
      data-student-hero=""
      className="relative overflow-hidden rounded-[1.35rem] border border-white/15 px-4 py-4 text-white shadow-brand-card sm:rounded-[1.55rem] sm:px-5 sm:py-5 xl:px-6"
      style={{ background: "var(--brand-hero-background)" }}
    >
      <HeroRoad />
      <div className="relative z-10 flex min-w-0 items-center justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <p className="text-[11px] font-semibold uppercase text-white/64">
            Jouw volgende stap
          </p>
          <h2 className="text-lg font-black text-white sm:text-xl">
            {cleanDisplayText(coach.title)}
          </h2>
          <p className="max-w-xl text-xs leading-5 text-white/78 sm:text-sm sm:leading-6">
            {coach.body}
          </p>
          <Link
            href={coach.ctaHref}
            className="inline-flex h-9 items-center gap-2 rounded-[0.85rem] bg-white px-3.5 text-xs font-semibold text-brand-primary shadow-sm transition hover:bg-white/92 sm:h-10 sm:text-sm"
          >
            Bekijk plan
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1 rounded-full border border-white/20 bg-white/10 p-1.5 backdrop-blur sm:p-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-cyan-300/70 text-base font-black text-white sm:h-16 sm:w-16 sm:text-lg">
            Focus
          </div>
          <span className="text-[9px] font-semibold text-white/70 sm:text-[10px]">
            Volgende stap
          </span>
        </div>
      </div>
    </section>
  );
}

function NextLessonCard({ nextLesson }: { nextLesson: StudentNextLessonSummary | null }) {
  return (
    <DashboardCard className="p-4">
      <CardHeader
        icon={<CalendarDays className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
        label="Volgende les"
      />
      {nextLesson ? (
        <div className="mt-4 space-y-3">
          <div>
            <h3 className="text-lg font-black text-brand-foreground">
              {nextLesson.dayLabel}
            </h3>
            <p className="mt-1 text-sm font-semibold text-brand-foreground">
              {nextLesson.timeLabel}
            </p>
          </div>
          <div className="space-y-1.5 text-xs leading-5 text-brand-muted-foreground">
            <p className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-brand-primary" aria-hidden />
              {nextLesson.secondary ?? "Locatie volgt"}
            </p>
            <p>{nextLesson.primary}</p>
            {nextLesson.vehicle ? <p>{nextLesson.vehicle}</p> : null}
          </div>
          <Link
            href={nextLesson.href}
            className="inline-flex h-10 items-center gap-2 rounded-[0.9rem] bg-brand-accent px-3.5 text-sm font-semibold text-brand-primary transition hover:bg-brand-primary hover:text-brand-primary-foreground"
          >
            Bekijk les
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <h3 className="text-lg font-black text-brand-foreground">
              Nog niet ingepland
            </h3>
            <p className="mt-1 text-sm leading-6 text-brand-muted-foreground">
              Plan je ritme met je rijschool en zet de volgende les alvast vast.
            </p>
          </div>
          <Link
            href="/leerling/lessen"
            className="inline-flex h-10 items-center gap-2 rounded-[0.9rem] bg-brand-primary px-3.5 text-sm font-semibold text-brand-primary-foreground transition hover:brightness-105"
          >
            Les plannen
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      )}
    </DashboardCard>
  );
}

function ExamCard({ examStatus }: { examStatus: StudentExamReadinessSummary }) {
  return (
    <DashboardCard className="p-4">
      <CardHeader
        icon={<BadgeCheck className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
        label="Examens"
        badge={<Badge variant={examStatus.badgeVariant}>{examStatus.badgeLabel}</Badge>}
      />
      <div className="mt-4 flex items-center gap-4">
        <ProgressRing pct={examStatus.readinessPct} size={88} stroke={9} />
        <div className="min-w-0">
          <h3 className="text-base font-black text-brand-foreground">
            {examStatus.title}
          </h3>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-brand-muted-foreground">
            {cleanDisplayText(examStatus.detail)}
          </p>
          <p className="mt-1 text-xs font-semibold text-brand-primary">
            {examStatus.eta}
          </p>
        </div>
      </div>
      <Link
        href={examStatus.href}
        className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-primary"
      >
        Naar examens
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </DashboardCard>
  );
}

function JourneyPanel({ steps }: { steps: StudentJourneyStep[] }) {
  return (
    <DashboardCard className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase text-brand-muted-foreground">
            Mijn reis
          </p>
          <h2 className="mt-1 text-lg font-black text-brand-foreground">
            Jouw rijbewijsreis
          </h2>
        </div>
        <Link
          href="/leerling/reflectie"
          className="text-sm font-semibold text-brand-primary"
        >
          Bekijk alles
        </Link>
      </div>
      <div className="mt-4 space-y-3">
        {steps.map((step) => {
          const complete = step.status === "complete";
          const active = step.status === "active";

          return (
            <div key={step.label} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                  complete
                    ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                    : active
                      ? "border-brand-primary/30 bg-brand-accent text-brand-primary"
                      : "border-brand-border bg-white text-brand-muted-foreground",
                )}
              >
                {complete ? (
                  <Check className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-current" />
                )}
              </span>
              <div className="min-w-0 flex-1 border-b border-brand-border/65 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-semibold text-brand-foreground">
                    {step.label}
                  </span>
                  {step.value ? (
                    <span className="shrink-0 text-xs font-semibold text-brand-primary">
                      {step.value}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </DashboardCard>
  );
}

export function StudentHomeDashboard({
  greeting,
  firstName,
  journeySteps,
  nextLesson,
  examStatus,
  coach,
  creditAvailableMinutes,
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
  creditAvailableMinutes: number;
}) {
  return (
    <div className="min-w-0 space-y-4 sm:space-y-5 xl:space-y-6">
      <section className="px-1">
        <p className="text-sm font-semibold text-brand-muted-foreground">
          Wat gaan we vandaag doen?
        </p>
        <h1 className="mt-1 text-[1.65rem] font-black leading-tight text-brand-foreground sm:text-2xl xl:text-[2.35rem]">
          {greeting}, {firstName}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-brand-muted-foreground sm:text-[0.96rem]">
          Klaar voor je volgende stap? Alles wat belangrijk is staat direct
          voor je klaar.
        </p>
        <Link
          href="/leerling/betalingen"
          className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-brand-border bg-white px-3.5 text-sm font-semibold text-brand-foreground shadow-sm transition hover:border-brand-primary/40 hover:text-brand-primary"
        >
          <Wallet className="h-4 w-4 text-brand-primary" aria-hidden />
          {formatHours(creditAvailableMinutes)} beschikbaar
          {creditAvailableMinutes < 600 ? (
            <Badge variant="warning" className="shadow-none">
              Bijna op
            </Badge>
          ) : null}
        </Link>
      </section>

      <NextStepHero coach={coach} />

      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        <NextLessonCard nextLesson={nextLesson} />
        <ExamCard examStatus={examStatus} />
      </div>

      <JourneyPanel steps={journeySteps} />
    </div>
  );
}
