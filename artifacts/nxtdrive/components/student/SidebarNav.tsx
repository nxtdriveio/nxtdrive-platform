"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { STUDENT_NAV_ITEMS, isNavItemActive } from "./nav-items";

/**
 * Desktop dashboard sidebar. Hidden below `lg`, where the bottom nav is used
 * instead. Pure navigation — branding + notifications live in the top bar.
 */
export function StudentSidebarNav() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 border-r border-border bg-card/40 px-3 py-6 lg:block">
      <nav aria-label="Hoofdnavigatie">
        <ul className="space-y-1">
          {STUDENT_NAV_ITEMS.map((it) => {
            const active = isNavItemActive(it, pathname);
            const Icon = it.icon;
            return (
              <li key={it.href}>
                <Link
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary-soft/60 text-primary"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden />
                  {it.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
