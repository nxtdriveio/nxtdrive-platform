"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { STUDENT_NAV_ITEMS, isNavItemActive } from "./nav-items";

/**
 * Mobile-first bottom navigation. Hidden on desktop (sidebar takes over).
 * Premium app feel: a shared Framer Motion `layoutId` pill slides under the
 * active tab, active icons are wrapped in a background-circle for a filled
 * treatment. All touch targets are ≥ 44 px via `py-3` + icon + label height.
 */
export function StudentBottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Hoofdnavigatie"
      className="sticky bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-5">
        {STUDENT_NAV_ITEMS.map((it) => {
          const active = isNavItemActive(it, pathname);
          const Icon = it.icon;
          return (
            <li key={it.href} className="relative">
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 px-2 py-3 text-[11px] font-medium transition-colors active:scale-95",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="student-nav-active"
                    className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                ) : null}
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
                    active ? "bg-primary-soft" : "bg-transparent",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4.5 w-4.5 transition-transform",
                      active && "scale-110",
                    )}
                    style={{ height: "1.125rem", width: "1.125rem" }}
                    aria-hidden
                  />
                </span>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
