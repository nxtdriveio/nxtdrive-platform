"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  CalendarClock,
  ListTodo,
  MessageCircle,
  Bell,
  ChevronDown,
  Users,
  CalendarPlus,
  FileText,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof CalendarDays;
  match: "exact" | "prefix";
};

const NAV: NavItem[] = [
  { href: "/instructor/beschikbaarheid", label: "Beschikbaarheid", icon: CalendarClock, match: "prefix" },
  { href: "/instructor/berichten", label: "Berichten", icon: MessageCircle, match: "prefix" },
  { href: "/instructor/meldingen", label: "Meldingen", icon: Bell, match: "prefix" },
];

const ACTIES = [
  { href: "/instructor/taken", icon: ListTodo, label: "Mijn taken" },
  { href: "/instructor/week", icon: ClipboardList, label: "Weekplanning" },
  { href: "/backoffice/agenda/afspraken/nieuw", icon: CalendarPlus, label: "Afspraak inplannen" },
  { href: "/backoffice/leerlingen", icon: Users, label: "Leerlingenlijst" },
  { href: "/backoffice/intake", icon: FileText, label: "Intakeformulier" },
  { href: "/backoffice/instellingen", icon: Settings, label: "Instellingen" },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.match === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Horizontal utility bar rendered above main content on desktop only.
 * Contains secondary nav links (beschikbaarheid / berichten / meldingen),
 * a "Taken" shortcut, the notification bell, and a compact "Acties" dropdown
 * for quick-access cross-module links.
 * The Vandaag and Weekplanning destinations live in the sidebar (agenda-rail),
 * so they are omitted here.
 */
export function InstructorTopbar({
  notifications,
}: {
  notifications?: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const [actiesOpen, setActiesOpen] = useState(false);
  const actiesRef = useRef<HTMLDivElement>(null);

  /* Close the dropdown when clicking outside */
  useEffect(() => {
    if (!actiesOpen) return;
    function handleClick(e: MouseEvent) {
      if (actiesRef.current && !actiesRef.current.contains(e.target as Node)) {
        setActiesOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [actiesOpen]);

  /* Close the dropdown on navigation */
  useEffect(() => {
    setActiesOpen(false);
  }, [pathname]);

  return (
    <header className="hidden h-12 shrink-0 items-center gap-1 border-b border-border bg-card/60 px-3 backdrop-blur md:flex">
      {/* Secondary nav links */}
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

      {/* Right cluster: Taken shortcut + notifications + Acties dropdown */}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <Link
          href="/instructor/taken"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
            pathname.startsWith("/instructor/taken")
              ? "bg-primary-soft font-medium text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <ListTodo className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Taken
        </Link>

        {notifications}

        {/* Acties dropdown */}
        <div ref={actiesRef} className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={actiesOpen}
            onClick={() => setActiesOpen((o) => !o)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm transition-colors",
              actiesOpen
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            Acties
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 transition-transform",
                actiesOpen && "rotate-180",
              )}
              aria-hidden
            />
          </button>

          {actiesOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg"
            >
              {ACTIES.map((a) => {
                const Icon = a.icon;
                return (
                  <Link
                    key={a.href}
                    href={a.href}
                    role="menuitem"
                    onClick={() => setActiesOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    {a.label}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
