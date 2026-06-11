import Link from "next/link";
import {
  BadgeCheck,
  CalendarDays,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Shortcut = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
};

const BASE_SHORTCUTS: Shortcut[] = [
  { href: "/student/lessons", label: "Planning", icon: CalendarDays },
  { href: "/student/voortgang", label: "Voortgang", icon: TrendingUp },
  { href: "/student/betalingen", label: "Betalingen", icon: Wallet },
  { href: "/student/cbr", label: "Examens", icon: BadgeCheck },
];

export function QuickActions({
  messageUnreadCount = 0,
}: {
  messageUnreadCount?: number;
}) {
  const shortcuts = BASE_SHORTCUTS.map((shortcut) =>
    shortcut.href === "/student/berichten"
      ? { ...shortcut, badge: messageUnreadCount > 0 ? messageUnreadCount : undefined }
      : shortcut,
  );

  return (
    <section className="space-y-2">
      <div className="px-1">
        <h2 className="text-[1.08rem] font-bold tracking-tight text-white sm:text-[1.24rem]">
          Snel regelen
        </h2>
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-2.5 sm:gap-3">
        {shortcuts.map((shortcut) => {
          const Icon = shortcut.icon;

          return (
            <Link
              key={shortcut.href}
              href={shortcut.href}
              className={cn(
                "group relative min-w-0 overflow-hidden rounded-[1.22rem] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,36,0.98),rgba(11,11,23,0.98))] px-3 py-2.75 shadow-[0_16px_34px_rgba(1,2,8,0.28)] transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_20px_40px_rgba(65,38,168,0.22)] sm:rounded-[1.45rem] sm:py-3.5",
              )}
            >
              <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-primary/10 transition duration-300 group-hover:scale-110" />
              {shortcut.badge ? (
                <span className="absolute right-3 top-3 z-10 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-5 text-primary-foreground shadow-[0_0_16px_rgba(99,64,255,0.45)]">
                  {shortcut.badge > 99 ? "99+" : shortcut.badge}
                </span>
              ) : null}
              <div className="relative flex h-full min-h-[6.4rem] flex-col items-start justify-between gap-2 text-left sm:min-h-[8rem] sm:gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-[0.95rem] bg-primary/16 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:h-11 sm:w-11 sm:rounded-[1.1rem]">
                  <Icon className="h-[1.05rem] w-[1.05rem] sm:h-[1.3rem] sm:w-[1.3rem]" aria-hidden />
                </span>
                <div className="space-y-1">
                  <span className="block text-[0.92rem] font-semibold text-white sm:text-[1.04rem]">{shortcut.label}</span>
                  <span className="block text-[10px] leading-4 text-white/46 sm:text-[11px] sm:leading-5">
                    {shortcut.label === "Planning"
                      ? "Lessen en verschuivingen"
                      : shortcut.label === "Voortgang"
                        ? "Rijbewijsroute en trends"
                        : shortcut.label === "Betalingen"
                          ? "Tegoed en facturen"
                          : "CBR en examenklaar"}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
