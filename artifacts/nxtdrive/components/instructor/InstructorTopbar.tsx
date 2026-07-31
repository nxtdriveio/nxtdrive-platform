"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Bell,
  CalendarPlus,
  ChevronDown,
  MessageCircle,
  Moon,
  Settings,
  User,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { InstructorQuickSearch } from "@/components/instructor/InstructorQuickSearch";
import { SecureInstructorLogoutForm } from "@/components/instructor/SecureLogoutForm";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Theme } from "@/lib/theme";
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
  unreadMessages,
}: {
  notifications?: ReactNode;
  theme: Theme;
  userLabel: string;
  unreadMessages: number;
}) {
  return (
    <header className="sticky top-0 z-20 hidden h-16 shrink-0 items-center gap-3 border-b border-brand-border/80 bg-white/86 px-4 backdrop-blur-xl xl:flex xl:px-6">
      <div className="max-w-3xl flex-1">
        <InstructorQuickSearch />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Link
          href="/instructeur/berichten"
          aria-label={
            unreadMessages
              ? `Berichten, ${unreadMessages} ongelezen`
              : "Berichten"
          }
          className="relative grid h-11 w-11 place-items-center rounded-full border border-brand-border bg-white text-foreground shadow-sm transition hover:bg-brand-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          {unreadMessages ? (
            <span className="absolute right-0 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-brand-primary px-1 text-[10px] font-black text-white">
              {unreadMessages > 99 ? "99+" : unreadMessages}
            </span>
          ) : null}
        </Link>
        <div className="relative">
          {notifications ?? (
            <span className="grid h-10 w-10 place-items-center rounded-full border border-brand-border bg-white text-foreground shadow-sm">
              <Bell className="h-4 w-4" aria-hidden />
            </span>
          )}
        </div>
        <ThemeToggle
          current={theme}
          className="h-10 w-10 rounded-full border-brand-border bg-white"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-11 items-center gap-3 rounded-full border border-brand-border bg-white py-1 pl-1 pr-3 shadow-sm transition hover:bg-brand-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ring"
            >
              <Avatar name={userLabel} className="h-9 w-9 text-xs" />
              <span className="hidden min-w-0 text-left xl:block">
                <span className="block truncate text-sm font-black text-foreground">
                  {userLabel}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  Instructeur
                </span>
              </span>
              <ChevronDown
                className="h-4 w-4 text-muted-foreground"
                aria-hidden
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem asChild>
              <Link
                href="/instructeur/agenda/nieuw"
                className="flex items-center gap-2"
              >
                <CalendarPlus aria-hidden />
                Nieuwe afspraak
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href="/instructeur/beschikbaarheid"
                className="flex items-center gap-2"
              >
                <Moon aria-hidden />
                Beschikbaarheid aanpassen
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href="/instructeur/profiel"
                className="flex items-center gap-2"
              >
                <User aria-hidden />
                Profiel
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href="/instructeur/instellingen"
                className="flex items-center gap-2"
              >
                <Settings aria-hidden />
                Instellingen
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <SecureInstructorLogoutForm icon={false} />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
