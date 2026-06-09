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
  LogOut,
  MessageCircle,
  Settings,
  Users,
} from "lucide-react";
import { InstructorQuickSearch } from "@/components/instructor/InstructorQuickSearch";
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

const BUTTON_CLASS =
  "inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-border/80 bg-card px-3 text-sm font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground";

const ICON_BUTTON_CLASS =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground";

const ACTIES_INSTRUCTOR = [
  { href: "/instructor/week", icon: ClipboardList, label: "Agenda" },
  { href: "/instructor/beschikbaarheid", icon: CalendarClock, label: "Beschikbaarheid" },
  { href: "/instructor/berichten", icon: MessageCircle, label: "Berichten" },
  { href: "/instructor/leerlingen", icon: Users, label: "Leerlingenlijst" },
  { href: "/instructor/taken", icon: ListTodo, label: "Taken" },
];

const ACTIES_BACKOFFICE = [
  { href: "/instructor/afspraak/nieuw", icon: CalendarPlus, label: "Afspraak inplannen" },
  { href: "/instructor/intake", icon: FileText, label: "Intakeformulier" },
  { href: "/instructor/instellingen", icon: Settings, label: "Instellingen" },
];

export function InstructorTopbar({
  notifications,
  theme,
}: {
  notifications?: ReactNode;
  theme: Theme;
}) {
  const pathname = usePathname() ?? "";
  const messagesActive =
    pathname === "/instructor/berichten" || pathname.startsWith("/instructor/berichten/");

  return (
    <header className="hidden h-16 shrink-0 items-center gap-4 border-b border-border/80 bg-card px-5 xl:flex">
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-2xl">
          <InstructorQuickSearch />
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <RouteInfoBubble scope="instructor" className={ICON_BUTTON_CLASS} />
        <Link
          href="/instructor/berichten"
          aria-current={messagesActive ? "page" : undefined}
          className={cn(
            ICON_BUTTON_CLASS,
            messagesActive ? "border-primary/20 bg-primary-soft text-primary" : "",
          )}
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
        </Link>
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
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <form method="post" action="/auth/logout" className="w-full">
                <button
                  type="submit"
                  className="flex w-full items-center gap-2.5 text-left"
                >
                  <LogOut aria-hidden />
                  Uitloggen
                </button>
              </form>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
