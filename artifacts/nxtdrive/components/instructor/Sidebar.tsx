"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  CalendarDays,
  ClipboardList,
  Home,
  ListTodo,
  MessageCircle,
  MoreHorizontal,
} from "lucide-react";
import { RouteInfoBubble } from "@/components/navigation/RouteInfoBubble";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { MobileSearch } from "@/components/backoffice/global-search";
import { InstructorDayList } from "@/components/instructor/DayList";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { Lesson } from "@/lib/lessons/types";
import type { AgendaTrialLesson } from "@/lib/trial-lessons/agenda";
import type { AgendaAppointmentView } from "@/lib/agenda/appointments";

type NavItem = {
  href: string;
  label: string;
  icon: typeof CalendarDays;
  match: "exact" | "prefix";
  extraPrefixes?: string[];
};

const ICON_BUTTON_CLASS =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const MOBILE_NAV: NavItem[] = [
  { href: "/instructor", label: "Vandaag", icon: CalendarDays, match: "exact" },
  { href: "/instructor/week", label: "Agenda", icon: ClipboardList, match: "prefix" },
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
  appointments = [],
  visibleStartHour,
  visibleEndHour,
  theme,
}: {
  tenantName: string;
  userLabel: string;
  logoUrl?: string | null;
  notifications?: ReactNode;
  todayLessons: Lesson[];
  studentNames: Map<string, string>;
  todayDate: Date;
  trialLessons?: AgendaTrialLesson[];
  appointments?: AgendaAppointmentView[];
  visibleStartHour: number;
  visibleEndHour: number;
  theme: Theme;
}) {
  const pathname = usePathname() ?? "";

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[21.5rem] shrink-0 bg-card xl:flex xl:flex-col">
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border/80 px-5">
          <Link
            href="/instructor"
            aria-label="Naar startscherm"
            className={ICON_BUTTON_CLASS}
          >
            <Home className="h-4 w-4" aria-hidden />
          </Link>
          <NxtdriveLogo className="text-base font-semibold" logoUrl={logoUrl} brandName={tenantName} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
          <div className="mb-4 rounded-[1.45rem] border border-border/80 bg-background px-3 py-3 shadow-sm">
            <div className="flex items-center gap-3">
              <Avatar name={userLabel} className="h-12 w-12 shrink-0 text-sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{userLabel}</p>
                <p className="truncate text-xs text-muted-foreground">{tenantName}</p>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden rounded-[1.45rem] border border-border/80 bg-background shadow-sm">
            <div className="h-full overflow-auto px-3 py-3">
              <InstructorDayList
                lessons={todayLessons}
                studentNames={studentNames}
                date={todayDate}
                trialLessons={trialLessons}
                appointments={appointments}
                visibleStartHour={visibleStartHour}
                visibleEndHour={visibleEndHour}
              />
            </div>
          </div>
        </div>

        <div className="h-4 shrink-0 border-t border-border/80" />
      </aside>

      <header
        className="sticky top-0 z-30 border-b border-border/80 bg-card/95 backdrop-blur xl:hidden"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href="/instructor"
              aria-label="Naar startscherm"
              className={ICON_BUTTON_CLASS}
            >
              <Home className="h-4 w-4" aria-hidden />
            </Link>
            <NxtdriveLogo className="min-w-0 text-sm font-semibold" logoUrl={logoUrl} brandName={tenantName} />
          </div>
          <div className="flex items-center gap-1">
            <MobileSearch />
            <RouteInfoBubble scope="instructor" className={ICON_BUTTON_CLASS} />
            {notifications}
            <ThemeToggle
              current={theme}
              className="h-10 w-10 rounded-xl border-border/80"
            />
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
