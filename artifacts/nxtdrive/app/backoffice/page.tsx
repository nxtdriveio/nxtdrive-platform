import {
  TrendingUp,
  Users,
  Inbox,
  Wallet,
  Calendar,
  Clock,
  ArrowUpRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireActiveTenant } from "@/lib/auth/require-role";

export const dynamic = "force-dynamic";

const kpis = [
  {
    label: "Actieve leerlingen",
    value: "0",
    hint: "nog niet beschikbaar",
    icon: Users,
  },
  {
    label: "Proeflessen gepland",
    value: "0",
    hint: "nog niet beschikbaar",
    icon: Calendar,
  },
  {
    label: "Openstaande leads",
    value: "0",
    hint: "module volgt in Phase 2B",
    icon: Inbox,
  },
  {
    label: "Omzet deze maand",
    value: "€ 0,00",
    hint: "nog niet beschikbaar",
    icon: Wallet,
  },
  {
    label: "Lessen vandaag",
    value: "0",
    hint: "nog niet beschikbaar",
    icon: Clock,
  },
  {
    label: "Nog opvolgen",
    value: "0",
    hint: "nog niet beschikbaar",
    icon: TrendingUp,
  },
];

export default async function BackofficePage() {
  const { user, tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);

  const today = new Intl.DateTimeFormat("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  const firstName =
    user.profile?.full_name?.split(" ")[0] ?? user.email?.split("@")[0] ?? "";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            {today.charAt(0).toUpperCase() + today.slice(1)} — welkom terug
            {firstName ? `, ${firstName}` : ""}.
          </p>
        </div>
        <Badge variant="primary">
          <ArrowUpRight className="h-3 w-3" aria-hidden />
          {tenant.name}
        </Badge>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{kpi.label}</CardTitle>
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-soft text-primary">
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-foreground">
                  {kpi.value}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {kpi.hint}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Agenda vandaag</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
              Agenda-module volgt in Phase 4.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Leads-pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
              Volgt in Phase 2B.
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Slimme meldingen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
              Volgt zodra modules data leveren.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Leerlingen-voortgang</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
              Volgt in Phase 4.
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
