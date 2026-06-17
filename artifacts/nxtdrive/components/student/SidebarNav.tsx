"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { STUDENT_SIDEBAR_NAV_ITEMS, isNavItemActive } from "./nav-items";

export function StudentSidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-24 hidden h-[calc(100vh-6rem)] w-[17rem] shrink-0 px-6 py-6 2xl:block">
      <div className="h-full rounded-[var(--radius-panel)] border border-brand-border/70 bg-brand-sidebar-background p-3 shadow-brand-card backdrop-blur-xl">
        <nav aria-label="Hoofdnavigatie">
          <ul className="space-y-1.5">
            {STUDENT_SIDEBAR_NAV_ITEMS.map((item) => {
              const active = isNavItemActive(item, pathname);
              const Icon = item.icon;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-[1.15rem] px-3 py-3 text-sm font-medium transition-colors",
                      active
                        ? "bg-brand-sidebar-active text-brand-sidebar-active-foreground shadow-sm"
                        : "text-brand-sidebar-foreground hover:bg-brand-muted/70 hover:text-brand-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
