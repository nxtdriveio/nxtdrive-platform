import Link from "next/link";
import {
  CalendarDays,
  TrendingUp,
  Wallet,
  BadgeCheck,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type Shortcut = { href: string; label: string; icon: LucideIcon };

/**
 * "Snel regelen" shortcut grid. Only links to features that actually exist in
 * the leerling-PWA — no dead ends. Berichten/chat is intentionally omitted
 * (separate task). Examens points to the dedicated CBR & examens screen, which
 * has no bottom-nav slot, so the shortcut is the main way in.
 */
const SHORTCUTS: Shortcut[] = [
  { href: "/student/lessons", label: "Planning", icon: CalendarDays },
  { href: "/student/voortgang", label: "Voortgang", icon: TrendingUp },
  { href: "/student/betalingen", label: "Betalingen", icon: Wallet },
  { href: "/student/cbr", label: "Examens", icon: BadgeCheck },
];

export function QuickActions() {
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Snel regelen
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SHORTCUTS.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.href}
                href={s.href}
                className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card px-3 py-4 text-center text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary-soft/40"
              >
                <Icon className="h-5 w-5 text-primary" aria-hidden />
                {s.label}
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
