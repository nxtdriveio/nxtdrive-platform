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
      <ul className="pointer-events-auto mx-auto grid max-w-[28.75rem] grid-cols-5 items-end rounded-[1.8rem] border border-white/10 bg-card/78 px-2 pb-1.5 pt-1.5 shadow-[0_28px_70px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
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
                  isHome ? "gap-1 pb-0" : "gap-1 px-1 py-1.5",
                  active ? "text-primary" : "text-white/52 hover:text-white",
                )}
              >
                {isHome ? (
                  <>
                    <span className="pointer-events-none absolute inset-x-3 bottom-0 h-11 rounded-[1.3rem] bg-primary/8 blur-xl" />
                    <motion.span
                      layoutId="student-home-active"
                      className={cn(
                        "relative z-10 flex h-[4.1rem] w-[4.1rem] items-center justify-center rounded-full border border-white/12 bg-[radial-gradient(circle_at_30%_24%,rgba(164,122,255,0.95),rgba(93,42,255,0.98)_60%,rgba(39,18,100,1))] text-white shadow-[0_0_0_4px_rgba(104,62,255,0.14),0_18px_38px_rgba(86,47,214,0.55)]",
                        active ? "-translate-y-3.5" : "-translate-y-2.5 opacity-88",
                      )}
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    >
                      <Icon className="h-6 w-6" aria-hidden />
                    </motion.span>
                    <span className="relative z-10 -mt-0.5 text-[11px] font-semibold text-white">
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
                        style={{ height: "0.98rem", width: "0.98rem" }}
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
