"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { STUDENT_NAV_ITEMS, isNavItemActive } from "./nav-items";

export function StudentSidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-20 hidden h-[calc(100vh-5rem)] w-64 shrink-0 px-4 py-6 2xl:block">
      <div className="rounded-[1.6rem] border border-border/70 bg-card/72 p-3 shadow-xl shadow-black/5 backdrop-blur-xl">
        <nav aria-label="Hoofdnavigatie">
          <ul className="space-y-1.5">
            {STUDENT_NAV_ITEMS.map((item) => {
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
                        ? "bg-primary-soft/90 text-primary shadow-sm"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
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
