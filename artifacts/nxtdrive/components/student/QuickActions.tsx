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
    <section className="space-y-3">
      <div className="px-1">
        <h2 className="text-[1.28rem] font-bold tracking-tight text-white">Snel regelen</h2>
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-3">
        {shortcuts.map((shortcut) => {
          const Icon = shortcut.icon;

          return (
            <Link
              key={shortcut.href}
              href={shortcut.href}
              className={cn(
                "group relative min-w-0 overflow-hidden rounded-[1.45rem] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,36,0.98),rgba(11,11,23,0.98))] px-3 py-4 shadow-[0_18px_40px_rgba(1,2,8,0.32)] transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_22px_45px_rgba(65,38,168,0.25)]",
              )}
            >
              <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-primary/10 transition duration-300 group-hover:scale-110" />
              {shortcut.badge ? (
                <span className="absolute right-3 top-3 z-10 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-5 text-primary-foreground shadow-[0_0_16px_rgba(99,64,255,0.45)]">
                  {shortcut.badge > 99 ? "99+" : shortcut.badge}
                </span>
              ) : null}
              <div className="relative flex h-full min-h-[8.85rem] flex-col items-start justify-between gap-4 text-left">
                <span className="flex h-12 w-12 items-center justify-center rounded-[1.1rem] bg-primary/16 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <Icon className="h-6 w-6" aria-hidden />
                </span>
                <div className="space-y-1">
                  <span className="block text-[1.08rem] font-semibold text-white">{shortcut.label}</span>
                  <span className="block text-xs leading-5 text-white/46">
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
