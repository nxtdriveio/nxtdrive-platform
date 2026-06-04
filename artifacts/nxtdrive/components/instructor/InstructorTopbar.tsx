"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock,
  MessageCircle,
  Bell,
  ChevronDown,
  Users,
  CalendarPlus,
  FileText,
  Settings,
  ListTodo,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavItem = {
  href: string;
  label: string;
  icon: typeof CalendarClock;
  match: "exact" | "prefix";
};

const NAV: NavItem[] = [
  { href: "/instructor/beschikbaarheid", label: "Beschikbaarheid", icon: CalendarClock, match: "prefix" },
  { href: "/instructor/berichten", label: "Berichten", icon: MessageCircle, match: "prefix" },
  { href: "/instructor/meldingen", label: "Meldingen", icon: Bell, match: "prefix" },
];

const ACTIES_INSTRUCTOR = [
  { href: "/instructor/taken", icon: ListTodo, label: "Mijn taken" },
  { href: "/instructor/week", icon: ClipboardList, label: "Weekplanning" },
  { href: "/instructor/leerlingen", icon: Users, label: "Leerlingenlijst" },
];

const ACTIES_BACKOFFICE = [
  { href: "/backoffice/agenda/afspraken/nieuw", icon: CalendarPlus, label: "Afspraak inplannen" },
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
 * a "Taken" shortcut, the notification bell, and an "Acties" shadcn
 * DropdownMenu for quick-access cross-module links.
 */
export function InstructorTopbar({
  notifications,
}: {
  notifications?: ReactNode;
}) {
  const pathname = usePathname() ?? "";

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

        {/* Acties — shadcn DropdownMenu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "text-muted-foreground hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground",
              )}
            >
              Acties
              <ChevronDown
                className="h-3.5 w-3.5 shrink-0 transition-transform duration-150 [[data-state=open]_&]:rotate-180"
                aria-hidden
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {ACTIES_INSTRUCTOR.map((a) => {
              const Icon = a.icon;
              return (
                <DropdownMenuItem key={a.href} asChild>
                  <Link href={a.href} className="flex items-center gap-2.5">
                    <Icon aria-hidden />
                    {a.label}
                  </Link>
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            {ACTIES_BACKOFFICE.map((a) => {
              const Icon = a.icon;
              return (
                <DropdownMenuItem key={a.href} asChild>
                  <Link href={a.href} className="flex items-center gap-2.5">
                    <Icon aria-hidden />
                    {a.label}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
