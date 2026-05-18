"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CalendarDays, Wallet, User } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/student", label: "Vandaag", icon: Home, exact: true },
  { href: "/student/lessons", label: "Lessen", icon: CalendarDays },
  { href: "/student/credits", label: "Tegoed", icon: Wallet },
  { href: "/student/profile", label: "Profiel", icon: User },
];

export function StudentBottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Hoofdnavigatie"
      className="sticky bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur"
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-4">
        {items.map((it) => {
          const active = it.exact
            ? pathname === it.href
            : pathname === it.href || pathname.startsWith(it.href + "/");
          const Icon = it.icon;
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-2 py-2.5 text-[11px] font-medium transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
