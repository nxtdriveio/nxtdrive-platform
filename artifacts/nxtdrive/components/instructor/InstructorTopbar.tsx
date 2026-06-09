"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  CalendarPlus,
  ChevronDown,
  ClipboardList,
  FileText,
  Home,
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

const BUTTON_CLASS =
  "inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-border/80 bg-card px-3 text-sm font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground";

const ICON_BUTTON_CLASS =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground";

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
  {
    href: "/instructor/leerlingen",
    label: "Leerlingenlijst",
    icon: Users,
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
  const router = useRouter();
  const onDashboard = pathname === "/instructor";

  return (
    <header className="hidden h-16 shrink-0 items-center gap-4 border-b border-border/80 bg-card px-5 xl:flex">
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          aria-label={onDashboard ? "Naar startscherm" : "Ga terug"}
          onClick={() => {
            if (onDashboard) {
              router.push("/instructor");
              return;
            }
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.back();
              return;
            }
            router.push("/instructor");
          }}
          className={ICON_BUTTON_CLASS}
        >
          {onDashboard ? (
            <Home className="h-4 w-4" aria-hidden />
          ) : (
            <ArrowLeft className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>

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
                BUTTON_CLASS,
                active
                  ? "border-primary/20 bg-primary-soft text-primary"
                  : "",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-2 pl-4">
        <RouteInfoBubble scope="instructor" className={ICON_BUTTON_CLASS} />
        {notifications}
        <ThemeToggle
          current={theme}
          className="h-10 w-10 rounded-xl border-border/80"
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                BUTTON_CLASS,
                "font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted data-[state=open]:text-foreground",
              )}
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
