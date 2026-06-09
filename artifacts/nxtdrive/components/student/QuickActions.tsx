import Link from "next/link";
import {
  ArrowUpRight,
  BadgeCheck,
  CalendarDays,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { PWASectionHeader } from "@/components/pwa/primitives";

type Shortcut = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

const SHORTCUTS: Shortcut[] = [
  {
    href: "/student/lessons",
    label: "Planning",
    description: "Je lessen en verschuivingen",
    icon: CalendarDays,
  },
  {
    href: "/student/voortgang",
    label: "Voortgang",
    description: "Rijbewijsroute en trends",
    icon: TrendingUp,
  },
  {
    href: "/student/betalingen",
    label: "Betalingen",
    description: "Tegoed en facturen",
    icon: Wallet,
  },
  {
    href: "/student/cbr",
    label: "Examens",
    description: "CBR en examenvoorbereiding",
    icon: BadgeCheck,
  },
];

export function QuickActions() {
  return (
    <section className="space-y-3">
      <PWASectionHeader>Snel regelen</PWASectionHeader>
      <div className="grid min-w-0 grid-cols-2 gap-3">
        {SHORTCUTS.map((shortcut) => {
          const Icon = shortcut.icon;

          return (
            <Link
              key={shortcut.href}
              href={shortcut.href}
              className="group relative min-w-0 overflow-hidden rounded-[1.45rem] border border-border/70 bg-card/88 px-3.5 py-4 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-lg hover:shadow-primary/10"
            >
              <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-primary/8 transition group-hover:scale-110" />
              <div className="relative flex min-w-0 items-start justify-between gap-2">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary shadow-sm">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-primary" aria-hidden />
              </div>
              <div className="relative mt-3 min-w-0">
                <div className="truncate text-sm font-bold text-foreground">{shortcut.label}</div>
                <div className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  {shortcut.description}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
