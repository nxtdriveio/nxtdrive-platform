import Link from "next/link";
import { ArrowLeft, CalendarClock, Clock3 } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { WeeklyEditor } from "@/components/availability/WeeklyEditor";
import { AvailabilityCalendar } from "@/components/availability/AvailabilityCalendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  loadExceptions,
  loadWeeklyAvailability,
  resolveAvailabilityDays,
  summarizeAvailability,
} from "@/lib/availability/service";
import {
  addAvailabilityException,
  deleteAvailabilityException,
  saveWeeklyAvailability,
} from "@/lib/availability/actions";

export async function InstructorAvailabilityManager({
  error,
  redirectTo,
}: {
  error?: string;
  redirectTo: "/instructor/availability" | "/instructor/beschikbaarheid";
}) {
  const { tenant, user } = await requireActiveTenant(["instructor", "tenant_admin"]);
  const supabase = await createServerSupabaseClient();
  const today = new Date();
  const rangeEnd = new Date(today);
  rangeEnd.setDate(rangeEnd.getDate() + 62);
  const [weekly, exceptions] = await Promise.all([
    loadWeeklyAvailability(supabase, tenant.id, user.id),
    loadExceptions(supabase, tenant.id, user.id, { from: today, to: rangeEnd }),
  ]);
  const summary = summarizeAvailability(weekly, exceptions);
  const calendarDays = resolveAvailabilityDays(weekly, exceptions, {
    from: today,
    days: 21,
  });

  return (
    <div className="min-w-0 space-y-4 md:space-y-5">
      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">
            Beschikbaarheid
          </p>
          <h1 className="mt-1 text-[1.65rem] font-black leading-tight text-foreground sm:text-2xl xl:text-[2.35rem]">
            Mijn agenda-uren
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Beheer je wekelijkse lesruimte en uitzonderingen. Deze tijden worden direct gebruikt voor planning en beschikbaarheidschecks.
          </p>
        </div>
        <Link href="/instructor/agenda" className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-primary">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Terug naar agenda
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <AvailabilityStat label="Actieve blokken" value={summary.blockCount} icon={Clock3} />
        <AvailabilityStat label="Beschikbare dagen" value={summary.activeWeekdays} icon={CalendarClock} />
        <AvailabilityStat label="Uitzonderingen" value={summary.exceptionCount} icon={CalendarClock} />
      </div>

      {error ? (
        <div className="rounded-2xl border border-destructive/35 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          Opslaan mislukt: {error}
        </div>
      ) : null}

      <Card className="rounded-[1.35rem] border-brand-border/80 bg-white/92 shadow-brand-card">
        <CardHeader>
          <CardTitle>Kalenderweergave</CardTitle>
        </CardHeader>
        <CardContent>
          <AvailabilityCalendar
            days={calendarDays}
            exceptions={exceptions}
            instructorId={user.id}
            branchId={null}
            redirectTo={redirectTo}
            addAction={addAvailabilityException}
            deleteAction={deleteAvailabilityException}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
        <Card className="rounded-[1.35rem] border-brand-border/80 bg-white/92 shadow-brand-card">
          <CardHeader>
            <CardTitle>Wekelijks schema</CardTitle>
          </CardHeader>
          <CardContent>
            <WeeklyEditor
              initial={weekly}
              instructorId={user.id}
              branchId={null}
              redirectTo={redirectTo}
              action={saveWeeklyAvailability}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="rounded-[1.35rem] border-brand-border/80 bg-white/92 shadow-brand-card">
            <CardContent className="space-y-3 p-4">
              <Badge variant={summary.weeklyMinutes > 0 ? "success" : "warning"}>
                {summary.weeklyMinutes > 0 ? "Beschikbaarheid actief" : "Nog geen basisweek"}
              </Badge>
              <p className="text-sm leading-6 text-muted-foreground">
                {summary.weeklyMinutes > 0
                  ? `${Math.round(summary.weeklyMinutes / 60)} uur per week is zichtbaar voor planning.`
                  : "Voeg minimaal een tijdblok toe om je beschikbaarheid zichtbaar te maken."}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function AvailabilityStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Clock3;
}) {
  return (
    <div className="rounded-[1.25rem] border border-brand-border/80 bg-white/92 p-4 shadow-brand-card">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-accent text-brand-primary">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <p className="text-2xl font-black leading-none text-foreground">{value}</p>
          <p className="mt-1 text-xs font-bold text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}
