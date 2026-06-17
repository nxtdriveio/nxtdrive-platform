"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { STUDENT_BOTTOM_NAV_ITEMS, isNavItemActive } from "./nav-items";

export function StudentBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Hoofdnavigatie"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 xl:hidden"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.7rem)" }}
    >
      <ul className="pointer-events-auto mx-auto grid max-w-[430px] grid-cols-5 rounded-[1.45rem] border border-brand-border/80 bg-white/94 p-1.5 shadow-brand-floating backdrop-blur-2xl">
        {STUDENT_BOTTOM_NAV_ITEMS.map((item) => {
          const active = isNavItemActive(item, pathname);
          const Icon = item.icon;

          return (
            <li key={item.href} className="relative min-w-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-w-0 flex-col items-center gap-1 rounded-[1.05rem] px-1 py-1.5 text-[10px] font-semibold transition active:scale-95",
                  active
                    ? "text-brand-primary"
                    : "text-brand-muted-foreground hover:text-brand-foreground",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="student-nav-active"
                    className="absolute inset-0 rounded-[1.05rem] bg-brand-sidebar-active"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <span className="relative z-10 flex h-[1.875rem] w-[1.875rem] items-center justify-center rounded-full">
                  <Icon
                    className={cn("transition-transform", active && "scale-110")}
                    style={{ height: "0.98rem", width: "0.98rem" }}
                    aria-hidden
                  />
                </span>
                <span className="relative z-10 max-w-full truncate leading-none">
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
