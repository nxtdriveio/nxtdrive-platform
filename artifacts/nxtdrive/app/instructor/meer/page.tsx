import Link from "next/link";
import { ChevronRight, CalendarRange, Bell, Users, Settings } from "lucide-react";
import { PWAPageHeader, PWACard } from "@/components/pwa/primitives";
import { requireActiveTenant } from "@/lib/auth/require-role";

export const dynamic = "force-dynamic";

type MeerItem = {
  href: string;
  label: string;
  description: string;
  icon: React.ElementType;
};

const MEER_ITEMS: MeerItem[] = [
  {
    href: "/instructor/beschikbaarheid",
    label: "Beschikbaarheid",
    description: "Beheer je werkbare tijden en vrije dagen",
    icon: CalendarRange,
  },
  {
    href: "/instructor/meldingen",
    label: "Meldingen",
    description: "Bekijk al je meldingen en notificatie-instellingen",
    icon: Bell,
  },
  {
    href: "/instructor/leerlingen",
    label: "Leerlingen",
    description: "Overzicht van al je leerlingen",
    icon: Users,
  },
  {
    href: "/instructor/instellingen",
    label: "Instellingen",
    description: "Profiel en app-voorkeuren",
    icon: Settings,
  },
];

export default async function InstructorMeerPage() {
  await requireActiveTenant(["instructor", "tenant_admin"]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <PWAPageHeader title="Meer" subtitle="Alle overige onderdelen van de instructeur-app" />

      <PWACard>
        <div className="-mx-4 -my-4 divide-y divide-border overflow-hidden rounded-2xl">
          {MEER_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-muted/50 active:bg-muted"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">{item.label}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{item.description}</div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            );
          })}
        </div>
      </PWACard>
    </div>
  );
}
