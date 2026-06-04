"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  CalendarDays,
  ClipboardList,
  ListTodo,
  MessageCircle,
  LogOut,
  CalendarRange,
  MoreHorizontal,
} from "lucide-react";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { Avatar } from "@/components/ui/avatar";
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

/**
 * Mobile nav: trimmed to 5 most-used destinations.
 * "Meer" is a simple link to the taken-page as a catch-all.
 */
const MOBILE_NAV: NavItem[] = [
  { href: "/instructor", label: "Vandaag", icon: CalendarDays, match: "exact" },
  { href: "/instructor/week", label: "Planning", icon: ClipboardList, match: "prefix" },
  { href: "/instructor/taken", label: "Taken", icon: ListTodo, match: "prefix" },
  { href: "/instructor/berichten", label: "Berichten", icon: MessageCircle, match: "prefix" },
  { href: "/instructor/beschikbaarheid", label: "Meer", icon: MoreHorizontal, match: "prefix" },
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
 * usePathname), Weekplanning shortcut, and a polished user-tile footer
 * (avatar + name + logout).
 *
 * Mobile: compact sticky top bar (logo + notifications + logout) followed by a
 * 5-item bottom-nav strip with Framer Motion active-pill animation.
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
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
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

        {/* Footer: Weekplanning shortcut + user tile */}
        <div className="shrink-0 border-t border-border p-3 space-y-1">
          <Link
            href="/instructor/week"
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
              pathname.startsWith("/instructor/week")
                ? "bg-primary-soft font-medium text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <CalendarRange className="h-4 w-4 shrink-0" aria-hidden />
            Weekplanning
          </Link>

          {/* User tile */}
          <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
            <Avatar name={userLabel} className="h-8 w-8 shrink-0 text-xs" />
            <span
              className="min-w-0 flex-1 truncate text-xs font-medium text-foreground"
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

      {/* ── Mobile: sticky top bar + bottom nav strip ────────────────────── */}
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
      </header>

      {/* Mobile bottom nav — same Framer Motion active-pill style as student BottomNav */}
      <nav
        aria-label="Instructeur navigatie"
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-card/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="mx-auto grid max-w-2xl grid-cols-5">
          {MOBILE_NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item);
            return (
              <li key={item.href} className="relative">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex flex-col items-center gap-0.5 px-2 py-3 text-[11px] font-medium transition-colors active:scale-95",
                    active
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId="instructor-nav-active"
                      className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  ) : null}
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
                      active ? "bg-primary-soft" : "bg-transparent",
                    )}
                  >
                    <Icon
                      style={{ height: "1.125rem", width: "1.125rem" }}
                      aria-hidden
                    />
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
