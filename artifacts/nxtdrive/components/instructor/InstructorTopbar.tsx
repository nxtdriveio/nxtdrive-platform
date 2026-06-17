"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Bell,
  CalendarPlus,
  ChevronDown,
  MessageCircle,
  Moon,
  Search,
  Settings,
  User,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
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

export function InstructorTopbar({
  notifications,
  theme,
  userLabel,
}: {
  notifications?: ReactNode;
  theme: Theme;
  userLabel: string;
}) {
  return (
    <header className="sticky top-0 z-20 hidden h-16 shrink-0 items-center gap-3 border-b border-brand-border/80 bg-white/86 px-4 backdrop-blur-xl lg:flex xl:px-6">
      <div className="relative max-w-3xl flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          className="h-10 w-full rounded-[1rem] border border-brand-border bg-white pl-10 pr-14 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/15"
          placeholder="Zoek leerling, afspraak, voertuig, bericht..."
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-brand-border bg-brand-muted px-2 py-0.5 text-[10px] font-black text-muted-foreground">
          CTRL K
        </span>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Link
          href="/instructor/messages"
          aria-label="Berichten"
          className="relative grid h-10 w-10 place-items-center rounded-full border border-brand-border bg-white text-foreground shadow-sm transition hover:bg-brand-muted"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-primary px-1 text-[10px] font-black text-white">
            2
          </span>
        </Link>
        <div className="relative">
          {notifications ?? (
            <span className="grid h-10 w-10 place-items-center rounded-full border border-brand-border bg-white text-foreground shadow-sm">
              <Bell className="h-4 w-4" aria-hidden />
            </span>
          )}
        </div>
        <ThemeToggle current={theme} className="h-10 w-10 rounded-full border-brand-border bg-white" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-11 items-center gap-3 rounded-full border border-brand-border bg-white py-1 pl-1 pr-3 shadow-sm transition hover:bg-brand-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
            >
              <Avatar name={userLabel} className="h-9 w-9 text-xs" />
              <span className="hidden min-w-0 text-left xl:block">
                <span className="block truncate text-sm font-black text-foreground">{userLabel}</span>
                <span className="block truncate text-xs text-muted-foreground">Instructeur</span>
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem asChild>
              <Link href="/instructor/agenda/new" className="flex items-center gap-2">
                <CalendarPlus aria-hidden />
                Nieuwe afspraak
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/instructor/availability" className="flex items-center gap-2">
                <Moon aria-hidden />
                Beschikbaarheid aanpassen
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/instructor/profile" className="flex items-center gap-2">
                <User aria-hidden />
                Profiel
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/instructor/settings" className="flex items-center gap-2">
                <Settings aria-hidden />
                Instellingen
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <form method="post" action="/auth/logout" className="w-full">
                <button
                  type="submit"
                  className={cn("flex w-full items-center gap-2 text-left text-danger")}
                >
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
