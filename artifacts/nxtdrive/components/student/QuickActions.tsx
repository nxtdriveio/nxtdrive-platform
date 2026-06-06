import Link from "next/link";
import {
  CalendarDays,
  TrendingUp,
  Wallet,
  BadgeCheck,
  type LucideIcon,
} from "lucide-react";
import { PWACard, PWASectionHeader } from "@/components/pwa/primitives";

type Shortcut = { href: string; label: string; description: string; icon: LucideIcon };

/**
 * "Snel regelen" shortcut grid — large, tappable tiles with compact copy.
 * Only links to features that exist in the leerling-PWA — no dead ends.
 */
const SHORTCUTS: Shortcut[] = [
  { href: "/student/lessons", label: "Planning", description: "Je lessen", icon: CalendarDays },
  { href: "/student/voortgang", label: "Voortgang", description: "Rijbewijsroute", icon: TrendingUp },
  { href: "/student/betalingen", label: "Betalingen", description: "Tegoed en facturen", icon: Wallet },
  { href: "/student/cbr", label: "Examens", description: "CBR status", icon: BadgeCheck },
];

export function QuickActions() {
  return (
    <PWACard>
      <PWASectionHeader>Snel regelen</PWASectionHeader>
      <div className="grid min-w-0 grid-cols-2 gap-3">
        {SHORTCUTS.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.href}
              href={s.href}
              className="group relative min-w-0 overflow-hidden rounded-2xl border border-border bg-card px-3 py-4 text-left transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10"
            >
              <div className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-primary/10 transition group-hover:scale-125" />
              <span className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-soft text-primary shadow-lg shadow-primary/10">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <div className="relative mt-3 min-w-0">
                <div className="truncate text-sm font-bold text-foreground">{s.label}</div>
                <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                  {s.description}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </PWACard>
  );
}
