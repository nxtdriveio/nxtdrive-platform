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
  Building2,
  Car,
  BookOpen,
  CalendarClock,
  CalendarX,
  BadgeCheck,
  Gift,
  KeyRound,
  Users,
  LogOut,
  MapPin,
  Network,
  ShieldCheck,
  Workflow,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  adminOnly: boolean;
  requireFranchise?: boolean;
  requireMultiBranch?: boolean;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overzicht",
    items: [
      { href: "/backoffice", label: "Dashboard", icon: LayoutDashboard, adminOnly: false },
    ],
  },
  {
    label: "Acquisitie",
    items: [
      { href: "/backoffice/leads", label: "Leads", icon: Inbox, adminOnly: false },
      { href: "/backoffice/referrals", label: "Referrals", icon: Gift, adminOnly: false },
    ],
  },
  {
    label: "Operationeel",
    items: [
      { href: "/backoffice/agenda", label: "Agenda", icon: CalendarDays, adminOnly: false },
      { href: "/backoffice/agenda/herbezetten", label: "Herbezetten", icon: CalendarX, adminOnly: false },
      { href: "/backoffice/beschikbaarheid", label: "Beschikbaarheid", icon: CalendarClock, adminOnly: false },
      { href: "/backoffice/leerlingen", label: "Leerlingen", icon: GraduationCap, adminOnly: false },
      { href: "/backoffice/cbr", label: "CBR-status", icon: BadgeCheck, adminOnly: false },
      { href: "/backoffice/packages", label: "Pakketten", icon: Package, adminOnly: false },
      { href: "/backoffice/voertuigen", label: "Voertuigen", icon: Car, adminOnly: false },
      { href: "/backoffice/theorie", label: "Theorie", icon: BookOpen, adminOnly: false },
      { href: "/backoffice/taken", label: "Taken", icon: ClipboardList, adminOnly: false },
    ],
  },
  {
    label: "Financieel",
    items: [
      { href: "/backoffice/rapportages", label: "Rapportages", icon: BarChart3, adminOnly: false },
      { href: "/backoffice/facturen", label: "Facturen", icon: Receipt, adminOnly: false },
      { href: "/backoffice/boekhouding", label: "Boekhouding", icon: Calculator, adminOnly: false },
    ],
  },
  {
    label: "Franchise",
    items: [
      {
        href: "/backoffice/franchise",
        label: "Franchise Dashboard",
        icon: Network,
        adminOnly: false,
        requireFranchise: true,
      },
      {
        href: "/backoffice/franchise/aandacht",
        label: "Aandacht",
        icon: AlertTriangle,
        adminOnly: false,
        requireFranchise: true,
      },
      {
        href: "/backoffice/franchise/prestaties",
        label: "Prestaties",
        icon: TrendingUp,
        adminOnly: false,
        requireFranchise: true,
      },
      {
        href: "/backoffice/franchise/planning",
        label: "Centrale planning",
        icon: CalendarDays,
        adminOnly: false,
        requireFranchise: true,
      },
      {
        href: "/backoffice/franchise/vergelijking",
        label: "Vergelijking",
        icon: BarChart3,
        adminOnly: false,
        requireFranchise: true,
      },
      {
        href: "/backoffice/franchise/templates",
        label: "Templates",
        icon: Package,
        adminOnly: true,
        requireFranchise: true,
      },
    ],
  },
  {
    label: "Beheer",
    items: [
      { href: "/backoffice/organisatie", label: "Organisatie", icon: Building2, adminOnly: true },
      { href: "/backoffice/organisatie/rollen", label: "Rollen", icon: KeyRound, adminOnly: true },
      { href: "/backoffice/organisatie/permissies", label: "Permissies", icon: ShieldCheck, adminOnly: true },
      { href: "/backoffice/organisatie/teams", label: "Teams", icon: Workflow, adminOnly: true },
      { href: "/backoffice/medewerkers", label: "Medewerkers", icon: Users, adminOnly: true },
      { href: "/backoffice/instellingen/vestigingen", label: "Vestigingen", icon: MapPin, adminOnly: true, requireMultiBranch: true },
      { href: "/backoffice/instellingen", label: "Instellingen", icon: Settings, adminOnly: false },
    ],
  },
];

const ALL_NAV = NAV_SECTIONS.flatMap((s) => s.items);

export function BackofficeSidebar({
  tenantName,
  logoUrl,
  isAdmin = false,
  hasFranchise = false,
  hasMultiBranch = false,
}: {
  tenantName: string;
  logoUrl?: string | null;
  isAdmin?: boolean;
  hasFranchise?: boolean;
  hasMultiBranch?: boolean;
}) {
  const pathname = usePathname();

  const visibleNav = ALL_NAV.filter(
    (item) =>
      (!item.adminOnly || isAdmin) &&
      (!item.requireFranchise || hasFranchise) &&
      (!item.requireMultiBranch || hasMultiBranch),
  );

  const activeHref = visibleNav
    .filter((item) =>
      item.href === "/backoffice"
        ? pathname === "/backoffice"
        : pathname === item.href || pathname.startsWith(`${item.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-5">
        <NxtdriveLogo
          className="text-base"
          logoUrl={logoUrl}
          brandName={tenantName}
        />
      </div>

      <div className="px-4 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        {tenantName}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        {NAV_SECTIONS.map((section) => {
          const sectionItems = section.items.filter(
            (item) =>
              (!item.adminOnly || isAdmin) &&
              (!item.requireFranchise || hasFranchise) &&
              (!item.requireMultiBranch || hasMultiBranch),
          );
          if (sectionItems.length === 0) return null;

          return (
            <div key={section.label} className="mb-4">
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                {section.label}
              </p>
              <ul className="space-y-0.5">
                {sectionItems.map((item) => {
                  const active = item.href === activeHref;
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                          active
                            ? "border-l-2 border-primary bg-primary-soft pl-[10px] font-medium text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-border p-3 space-y-2">
        <p className="px-2 text-[10px] text-muted-foreground">
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
    </div>
  );
}
