"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  CalendarDays,
  CalendarRange,
  ClipboardList,
  ListTodo,
  LogOut,
  MessageCircle,
  MoreHorizontal,
} from "lucide-react";
import { RouteInfoBubble } from "@/components/navigation/RouteInfoBubble";
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
  extraPrefixes?: string[];
};

const MOBILE_NAV: NavItem[] = [
  { href: "/instructor", label: "Vandaag", icon: CalendarDays, match: "exact" },
  { href: "/instructor/week", label: "Planning", icon: ClipboardList, match: "prefix" },
  { href: "/instructor/taken", label: "Taken", icon: ListTodo, match: "prefix" },
  { href: "/instructor/berichten", label: "Berichten", icon: MessageCircle, match: "prefix" },
  {
    href: "/instructor/meer",
    label: "Meer",
    icon: MoreHorizontal,
    match: "prefix",
    extraPrefixes: [
      "/instructor/beschikbaarheid",
      "/instructor/meldingen",
      "/instructor/leerlingen",
      "/instructor/instellingen",
    ],
  },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.match === "exact") {
    const direct = pathname === item.href;
    return (
      direct ||
      (item.extraPrefixes?.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ?? false)
    );
  }

  const direct = pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    direct ||
    (item.extraPrefixes?.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ?? false)
  );
}

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
      <aside className="sticky top-0 hidden h-screen w-[21.5rem] shrink-0 border-r border-border/80 bg-card xl:flex xl:flex-col">
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border/80 px-5">
          <NxtdriveLogo className="text-base font-semibold" logoUrl={logoUrl} brandName={tenantName} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
          <div className="mb-4 rounded-[1.45rem] border border-border/80 bg-background px-3 py-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Vandaag
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-foreground">
                  Dagritme en lesfocus
                </p>
              </div>
              <Link
                href="/instructor/week"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary transition hover:bg-primary-soft/80"
              >
                <CalendarRange className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden rounded-[1.45rem] border border-border/80 bg-background shadow-sm">
            <div className="h-full overflow-auto px-3 py-3">
              <InstructorDayList
                lessons={todayLessons}
                studentNames={studentNames}
                date={todayDate}
                trialLessons={trialLessons}
              />
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-border/80 px-4 py-4">
          <div className="flex items-center gap-3 rounded-[1.2rem] border border-border/80 bg-background px-3 py-3">
            <Avatar name={userLabel} className="h-10 w-10 shrink-0 text-xs" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{userLabel}</p>
              <p className="text-xs text-muted-foreground">{tenantName}</p>
            </div>
            <form method="post" action="/auth/logout">
              <button
                type="submit"
                aria-label="Uitloggen"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <LogOut className="h-4 w-4" aria-hidden />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <header
        className="sticky top-0 z-30 border-b border-border/80 bg-card/95 backdrop-blur xl:hidden"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <NxtdriveLogo className="text-sm font-semibold" logoUrl={logoUrl} brandName={tenantName} />
          <div className="flex items-center gap-1">
            <RouteInfoBubble scope="instructor" />
            {notifications}
            <form method="post" action="/auth/logout">
              <button
                type="submit"
                aria-label="Uitloggen"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <LogOut className="h-4 w-4" aria-hidden />
              </button>
            </form>
          </div>
        </div>
      </header>

      <nav
        aria-label="Instructeur navigatie"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 xl:hidden"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.7rem)" }}
      >
        <ul className="pointer-events-auto mx-auto grid max-w-3xl grid-cols-5 rounded-[1.8rem] border border-border/70 bg-card/78 p-1.5 shadow-2xl shadow-black/25 backdrop-blur-2xl">
          {MOBILE_NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item);

            return (
              <li key={item.href} className="relative min-w-0">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex flex-col items-center gap-1 rounded-[1.3rem] px-2 py-2 text-[10px] font-semibold transition-colors active:scale-95",
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId="instructor-nav-active"
                      className="absolute inset-0 rounded-[1.3rem] bg-primary-soft"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  ) : null}
                  <span
                    className={cn(
                      "relative z-10 flex h-7 w-7 items-center justify-center rounded-full transition-colors",
                      active ? "bg-primary/15" : "bg-transparent",
                    )}
                  >
                    <Icon className="h-[1.05rem] w-[1.05rem]" aria-hidden />
                  </span>
                  <span className="relative z-10 truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
