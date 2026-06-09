"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock,
  CalendarPlus,
  ChevronDown,
  ClipboardList,
  FileText,
  ListTodo,
  MessageCircle,
  Settings,
  Users,
} from "lucide-react";
import { RouteInfoBubble } from "@/components/navigation/RouteInfoBubble";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Theme } from "@/lib/theme";
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
  {
    href: "/instructor/beschikbaarheid",
    label: "Beschikbaarheid",
    icon: CalendarClock,
    match: "prefix",
  },
  {
    href: "/instructor/berichten",
    label: "Berichten",
    icon: MessageCircle,
    match: "prefix",
  },
  { href: "/instructor/taken", label: "Taken", icon: ListTodo, match: "prefix" },
];

const ACTIES_INSTRUCTOR = [
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

export function InstructorTopbar({
  notifications,
  theme,
}: {
  notifications?: ReactNode;
  theme: Theme;
}) {
  const pathname = usePathname() ?? "";

  return (
    <header className="hidden h-16 shrink-0 items-center gap-4 border-b border-border/80 bg-card px-5 xl:flex">
      <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary-soft text-primary shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-2 pl-4">
        <RouteInfoBubble scope="instructor" />
        {notifications}
        <ThemeToggle current={theme} className="rounded-xl border-border/80" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted data-[state=open]:text-foreground"
            >
              Acties
              <ChevronDown
                className="h-4 w-4 shrink-0 transition-transform duration-150 [[data-state=open]_&]:rotate-180"
                aria-hidden
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {ACTIES_INSTRUCTOR.map((action) => {
              const Icon = action.icon;
              return (
                <DropdownMenuItem key={action.href} asChild>
                  <Link href={action.href} className="flex items-center gap-2.5">
                    <Icon aria-hidden />
                    {action.label}
                  </Link>
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            {ACTIES_BACKOFFICE.map((action) => {
              const Icon = action.icon;
              return (
                <DropdownMenuItem key={action.href} asChild>
                  <Link href={action.href} className="flex items-center gap-2.5">
                    <Icon aria-hidden />
                    {action.label}
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
