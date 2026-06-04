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
} from "lucide-react";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof CalendarDays;
  /** Active when the pathname starts with this prefix (vs. exact match). */
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
  { href: "/backoffice/taken", label: "Taken", icon: ListTodo, match: "prefix" },
  {
    href: "/instructor/berichten",
    label: "Berichten",
    icon: MessageCircle,
    match: "prefix",
  },
  { href: "/instructor/meldingen", label: "Meldingen", icon: Bell, match: "prefix" },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.match === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Compact left sidebar nav for the instructor PWA shell (PWA canon §"Instructeur
 * Design Canon" — tablet split layout). Renders a vertical rail on md+ and a
 * sticky top bar with a horizontal nav strip on smaller screens. Preserves every
 * destination from the previous top bar plus the notification bell.
 */
export function InstructorSidebar({
  tenantName,
  userLabel,
  logoUrl,
  notifications,
}: {
  tenantName: string;
  userLabel: string;
  logoUrl?: string | null;
  notifications?: ReactNode;
}) {
  const pathname = usePathname() ?? "";

  return (
    <>
      {/* Desktop / tablet: vertical rail */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-border px-4">
          <NxtdriveLogo className="text-base" logoUrl={logoUrl} brandName={tenantName} />
        </div>
        <div className="px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground">
          {tenantName}
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-primary-soft font-medium text-primary"
                    : "text-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-muted-foreground" title={userLabel}>
              {userLabel}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {notifications}
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
        </div>
      </aside>

      {/* Mobile: top bar + horizontal nav strip */}
      {/* `pt-[env(safe-area-inset-top)]` clears the iOS status bar / notch in
          standalone mode; env() resolves to 0 in a normal browser tab. */}
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
          {NAV.map((item) => {
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
