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
  BookOpenCheck,
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
  Wallet,
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
  badge?: string;
  muted?: boolean;
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
    label: "Planning",
    items: [
      { href: "/backoffice/agenda", label: "Agenda", icon: CalendarDays, adminOnly: false },
      {
        href: "/backoffice/planning-board",
        label: "Planboard",
        icon: CalendarClock,
        adminOnly: false,
      },
      {
        href: "/backoffice/planning-queue",
        label: "Planning queue",
        icon: ClipboardList,
        adminOnly: false,
      },
      { href: "/backoffice/agenda/herbezetten", label: "Herbezetten", icon: CalendarX, adminOnly: false },
    ],
  },
  {
    label: "Relaties",
    items: [
      { href: "/backoffice/instructeurs", label: "Instructeurs", icon: Users, adminOnly: false },
      { href: "/backoffice/leerlingen", label: "Leerlingen", icon: GraduationCap, adminOnly: false },
      { href: "/backoffice/leads", label: "Leads", icon: Inbox, adminOnly: false },
      { href: "/backoffice/referrals", label: "Referrals", icon: Gift, adminOnly: false },
    ],
  },
  {
    label: "Resources",
    items: [
      { href: "/backoffice/voertuigen", label: "Voertuigen", icon: Car, adminOnly: false },
      { href: "/backoffice/beschikbaarheid", label: "Beschikbaarheid", icon: CalendarClock, adminOnly: false },
      { href: "/backoffice/rayons", label: "Rayons", icon: MapPin, adminOnly: false },
      { href: "/backoffice/packages", label: "Pakketten", icon: Package, adminOnly: false },
    ],
  },
  {
    label: "Leskaart",
    items: [
      { href: "/backoffice/ris", label: "RIS-leskaart", icon: BookOpenCheck, adminOnly: false },
      { href: "/backoffice/cbr", label: "CBR-status", icon: BadgeCheck, adminOnly: false },
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
        href: "/backoffice/franchise/playbook",
        label: "Playbook",
        icon: BookOpenCheck,
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
      { href: "/backoffice/eigenschappen", label: "Eigenschappen", icon: BadgeCheck, adminOnly: true },
      { href: "/backoffice/instellingen/vestigingen", label: "Vestigingen", icon: MapPin, adminOnly: true, requireMultiBranch: true },
      { href: "/backoffice/abonnement", label: "Abonnement", icon: Wallet, adminOnly: true },
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
  planLabel,
  entitlementAlertCount = 0,
}: {
  tenantName: string;
  logoUrl?: string | null;
  isAdmin?: boolean;
  hasFranchise?: boolean;
  hasMultiBranch?: boolean;
  planLabel: string;
  entitlementAlertCount?: number;
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

      <div className="px-4 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        {tenantName}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        {NAV_SECTIONS.map((section) => {
          let sectionItems: NavItem[] = [];
          if (section.label === "Franchise" && !hasFranchise) {
            sectionItems = isAdmin
              ? [
                  {
                    href: "/backoffice/abonnement",
                    label: "Franchise opties",
                    icon: Network,
                    adminOnly: true,
                    badge: "Elite",
                    muted: true,
                  },
                ]
              : [];
          } else {
            sectionItems = section.items.flatMap((item) => {
              if (item.adminOnly && !isAdmin) return [];
              if (item.requireFranchise && !hasFranchise) return [];
              if (item.requireMultiBranch && !hasMultiBranch) {
                return isAdmin
                  ? [
                      {
                        ...item,
                        badge: "Pro+",
                        muted: true,
                      },
                    ]
                  : [];
              }
              return [item];
            });
          }
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
                          "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                          active
                            ? "bg-[var(--admin-active)] font-medium text-primary shadow-sm"
                            : item.muted
                              ? "text-muted-foreground/80 hover:bg-[var(--surface-2)] hover:text-foreground"
                              : "text-muted-foreground hover:bg-[var(--surface-2)] hover:text-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="truncate">{item.label}</span>
                        {item.badge ? (
                          <span className="ml-auto rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {item.badge}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 space-y-2 border-t border-border p-3">
        <Link
          href="/backoffice/abonnement"
          className="flex items-center justify-between rounded-xl border border-border bg-[var(--surface-1)] px-3 py-2 text-sm transition-colors hover:bg-[var(--surface-2)]"
        >
          <span className="flex items-center gap-2 text-foreground">
            <Wallet className="h-4 w-4 shrink-0" aria-hidden />
            Abonnement
          </span>
          <span className="flex items-center gap-2">
            <span className="rounded-full bg-[color-mix(in_oklab,var(--primary)_10%,transparent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              {planLabel}
            </span>
            {entitlementAlertCount > 0 ? (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                {entitlementAlertCount} alert{entitlementAlertCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </span>
        </Link>
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
