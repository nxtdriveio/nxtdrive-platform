"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  Clock3,
  Home,
  ListTodo,
  MapPinned,
  MessageCircle,
  MoreHorizontal,
  Settings,
  Users,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import {
  instructorRoutes,
  visibleInstructorNavigation,
  type InstructorRouteDefinition,
  type InstructorRouteId,
} from "@/lib/instructor/routes";
import type { InstructorLiveCounts } from "@/lib/instructor/counts-server";
import { cn } from "@/lib/utils";

type IconComponent = typeof Home;

type NavItem = {
  route: InstructorRouteDefinition;
  icon: IconComponent;
  badge?: number;
};

const NAV_ICONS: Partial<Record<InstructorRouteId, IconComponent>> = {
  home: Home,
  agenda: CalendarDays,
  dayRoute: MapPinned,
  students: Users,
  messages: MessageCircle,
  tasks: ListTodo,
  availability: Clock3,
  theory: BookOpen,
  settings: Settings,
  more: MoreHorizontal,
};

const MOBILE_ROUTE_IDS = new Set<InstructorRouteId>([
  "home",
  "agenda",
  "students",
  "messages",
]);

function isActive(pathname: string, route: InstructorRouteDefinition) {
  if (route.id === "home") return pathname === route.canonicalPath;
  if (route.id === "agenda" && pathname.startsWith("/instructeur/lessen/")) {
    return true;
  }
  return pathname.startsWith(route.canonicalPath);
}

function NavLink({
  item,
  mobile = false,
}: {
  item: NavItem;
  mobile?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const active = isActive(pathname, item.route);
  const Icon = item.icon;

  if (mobile) {
    return (
      <Link
        href={item.route.canonicalPath}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-[1.1rem] px-1.5 py-1.5 text-[10px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring",
          active
            ? "bg-brand-accent text-brand-primary"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
        <span className="truncate">{item.route.navLabel}</span>
        {item.badge ? (
          <span
            aria-label={`${item.badge} ongelezen`}
            className="absolute right-1 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-brand-primary px-1 text-[9px] font-black text-white"
          >
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <Link
      href={item.route.canonicalPath}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex min-h-11 items-center gap-3 rounded-[1.05rem] px-3 py-2.5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
        active
          ? "bg-brand-sidebar-active text-brand-sidebar-active-foreground"
          : "text-brand-sidebar-foreground/78 hover:bg-white/8 hover:text-white",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{item.route.navLabel}</span>
      {item.badge ? <Badge variant="primary">{item.badge}</Badge> : null}
    </Link>
  );
}

function navItems(liveCounts: InstructorLiveCounts): NavItem[] {
  return visibleInstructorNavigation({ roles: ["instructor"] }).map(
    (route) => ({
      route,
      icon: NAV_ICONS[route.id] ?? Home,
      badge:
        route.id === "messages"
          ? liveCounts.unreadMessages
          : route.id === "tasks"
            ? liveCounts.openTasks
            : undefined,
    }),
  );
}

export function InstructorSidebar({
  tenantName,
  userLabel,
  logoUrl,
  liveCounts,
  notifications,
}: {
  tenantName: string;
  userLabel: string;
  logoUrl?: string | null;
  liveCounts: InstructorLiveCounts;
  notifications?: ReactNode;
}) {
  const items = navItems(liveCounts);
  const moreRoute = instructorRoutes.find((route) => route.id === "more")!;
  const mobileItems = [
    ...items.filter((item) => MOBILE_ROUTE_IDS.has(item.route.id)),
    { route: moreRoute, icon: MoreHorizontal },
  ];

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[17.5rem] shrink-0 overflow-hidden border-r border-white/10 bg-brand-sidebar-background text-brand-sidebar-foreground lg:flex lg:flex-col lg:w-[18.5rem]">
        <div className="relative flex min-h-0 flex-1 flex-col p-4">
          <Link
            href="/instructeur"
            className="inline-flex min-h-11 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white [&_img]:rounded-md [&_img]:bg-white [&_img]:p-1"
          >
            <NxtdriveLogo
              className="text-xl font-semibold text-white"
              inverse
              logoUrl={logoUrl}
              brandName={tenantName}
            />
          </Link>

          <nav
            className="relative mt-7 min-h-0 flex-1 overflow-auto"
            aria-label="Instructeurnavigatie"
          >
            <ul className="space-y-1.5">
              {items.map((item) => (
                <li key={item.route.id}>
                  <NavLink item={item} />
                </li>
              ))}
            </ul>
          </nav>

          <div className="relative mt-4 flex shrink-0 items-center gap-2">
            <Link
              href="/instructeur/meer"
              className="flex min-w-0 flex-1 items-center gap-3 rounded-[1.25rem] border border-white/10 bg-white/[0.055] p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Avatar name={userLabel} className="h-12 w-12 text-sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">
                  {userLabel}
                </p>
                <p className="truncate text-xs text-white/60">
                  Account en instellingen
                </p>
              </div>
            </Link>
            {notifications ? (
              <div className="shrink-0 rounded-xl bg-white xl:hidden">
                {notifications}
              </div>
            ) : null}
          </div>
        </div>
      </aside>

      <header
        className="sticky top-0 z-30 border-b border-brand-border/80 bg-white/88 backdrop-blur-xl lg:hidden"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex min-h-14 items-center justify-between gap-3 px-4">
          <Link
            href="/instructeur"
            className="flex min-h-11 min-w-0 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
          >
            <NxtdriveLogo
              className="text-sm font-semibold text-foreground"
              logoUrl={logoUrl}
              brandName={tenantName}
            />
          </Link>
          <div className="flex items-center gap-2">
            {notifications}
            <Link
              href="/instructeur/berichten"
              aria-label={
                liveCounts.unreadMessages
                  ? `Berichten, ${liveCounts.unreadMessages} ongelezen`
                  : "Berichten"
              }
              className="relative grid h-11 w-11 place-items-center rounded-full border border-brand-border bg-white text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              {liveCounts.unreadMessages ? (
                <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-primary" />
              ) : null}
            </Link>
            <Link
              href="/instructeur/meer"
              aria-label="Account en instellingen"
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
            >
              <Avatar name={userLabel} className="h-11 w-11 text-xs" />
            </Link>
          </div>
        </div>
      </header>

      <nav
        aria-label="Mobiele instructeurnavigatie"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 lg:hidden"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.55rem)" }}
      >
        <ul className="pointer-events-auto mx-auto grid max-w-md grid-cols-5 rounded-[1.45rem] border border-brand-border/80 bg-white/92 p-1.5 shadow-brand-card backdrop-blur-xl">
          {mobileItems.map((item) => (
            <li key={item.route.id} className="min-w-0">
              <NavLink item={item} mobile />
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
