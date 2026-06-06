"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { STUDENT_NAV_ITEMS, isNavItemActive } from "./nav-items";

/**
 * Mobile-first bottom navigation. Hidden on desktop (sidebar takes over).
 * Fixed to the viewport so the PWA always has both top chrome and bottom nav.
 */
export function StudentBottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Hoofdnavigatie"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/85 px-2.5 pt-1.5 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.25rem)" }}
    >
      <ul className="mx-auto grid max-w-md grid-cols-5 rounded-2xl border border-border/70 bg-card/80 p-1 shadow-2xl shadow-primary/10">
        {STUDENT_NAV_ITEMS.map((it) => {
          const active = isNavItemActive(it, pathname);
          const Icon = it.icon;
          return (
            <li key={it.href} className="relative min-w-0">
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-w-0 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition active:scale-95",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="student-nav-active"
                    className="absolute inset-0 rounded-xl bg-primary-soft/70"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <span className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full">
                  <Icon
                    className={cn(
                      "transition-transform",
                      active && "scale-110",
                    )}
                    style={{ height: "1rem", width: "1rem" }}
                    aria-hidden
                  />
                </span>
                <span className="relative z-10 max-w-full truncate">{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
