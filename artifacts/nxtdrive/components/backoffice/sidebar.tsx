"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Inbox,
  CalendarDays,
  GraduationCap,
  ClipboardList,
  BarChart3,
  Receipt,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";

const nav = [
  { href: "/backoffice", label: "Dashboard", icon: LayoutDashboard },
  { href: "/backoffice/leads", label: "Leads", icon: Inbox },
  { href: "/backoffice/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/backoffice/leerlingen", label: "Leerlingen", icon: GraduationCap },
  { href: "/backoffice/taken", label: "Taken", icon: ClipboardList },
  { href: "/backoffice/rapportages", label: "Rapportages", icon: BarChart3 },
  { href: "/backoffice/facturen", label: "Facturen", icon: Receipt },
  { href: "/backoffice/instellingen", label: "Instellingen", icon: Settings },
];

export function BackofficeSidebar({ tenantName }: { tenantName: string }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-16 items-center gap-2 border-b border-border px-5">
        <NxtdriveLogo className="text-base" />
      </div>

      <div className="px-3 pt-3 pb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        {tenantName}
      </div>

      <nav className="flex-1 space-y-0.5 px-2">
        {nav.map((item) => {
          const active =
            item.href === "/backoffice"
              ? pathname === "/backoffice"
              : pathname.startsWith(item.href);
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

      <div className="border-t border-border p-3 text-[11px] text-muted-foreground">
        Powered by <span className="font-semibold text-foreground">NXTDRIVE</span>
      </div>
    </aside>
  );
}
