"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Inbox,
  CalendarDays,
  GraduationCap,
  Package,
  ClipboardList,
  BarChart3,
  Receipt,
  Calculator,
  Settings,
  Car,
  BookOpen,
  CalendarClock,
  CalendarX,
  BadgeCheck,
  Gift,
  Users,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";

const ALL_NAV = [
  { href: "/backoffice", label: "Dashboard", icon: LayoutDashboard, adminOnly: false },
  { href: "/backoffice/leads", label: "Leads", icon: Inbox, adminOnly: false },
  { href: "/backoffice/referrals", label: "Referrals", icon: Gift, adminOnly: false },
  { href: "/backoffice/agenda", label: "Agenda", icon: CalendarDays, adminOnly: false },
  { href: "/backoffice/agenda/herbezetten", label: "Herbezetten", icon: CalendarX, adminOnly: false },
  { href: "/backoffice/beschikbaarheid", label: "Beschikbaarheid", icon: CalendarClock, adminOnly: false },
  { href: "/backoffice/leerlingen", label: "Leerlingen", icon: GraduationCap, adminOnly: false },
  { href: "/backoffice/cbr", label: "CBR-status", icon: BadgeCheck, adminOnly: false },
  { href: "/backoffice/packages", label: "Pakketten", icon: Package, adminOnly: false },
  { href: "/backoffice/voertuigen", label: "Voertuigen", icon: Car, adminOnly: false },
  { href: "/backoffice/theorie", label: "Theorie", icon: BookOpen, adminOnly: false },
  { href: "/backoffice/taken", label: "Taken", icon: ClipboardList, adminOnly: false },
  { href: "/backoffice/rapportages", label: "Rapportages", icon: BarChart3, adminOnly: false },
  { href: "/backoffice/facturen", label: "Facturen", icon: Receipt, adminOnly: false },
  { href: "/backoffice/boekhouding", label: "Boekhouding", icon: Calculator, adminOnly: false },
  { href: "/backoffice/medewerkers", label: "Medewerkers", icon: Users, adminOnly: true },
  { href: "/backoffice/instellingen", label: "Instellingen", icon: Settings, adminOnly: false },
];

export function BackofficeSidebar({
  tenantName,
  logoUrl,
  isAdmin = false,
}: {
  tenantName: string;
  logoUrl?: string | null;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const nav = ALL_NAV.filter((item) => !item.adminOnly || isAdmin);

  // Most-specific match wins so nested routes (e.g. /agenda/herbezetten) don't
  // also highlight their parent (/agenda).
  const activeHref = nav
    .filter((item) =>
      item.href === "/backoffice"
        ? pathname === "/backoffice"
        : pathname === item.href || pathname.startsWith(`${item.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-16 items-center gap-2 border-b border-border px-5">
        <NxtdriveLogo
          className="text-base"
          logoUrl={logoUrl}
          brandName={tenantName}
        />
      </div>

      <div className="px-3 pt-3 pb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        {tenantName}
      </div>

      <nav className="flex-1 space-y-0.5 px-2">
        {nav.map((item) => {
          const active = item.href === activeHref;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary-soft text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3 space-y-2">
        <p className="text-[11px] text-muted-foreground">
          Powered by <span className="font-semibold text-foreground">NXTDRIVE</span>
        </p>
        <form method="post" action="/auth/logout">
          <button
            type="submit"
            aria-label="Uitloggen"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden />
            Uitloggen
          </button>
        </form>
      </div>
    </aside>
  );
}
