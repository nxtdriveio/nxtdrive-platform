"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  STUDENT_NAV_ITEMS,
  isNavItemActive,
  type StudentNavItem,
} from "./nav-items";

export function StudentBottomNav() {
  const pathname = usePathname();
  const orderedItems = [
    STUDENT_NAV_ITEMS.find((item) => item.href === "/student/lessons"),
    STUDENT_NAV_ITEMS.find((item) => item.href === "/student/voortgang"),
    STUDENT_NAV_ITEMS.find((item) => item.href === "/student"),
    STUDENT_NAV_ITEMS.find((item) => item.href === "/student/theorie"),
    STUDENT_NAV_ITEMS.find((item) => item.href === "/student/profile"),
  ].filter((item): item is StudentNavItem => Boolean(item));

  return (
    <nav
      aria-label="Hoofdnavigatie"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 2xl:hidden"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.55rem)" }}
    >
      <ul className="pointer-events-auto mx-auto grid max-w-[28.75rem] grid-cols-5 items-end rounded-[1.75rem] border border-white/10 bg-card/78 px-2 pb-1.5 pt-1.5 shadow-[0_28px_70px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
        {orderedItems.map((item) => {
          const active = isNavItemActive(item, pathname);
          const Icon = item.icon;
          const isHome = item.href === "/student";

          return (
            <li key={item.href} className="relative min-w-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-w-0 flex-col items-center justify-end rounded-[1.3rem] text-[10px] font-semibold transition active:scale-95",
                  isHome ? "gap-1 pb-0" : "gap-1 px-1 py-1",
                  active ? "text-primary" : "text-white/52 hover:text-white",
                )}
              >
                {isHome ? (
                  <>
                    <span className="pointer-events-none absolute inset-x-3 bottom-0 h-10 rounded-[1.2rem] bg-primary/8 blur-xl" />
                    <motion.span
                      layoutId="student-home-active"
                      className={cn(
                        "relative z-10 flex h-[4rem] w-[4rem] items-center justify-center rounded-full border border-white/12 text-white",
                        active ? "-translate-y-3.5" : "-translate-y-2.5 opacity-88",
                      )}
                      style={{
                        background:
                          "radial-gradient(circle at 30% 24%, color-mix(in oklab, var(--primary) 86%, white), color-mix(in oklab, var(--primary) 100%, black) 60%, color-mix(in oklab, var(--primary) 30%, #0c0916))",
                        boxShadow:
                          "0 0 0 4px color-mix(in oklab, var(--primary) 18%, transparent), 0 18px 38px color-mix(in oklab, var(--primary) 44%, transparent)",
                      }}
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    >
                      <Icon className="h-6 w-6" aria-hidden />
                    </motion.span>
                    <span className="relative z-10 -mt-0.5 text-[10px] font-semibold text-white">
                      {item.label}
                    </span>
                  </>
                ) : (
                  <>
                    {active ? (
                      <motion.span
                        layoutId="student-nav-active"
                        className="absolute inset-0 rounded-[1.3rem] bg-primary/10"
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      />
                    ) : null}
                    <span className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full">
                      <Icon
                        className={cn("transition-transform", active && "scale-110")}
                        style={{ height: "1.02rem", width: "1.02rem" }}
                        aria-hidden
                      />
                    </span>
                    <span className="relative z-10 max-w-full truncate">{item.label}</span>
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
