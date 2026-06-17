"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  CarFront,
  Clock3,
  FileText,
  Home,
  ListTodo,
  MessageCircle,
  MoreHorizontal,
  Settings,
  Users,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  match: "exact" | "prefix";
  mobile?: boolean;
  badge?: number;
};

const SIDEBAR_NAV: NavItem[] = [
  { href: "/instructor", label: "Cockpit", icon: Home, match: "exact", mobile: true },
  { href: "/instructor/agenda", label: "Agenda", icon: CalendarDays, match: "prefix", mobile: true },
  { href: "/instructor/students", label: "Leerlingen", icon: Users, match: "prefix", mobile: true },
  { href: "/instructor/evaluations", label: "Lesevaluaties", icon: FileText, match: "prefix" },
  { href: "/instructor/messages", label: "Berichten", icon: MessageCircle, match: "prefix", mobile: true, badge: 3 },
  { href: "/instructor/tasks", label: "Taken", icon: ListTodo, match: "prefix", badge: 4 },
  { href: "/instructor/vehicles", label: "Voertuigen", icon: CarFront, match: "prefix" },
  { href: "/instructor/availability", label: "Beschikbaarheid", icon: Clock3, match: "prefix" },
  { href: "/instructor/reports", label: "Rapportages", icon: BarChart3, match: "prefix" },
  { href: "/instructor/settings", label: "Instellingen", icon: Settings, match: "prefix" },
];

const MOBILE_NAV: NavItem[] = [
  SIDEBAR_NAV[0]!,
  SIDEBAR_NAV[1]!,
  SIDEBAR_NAV[2]!,
  SIDEBAR_NAV[4]!,
  { href: "/instructor/more", label: "Meer", icon: MoreHorizontal, match: "prefix" },
];

function isActive(pathname: string, item: NavItem) {
  if (item.href === "/instructor") return pathname === "/instructor";
  if (item.href === "/instructor/agenda") {
    return pathname.startsWith("/instructor/agenda") ||
      pathname.startsWith("/instructor/week") ||
      pathname.startsWith("/instructor/afspraak");
  }
  if (item.href === "/instructor/students") {
    return pathname.startsWith("/instructor/students") ||
      pathname.startsWith("/instructor/leerlingen");
  }
  if (item.href === "/instructor/evaluations") {
    return pathname.startsWith("/instructor/evaluations") ||
      pathname.startsWith("/instructor/les-evaluaties");
  }
  if (item.href === "/instructor/messages") {
    return pathname.startsWith("/instructor/messages") ||
      pathname.startsWith("/instructor/berichten");
  }
  if (item.href === "/instructor/tasks") return pathname.startsWith("/instructor/tasks") || pathname.startsWith("/instructor/taken");
  if (item.href === "/instructor/vehicles") return pathname.startsWith("/instructor/vehicles") || pathname.startsWith("/instructor/voertuigen");
  if (item.href === "/instructor/availability") return pathname.startsWith("/instructor/availability") || pathname.startsWith("/instructor/beschikbaarheid");
  if (item.href === "/instructor/settings") return pathname.startsWith("/instructor/settings") || pathname.startsWith("/instructor/instellingen");
  if (item.href === "/instructor/more") return pathname.startsWith("/instructor/more") || pathname.startsWith("/instructor/meer");
  return item.match === "exact" ? pathname === item.href : pathname.startsWith(item.href);
}

function NavLink({ item, mobile = false }: { item: NavItem; mobile?: boolean }) {
  const pathname = usePathname() ?? "";
  const active = isActive(pathname, item);
  const Icon = item.icon;

  if (mobile) {
    return (
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex min-w-0 flex-col items-center gap-1 rounded-[1.1rem] px-1.5 py-1.5 text-[10px] font-bold transition",
          active ? "bg-brand-accent text-brand-primary" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
        <span className="truncate">{item.label}</span>
        {item.badge ? (
          <span className="absolute right-2 top-1 h-2 w-2 rounded-full bg-brand-primary" />
        ) : null}
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-[1.05rem] px-3 py-2.5 text-sm font-bold transition",
        active
          ? "bg-brand-sidebar-active text-brand-sidebar-active-foreground shadow-lg shadow-black/18"
          : "text-brand-sidebar-foreground/78 hover:bg-white/8 hover:text-white",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.badge ? <Badge variant="primary">{item.badge}</Badge> : null}
    </Link>
  );
}

export function InstructorSidebar({
  tenantName,
  userLabel,
  logoUrl,
}: {
  tenantName: string;
  userLabel: string;
  logoUrl?: string | null;
  notifications?: ReactNode;
}) {
  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[17.5rem] shrink-0 overflow-hidden bg-brand-sidebar-background text-brand-sidebar-foreground shadow-[28px_0_80px_rgba(10,20,44,0.18)] xl:flex xl:flex-col xl:w-[18.5rem]">
        <div className="relative flex min-h-0 flex-1 flex-col p-4">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(126,92,255,0.25),transparent_34%),radial-gradient(circle_at_100%_100%,rgba(47,183,255,0.14),transparent_28%)]" />
          <div className="relative">
            <Link href="/instructor" className="inline-flex items-center">
              <NxtdriveLogo className="text-xl font-semibold text-white" logoUrl={logoUrl} brandName={tenantName} />
            </Link>
          </div>

          <div className="relative mt-6 flex items-center gap-3 rounded-[1.25rem] border border-white/10 bg-white/[0.055] p-3">
            <Avatar name={userLabel} className="h-12 w-12 text-sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-white">{userLabel}</p>
              <p className="truncate text-xs text-white/60">Instructeur</p>
              <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Online
              </p>
            </div>
          </div>

          <nav className="relative mt-5 min-h-0 flex-1 overflow-auto" aria-label="Instructeur navigatie">
            <ul className="space-y-1.5">
              {SIDEBAR_NAV.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} />
                </li>
              ))}
            </ul>
          </nav>

        </div>
      </aside>

      <header
        className="sticky top-0 z-30 border-b border-brand-border/80 bg-white/88 backdrop-blur-xl xl:hidden"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex h-[3.5rem] items-center justify-between gap-3 px-4">
          <Link href="/instructor" className="min-w-0">
            <NxtdriveLogo className="text-sm font-semibold text-foreground" logoUrl={logoUrl} brandName={tenantName} />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/instructor/messages"
              aria-label="Berichten"
              className="grid h-10 w-10 place-items-center rounded-full border border-brand-border bg-white text-foreground shadow-sm"
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
            </Link>
            <Avatar name={userLabel} className="h-10 w-10 text-xs" />
          </div>
        </div>
      </header>

      <nav
        aria-label="Mobiele instructeur navigatie"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 xl:hidden"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.55rem)" }}
      >
        <ul className="pointer-events-auto mx-auto grid max-w-md grid-cols-5 rounded-[1.45rem] border border-brand-border/80 bg-white/92 p-1.5 shadow-brand-floating backdrop-blur-xl">
          {MOBILE_NAV.map((item) => (
            <li key={item.href} className="min-w-0">
              <NavLink item={item} mobile />
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
