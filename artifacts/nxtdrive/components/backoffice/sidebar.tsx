"use client";

import { useEffect, useState } from "react";
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
  Palette,
  BrainCircuit,
  Layers3,
  ScrollText,
  FileChartColumn,
  Settings2,
  Handshake,
  FileLock2,
  LifeBuoy,
  ListChecks,
  Lightbulb,
  Rocket,
  ToggleLeft,
  ChevronDown,
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
      {
        href: "/backoffice",
        label: "Dashboard",
        icon: LayoutDashboard,
        adminOnly: false,
      },
    ],
  },
  {
    label: "Planning",
    items: [
      {
        href: "/backoffice/agenda",
        label: "Agenda",
        icon: CalendarDays,
        adminOnly: false,
      },
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
      {
        href: "/backoffice/agenda/herbezetten",
        label: "Herbezetten",
        icon: CalendarX,
        adminOnly: false,
      },
    ],
  },
  {
    label: "Relaties",
    items: [
      {
        href: "/backoffice/instructeurs",
        label: "Instructeurs",
        icon: Users,
        adminOnly: false,
      },
      {
        href: "/backoffice/leerlingen",
        label: "Leerlingen",
        icon: GraduationCap,
        adminOnly: false,
      },
      {
        href: "/backoffice/leads",
        label: "Leads",
        icon: Inbox,
        adminOnly: false,
      },
      {
        href: "/backoffice/referrals",
        label: "Referrals",
        icon: Gift,
        adminOnly: false,
      },
    ],
  },
  {
    label: "Resources",
    items: [
      {
        href: "/backoffice/voertuigen",
        label: "Voertuigen",
        icon: Car,
        adminOnly: false,
      },
      {
        href: "/backoffice/beschikbaarheid",
        label: "Beschikbaarheid",
        icon: CalendarClock,
        adminOnly: false,
      },
      {
        href: "/backoffice/rayons",
        label: "Rayons",
        icon: MapPin,
        adminOnly: false,
      },
      {
        href: "/backoffice/packages",
        label: "Pakketten",
        icon: Package,
        adminOnly: false,
      },
    ],
  },
  {
    label: "Leskaart",
    items: [
      {
        href: "/backoffice/ris",
        label: "RIS-leskaart",
        icon: BookOpenCheck,
        adminOnly: false,
      },
      {
        href: "/backoffice/cbr",
        label: "CBR-status",
        icon: BadgeCheck,
        adminOnly: false,
      },
      {
        href: "/backoffice/theorie",
        label: "Theorie",
        icon: BookOpen,
        adminOnly: false,
      },
      {
        href: "/backoffice/taken",
        label: "Taken",
        icon: ClipboardList,
        adminOnly: false,
      },
    ],
  },
  {
    label: "Financieel",
    items: [
      {
        href: "/backoffice/rapportages",
        label: "Rapportages",
        icon: BarChart3,
        adminOnly: false,
      },
      {
        href: "/backoffice/facturen",
        label: "Facturen",
        icon: Receipt,
        adminOnly: false,
      },
      {
        href: "/backoffice/boekhouding",
        label: "Boekhouding",
        icon: Calculator,
        adminOnly: false,
      },
    ],
  },
  {
    label: "Franchise",
    items: [
      {
        href: "/backoffice/franchise",
        label: "Cockpit",
        icon: Network,
        adminOnly: false,
        requireFranchise: true,
      },
      {
        href: "/backoffice/franchise/planning",
        label: "Planning",
        icon: CalendarDays,
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
        href: "/backoffice/franchise/aandacht",
        label: "Aandacht",
        icon: AlertTriangle,
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
      {
        href: "/backoffice/franchise/playbook",
        label: "Playbook",
        icon: BookOpenCheck,
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
        href: "/backoffice/franchise/governance",
        label: "Governance",
        icon: ShieldCheck,
        adminOnly: true,
        requireFranchise: true,
      },
      {
        href: "/backoffice/franchise/delegaties",
        label: "Delegaties",
        icon: Handshake,
        adminOnly: true,
        requireFranchise: true,
      },
      {
        href: "/backoffice/franchise/audit",
        label: "Audit",
        icon: ScrollText,
        adminOnly: true,
        requireFranchise: true,
      },
      {
        href: "/backoffice/franchise/theming",
        label: "Theming",
        icon: Palette,
        adminOnly: true,
        requireFranchise: true,
      },
      {
        href: "/backoffice/franchise/entitlements",
        label: "Entitlements",
        icon: FileLock2,
        adminOnly: true,
        requireFranchise: true,
      },
      {
        href: "/backoffice/franchise/ai-insights",
        label: "AI-inzichten",
        icon: BrainCircuit,
        adminOnly: true,
        requireFranchise: true,
      },
      {
        href: "/backoffice/franchise/reports",
        label: "Rapportages",
        icon: FileChartColumn,
        adminOnly: true,
        requireFranchise: true,
      },
      {
        href: "/backoffice/franchise/architecture",
        label: "Architectuur",
        icon: Layers3,
        adminOnly: true,
        requireFranchise: true,
      },
      {
        href: "/backoffice/franchise/settings",
        label: "Instellingen",
        icon: Settings2,
        adminOnly: true,
        requireFranchise: true,
      },
    ],
  },
  {
    label: "Beheer",
    items: [
      {
        href: "/backoffice/support",
        label: "Support",
        icon: LifeBuoy,
        adminOnly: false,
      },
      {
        href: "/backoffice/checklists",
        label: "Checklists",
        icon: ListChecks,
        adminOnly: true,
      },
      {
        href: "/backoffice/releases",
        label: "Releases",
        icon: Rocket,
        adminOnly: true,
      },
      {
        href: "/backoffice/roadmap",
        label: "Roadmap",
        icon: Lightbulb,
        adminOnly: false,
      },
      {
        href: "/backoffice/mogelijkheden",
        label: "Mogelijkheden",
        icon: ToggleLeft,
        adminOnly: true,
      },
      {
        href: "/backoffice/organisatie",
        label: "Organisatie",
        icon: Building2,
        adminOnly: true,
      },
      {
        href: "/backoffice/organisatie/rollen",
        label: "Rollen",
        icon: KeyRound,
        adminOnly: true,
      },
      {
        href: "/backoffice/organisatie/permissies",
        label: "Permissies",
        icon: ShieldCheck,
        adminOnly: true,
      },
      {
        href: "/backoffice/organisatie/teams",
        label: "Teams",
        icon: Workflow,
        adminOnly: true,
      },
      {
        href: "/backoffice/medewerkers",
        label: "Medewerkers",
        icon: Users,
        adminOnly: true,
      },
      {
        href: "/backoffice/eigenschappen",
        label: "Eigenschappen",
        icon: BadgeCheck,
        adminOnly: true,
      },
      {
        href: "/backoffice/instellingen/vestigingen",
        label: "Vestigingen",
        icon: MapPin,
        adminOnly: true,
        requireMultiBranch: true,
      },
      {
        href: "/backoffice/abonnement",
        label: "Abonnement",
        icon: Wallet,
        adminOnly: true,
      },
      {
        href: "/backoffice/instellingen",
        label: "Instellingen",
        icon: Settings,
        adminOnly: false,
      },
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
  const activeSection =
    NAV_SECTIONS.find((section) =>
      section.items.some((item) => item.href === activeHref),
    )?.label ?? "Overzicht";
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(["Overzicht", activeSection]),
  );

  useEffect(() => {
    setOpenSections((current) => {
      if (current.has(activeSection)) return current;
      const next = new Set(current);
      next.add(activeSection);
      return next;
    });
  }, [activeSection]);

  function toggleSection(label: string) {
    if (label === "Overzicht") return;
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <div className="relative flex h-full flex-col text-brand-sidebar-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(124,92,255,0.28),transparent_28%),radial-gradient(circle_at_100%_100%,rgba(47,183,255,0.16),transparent_26%)]" />
      <div className="relative flex h-[3.75rem] shrink-0 items-center gap-2 border-b border-white/10 px-4 group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:px-0">
        <span className="min-w-0 group-data-[collapsed=true]/sidebar:hidden [&_img]:rounded-md [&_img]:bg-white [&_img]:p-1">
          <NxtdriveLogo
            className="text-lg font-semibold text-white"
            logoUrl={logoUrl}
            brandName={tenantName}
            inverse
          />
        </span>
        <span className="hidden group-data-[collapsed=true]/sidebar:inline-flex">
          <NxtdriveLogo
            className="text-xl font-semibold text-white"
            showWordmark={false}
            inverse
          />
        </span>
      </div>

      <nav className="relative flex-1 overflow-x-hidden overflow-y-auto px-3 pb-2 pt-2.5 group-data-[collapsed=true]/sidebar:px-2 [scrollbar-color:rgba(255,255,255,0.34)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-white/28 [&::-webkit-scrollbar-thumb]:bg-clip-padding [&::-webkit-scrollbar-track]:bg-transparent">
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
            <div
              key={section.label}
              className="mb-1 group-data-[collapsed=true]/sidebar:mb-0.5"
            >
              <button
                type="button"
                onClick={() => toggleSection(section.label)}
                aria-expanded={openSections.has(section.label)}
                className={cn(
                  "mb-0.5 flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-[9px] font-semibold uppercase tracking-[0.18em] text-brand-sidebar-muted/78 transition-colors",
                  "group-data-[collapsed=true]/sidebar:hidden",
                  section.label !== "Overzicht" &&
                    "hover:bg-white/5 hover:text-white",
                )}
              >
                <span>{section.label}</span>
                {section.label !== "Overzicht" ? (
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      openSections.has(section.label) && "rotate-180",
                    )}
                    aria-hidden
                  />
                ) : null}
              </button>
              <ul
                className={cn(
                  "space-y-0.5",
                  !openSections.has(section.label) && "hidden",
                  "group-data-[collapsed=true]/sidebar:!block",
                )}
              >
                {sectionItems.map((item) => {
                  const active = item.href === activeHref;
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-label={item.label}
                        title={item.label}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-all",
                          "group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:px-0",
                          active
                            ? "[background:linear-gradient(135deg,var(--brand-sidebar-active),#3f7cff)] text-brand-sidebar-active-foreground shadow-[0_14px_30px_rgba(76,66,255,0.28)]"
                            : item.muted
                              ? "text-brand-sidebar-muted hover:bg-white/8 hover:text-white"
                              : "text-brand-sidebar-foreground/78 hover:bg-white/8 hover:text-white",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="truncate group-data-[collapsed=true]/sidebar:hidden">
                          {item.label}
                        </span>
                        {item.badge ? (
                          <span className="ml-auto rounded-full border border-white/10 bg-white/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/72 group-data-[collapsed=true]/sidebar:hidden">
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

      <div className="relative shrink-0 space-y-1.5 border-t border-white/10 p-2.5 group-data-[collapsed=true]/sidebar:px-2">
        <Link
          href="/backoffice/abonnement"
          aria-label={`Abonnement: ${planLabel}`}
          title={`Abonnement: ${planLabel}`}
          className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.055] px-2.5 py-1.5 text-[13px] transition-colors hover:bg-white/[0.085] group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:px-0"
        >
          <span className="flex items-center gap-2 text-white">
            <Wallet className="h-4 w-4 shrink-0" aria-hidden />
            <span className="group-data-[collapsed=true]/sidebar:hidden">
              Abonnement
            </span>
          </span>
          <span className="flex items-center gap-2 group-data-[collapsed=true]/sidebar:hidden">
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              {planLabel}
            </span>
            {entitlementAlertCount > 0 ? (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                {entitlementAlertCount} alert
                {entitlementAlertCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </span>
        </Link>
        <p className="px-2 text-[10px] text-brand-sidebar-muted group-data-[collapsed=true]/sidebar:hidden">
          Powered by <span className="font-semibold text-white">NXTDRIVE</span>
        </p>
        <form method="post" action="/auth/logout">
          <button
            type="submit"
            aria-label="Uitloggen"
            title="Uitloggen"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-brand-sidebar-muted transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 group-data-[collapsed=true]/sidebar:justify-center"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden />
            <span className="group-data-[collapsed=true]/sidebar:hidden">
              Uitloggen
            </span>
          </button>
        </form>
      </div>
    </div>
  );
}
