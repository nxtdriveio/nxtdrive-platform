"use client";

import Link from "next/link";
import { Fragment, type ComponentType } from "react";
import {
  Building2,
  CalendarDays,
  CalendarPlus,
  Car,
  ChevronDown,
  ClipboardList,
  GraduationCap,
  Inbox,
  MapPin,
  PackagePlus,
  Plus,
  Receipt,
  Route,
  UserPlus,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type CreateAction = {
  href: string;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
};

const CREATE_GROUPS: { label: string; items: CreateAction[] }[] = [
  {
    label: "Planning",
    items: [
      {
        href: "/backoffice/agenda/nieuw",
        label: "Rijles",
        description: "Plan een nieuwe rijles.",
        icon: CalendarDays,
      },
      {
        href: "/backoffice/agenda/afspraak/nieuw",
        label: "Afspraak",
        description: "Maak een losse afspraak.",
        icon: CalendarPlus,
      },
      {
        href: "/backoffice/planning-queue",
        label: "Queue-item",
        description: "Voeg een planningsverzoek toe.",
        icon: ClipboardList,
      },
    ],
  },
  {
    label: "Relaties",
    items: [
      {
        href: "/backoffice/leerlingen",
        label: "Leerling",
        description: "Open de leerling-aanmaakflow.",
        icon: GraduationCap,
      },
      {
        href: "/backoffice/leads",
        label: "Lead / proefles",
        description: "Registreer een nieuwe aanvraag.",
        icon: Inbox,
      },
    ],
  },
  {
    label: "Financieel",
    items: [
      {
        href: "/backoffice/facturen/nieuw",
        label: "Factuur",
        description: "Maak een losse factuur.",
        icon: Receipt,
      },
      {
        href: "/backoffice/facturen/termijn",
        label: "Termijnfactuur",
        description: "Start een termijnfactuur.",
        icon: Route,
      },
      {
        href: "/backoffice/packages",
        label: "Pakket",
        description: "Beheer of maak lespakketten.",
        icon: PackagePlus,
      },
    ],
  },
  {
    label: "Beheer",
    items: [
      {
        href: "/backoffice/taken",
        label: "Taak",
        description: "Open het takenbord.",
        icon: ClipboardList,
      },
      {
        href: "/backoffice/voertuigen",
        label: "Voertuig",
        description: "Voeg voertuigdata toe.",
        icon: Car,
      },
      {
        href: "/backoffice/rayons",
        label: "Rayon",
        description: "Maak een werkgebied aan.",
        icon: MapPin,
      },
      {
        href: "/backoffice/instellingen/vestigingen",
        label: "Vestiging",
        description: "Beheer vestigingen.",
        icon: Building2,
      },
      {
        href: "/backoffice/medewerkers",
        label: "Medewerker",
        description: "Nodig een medewerker uit.",
        icon: UserPlus,
      },
    ],
  },
];

export function BackofficeCreateMenu({ className }: { className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-[0_14px_30px_rgba(91,77,255,0.24)] transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            className,
          )}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Nieuw
          <ChevronDown className="h-4 w-4 opacity-75" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 border-brand-border bg-white p-2 shadow-[0_22px_55px_rgba(15,23,42,0.18)]"
      >
        {CREATE_GROUPS.map((group, groupIndex) => (
          <Fragment key={group.label}>
            {groupIndex > 0 ? <DropdownMenuSeparator className="my-2" /> : null}
            <DropdownMenuLabel className="px-2 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              {group.label}
            </DropdownMenuLabel>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <DropdownMenuItem
                  key={item.href}
                  asChild
                  className="cursor-pointer p-0 focus:bg-brand-accent/70"
                >
                  <Link
                    href={item.href}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-accent text-primary">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-foreground">
                        {item.label}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    </span>
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
