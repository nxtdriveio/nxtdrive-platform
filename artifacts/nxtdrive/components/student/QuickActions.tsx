import Link from "next/link";
import {
  CalendarDays,
  TrendingUp,
  Wallet,
  BadgeCheck,
  type LucideIcon,
} from "lucide-react";
import { PWACard, PWASectionHeader } from "@/components/pwa/primitives";

type Shortcut = { href: string; label: string; icon: LucideIcon };

/**
 * "Snel regelen" shortcut grid — 2-column grid of large, tappable tiles
 * (≥ 56px height) with icon + label. Only links to features that exist in
 * the leerling-PWA — no dead ends.
 */
const SHORTCUTS: Shortcut[] = [
  { href: "/student/lessons", label: "Planning", icon: CalendarDays },
  { href: "/student/voortgang", label: "Voortgang", icon: TrendingUp },
  { href: "/student/betalingen", label: "Betalingen", icon: Wallet },
  { href: "/student/cbr", label: "Examens", icon: BadgeCheck },
];

export function QuickActions() {
  return (
    <PWACard>
      <PWASectionHeader>Snel regelen</PWASectionHeader>
      <div className="grid grid-cols-2 gap-2.5">
        {SHORTCUTS.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.href}
              href={s.href}
              className="flex min-h-[3.5rem] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-4 text-center text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary-soft/40"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              {s.label}
            </Link>
          );
        })}
      </div>
    </PWACard>
  );
}
