"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  CalendarClock,
  ListTodo,
  MessageCircle,
  Bell,
  LogOut,
  CalendarRange,
} from "lucide-react";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { InstructorDayList } from "@/components/instructor/DayList";
import { cn } from "@/lib/utils";
import type { Lesson } from "@/lib/lessons/types";
import type { AgendaTrialLesson } from "@/lib/trial-lessons/agenda";

type NavItem = {
  href: string;
  label: string;
  icon: typeof CalendarDays;
  match: "exact" | "prefix";
};

/** Mobile-only nav (nav links stay in InstructorTopbar on desktop). */
const MOBILE_NAV: NavItem[] = [
  { href: "/instructor", label: "Vandaag", icon: CalendarDays, match: "exact" },
  { href: "/instructor/week", label: "Planning", icon: ClipboardList, match: "prefix" },
  {
    href: "/instructor/beschikbaarheid",
    label: "Beschikbaarheid",
    icon: CalendarClock,
    match: "prefix",
  },
  { href: "/instructor/taken", label: "Taken", icon: ListTodo, match: "prefix" },
  { href: "/instructor/berichten", label: "Berichten", icon: MessageCircle, match: "prefix" },
  { href: "/instructor/meldingen", label: "Meldingen", icon: Bell, match: "prefix" },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.match === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Instructor PWA sidebar.
 *
 * Desktop (md+): dark agenda-rail — date header, full-day lesson timeline
 * (using InstructorDayList which auto-highlights the selected lesson via
 * usePathname), Weekplanning shortcut, user name + logout footer.
 *
 * Mobile: compact sticky top bar (logo + notifications + logout) followed by a
 * horizontal nav-link strip. The agenda appears as a horizontal chip row
 * embedded directly in the lesson page.
 */
export function InstructorSidebar({
  tenantName,
  userLabel,
  logoUrl,
  notifications,
  todayLessons,
  studentNames,
  todayDate,
  trialLessons,
}: {
  tenantName: string;
  userLabel: string;
  logoUrl?: string | null;
  notifications?: ReactNode;
  todayLessons: Lesson[];
  studentNames: Map<string, string>;
  todayDate: Date;
  trialLessons?: AgendaTrialLesson[];
}) {
  const pathname = usePathname() ?? "";

  return (
    <>
      {/* ── Desktop agenda-rail ─────────────────────────────────────────── */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
        {/* Logo */}
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <NxtdriveLogo className="text-base" logoUrl={logoUrl} brandName={tenantName} />
        </div>

        {/* Agenda: full-height scrollable */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3">
          <InstructorDayList
            lessons={todayLessons}
            studentNames={studentNames}
            date={todayDate}
            trialLessons={trialLessons}
          />
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border p-3 space-y-1">
          <Link
            href="/instructor/week"
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors",
              pathname.startsWith("/instructor/week")
                ? "bg-primary-soft font-medium text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <CalendarRange className="h-4 w-4 shrink-0" aria-hidden />
            Weekplanning
          </Link>
          <div className="flex items-center justify-between gap-2 px-2.5 py-1">
            <span
              className="truncate text-xs text-muted-foreground"
              title={userLabel}
            >
              {userLabel}
            </span>
            <form method="post" action="/auth/logout">
              <button
                type="submit"
                aria-label="Uitloggen"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <LogOut className="h-4 w-4" aria-hidden />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* ── Mobile: sticky top bar + horizontal nav strip ───────────────── */}
      <header
        className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur md:hidden"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <NxtdriveLogo className="text-base" logoUrl={logoUrl} brandName={tenantName} />
          <div className="flex items-center gap-1">
            {notifications}
            <form method="post" action="/auth/logout">
              <button
                type="submit"
                aria-label="Uitloggen"
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <LogOut className="h-4 w-4" aria-hidden />
              </button>
            </form>
          </div>
        </div>
        <nav className="flex items-center gap-1 overflow-x-auto px-2 pb-2">
          {MOBILE_NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-primary-soft font-medium text-primary"
                    : "text-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
    </>
  );
}
