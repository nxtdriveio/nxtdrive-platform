"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  brandPrimaryActiveSurfaceStyle,
  brandPrimaryTint,
} from "@/lib/brand-styles";
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
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.35rem)" }}
    >
      <ul className="pointer-events-auto mx-auto grid max-w-[27.4rem] grid-cols-5 items-end rounded-[1.45rem] border border-white/10 bg-card/82 px-1.5 pb-1.5 pt-1.5 shadow-[0_22px_56px_rgba(0,0,0,0.34)] backdrop-blur-2xl">
        {orderedItems.map((item) => {
          const active = isNavItemActive(item, pathname);
          const Icon = item.icon;

          return (
            <li key={item.href} className="relative min-w-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-[1.05rem] px-1 py-1.25 text-[9px] font-semibold transition active:scale-95 sm:text-[10px]",
                  active ? "text-primary" : "text-white/52 hover:text-white",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="student-nav-active"
                    className="absolute inset-0 rounded-[1.05rem]"
                    style={brandPrimaryActiveSurfaceStyle()}
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <span
                  className={cn(
                    "relative z-10 flex h-7.5 w-7.5 items-center justify-center rounded-full transition-colors sm:h-8 sm:w-8",
                    active ? "text-primary" : "bg-transparent text-current",
                  )}
                  style={
                    active
                      ? {
                          background: brandPrimaryTint(16),
                        }
                      : undefined
                  }
                >
                  <Icon
                    className={cn("transition-transform", active && "scale-105")}
                    style={{ height: "0.95rem", width: "0.95rem" }}
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
