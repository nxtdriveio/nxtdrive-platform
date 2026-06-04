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
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof CalendarDays;
  match: "exact" | "prefix";
};

const NAV: NavItem[] = [
  { href: "/instructor", label: "Vandaag", icon: CalendarDays, match: "exact" },
  { href: "/instructor/week", label: "Planning", icon: ClipboardList, match: "prefix" },
  {
    href: "/instructor/beschikbaarheid",
    label: "Beschikbaarheid",
    icon: CalendarClock,
    match: "prefix",
  },
  { href: "/instructor/berichten", label: "Berichten", icon: MessageCircle, match: "prefix" },
  { href: "/instructor/meldingen", label: "Meldingen", icon: Bell, match: "prefix" },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.match === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Horizontal utility topbar rendered above the main content area on desktop.
 * Hosts the primary navigation links (moved from the sidebar rail), plus the
 * notification bell and a "Taken" shortcut. Hidden on mobile — the Sidebar's
 * mobile header handles that surface.
 */
export function InstructorTopbar({
  notifications,
}: {
  notifications?: ReactNode;
}) {
  const pathname = usePathname() ?? "";

  return (
    <header className="hidden h-12 shrink-0 items-center gap-1 border-b border-border bg-card/60 px-3 backdrop-blur md:flex">
      <nav className="flex flex-1 items-center gap-0.5 overflow-x-auto">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                active
                  ? "bg-primary-soft font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Link
          href="/backoffice/taken"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
            pathname.startsWith("/backoffice/taken")
              ? "bg-primary-soft font-medium text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <ListTodo className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Taken
        </Link>
        {notifications}
      </div>
    </header>
  );
}
