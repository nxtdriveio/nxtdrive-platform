"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { STUDENT_NAV_ITEMS, isNavItemActive } from "./nav-items";

export function StudentBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Hoofdnavigatie"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 2xl:hidden"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.7rem)" }}
    >
      <ul className="pointer-events-auto mx-auto grid max-w-[28rem] grid-cols-5 rounded-[1.8rem] border border-border/60 bg-card/74 p-1.5 shadow-2xl shadow-black/20 backdrop-blur-2xl">
        {STUDENT_NAV_ITEMS.map((item) => {
          const active = isNavItemActive(item, pathname);
          const Icon = item.icon;

          return (
            <li key={item.href} className="relative min-w-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-w-0 flex-col items-center gap-1 rounded-[1.3rem] px-1 py-1.5 text-[10px] font-semibold transition active:scale-95",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="student-nav-active"
                    className="absolute inset-0 rounded-[1.3rem] bg-primary-soft/90"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <span className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full">
                  <Icon
                    className={cn("transition-transform", active && "scale-110")}
                    style={{ height: "0.98rem", width: "0.98rem" }}
                    aria-hidden
                  />
                </span>
                <span className="relative z-10 max-w-full truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
