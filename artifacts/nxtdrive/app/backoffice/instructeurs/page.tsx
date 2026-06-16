import Link from "next/link";
import {
  CalendarClock,
  Car,
  Clock3,
  GraduationCap,
  Sparkles,
  Users,
} from "lucide-react";
import { requireActiveOrganization } from "@/lib/organization/context";
import { loadOrganizationBranchScope } from "@/lib/organization/branch-scope";
import { loadBackofficeInstructors } from "@/lib/instructors/backoffice";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { createNlDateTimeFormatter } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const VIEW_ROLES = [
  "tenant_admin",
  "franchise_admin",
  "branch_manager",
  "planner",
  "admin_staff",
] as const;

const dateTimeFmt = createNlDateTimeFormatter({
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function hoursLabel(minutes: number): string {
  if (minutes <= 0) return "0 uur";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours} uur`;
  return `${hours}u ${rest}m`;
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </p>
        </div>
        <span className="rounded-full bg-primary-soft p-2 text-primary">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

export default async function BackofficeInstructorsPage() {
  const context = await requireActiveOrganization([...VIEW_ROLES]);
  const service = createServiceRoleClient();
  const branchScope = await loadOrganizationBranchScope(service, context);
  const instructors = await loadBackofficeInstructors(
    service,
    context.organization.id,
    branchScope,
  );

  const withAvailability = instructors.filter(
    (instructor) => instructor.weeklyAvailabilityMinutes > 0,
  ).length;
  const todayTotal = instructors.reduce(
    (sum, instructor) => sum + instructor.todayAppointments,
    0,
  );
  const studentTotal = instructors.reduce(
    (sum, instructor) => sum + instructor.activeStudents,
    0,
  );
  const capabilityTotal = instructors.filter(
    (instructor) => instructor.capabilityLabels.length > 0,
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Instructeurs
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Beheer de operationele instructeurslaag: beschikbaarheid,
            eigenschappen, leerlingen, voertuigen en planning komen hier samen.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/backoffice/medewerkers"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Medewerker uitnodigen
          </Link>
          <Link
            href="/backoffice/beschikbaarheid"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Beschikbaarheid beheren
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Instructeurs"
          value={String(instructors.length)}
          description="Medewerkers met instructeursrol binnen jouw zichtbare vestiging-scope."
          icon={Users}
        />
        <StatCard
          title="Vandaag"
          value={String(todayTotal)}
          description="Rijlessen en overige afspraken die vandaag op de instructeursagenda staan."
          icon={CalendarClock}
        />
        <StatCard
          title="Leerlingen"
          value={String(studentTotal)}
          description="Unieke leerlingen met recente of aankomende lessen bij deze instructeurs."
          icon={GraduationCap}
        />
        <StatCard
          title="Ingericht"
          value={`${withAvailability}/${instructors.length}`}
          description={`${capabilityTotal} instructeur(s) hebben al planningeigenschappen.`}
          icon={Sparkles}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Instructeur resources</CardTitle>
          <p className="text-sm text-muted-foreground">
            Gebruik deze lijst als operationeel startpunt. Detailpagina's linken
            door naar bestaande beheerflows, zodat we niets dubbel bouwen.
          </p>
        </CardHeader>
        <CardContent>
          {instructors.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
              <Users className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="mt-3 font-medium text-foreground">
                Nog geen instructeurs
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Nodig eerst een medewerker uit met de rol instructeur.
              </p>
              <Link
                href="/backoffice/medewerkers"
                className={`${buttonVariants({ size: "sm" })} mt-4`}
              >
                Naar medewerkers
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {instructors.map((instructor) => (
                <Link
                  key={instructor.id}
                  href={`/backoffice/instructeurs/${instructor.id}`}
                  className="group rounded-2xl border border-border bg-card p-4 transition hover:border-primary/50 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-base font-semibold text-foreground">
                          {instructor.name}
                        </h2>
                        <Badge variant="outline">
                          {instructor.branchScopeType === "branches"
                            ? "Vestiging-scoped"
                            : "Organisatiebreed"}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {instructor.email}
                      </p>
                    </div>
                    <Badge variant="primary">
                      {instructor.todayAppointments} vandaag
                    </Badge>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <MiniMetric
                      label="Aankomend"
                      value={String(instructor.upcomingAppointments)}
                    />
                    <MiniMetric
                      label="Leerlingen"
                      value={String(instructor.activeStudents)}
                    />
                    <MiniMetric
                      label="Beschikbaar"
                      value={hoursLabel(instructor.weeklyAvailabilityMinutes)}
                    />
                  </div>

                  <div className="mt-4 rounded-xl border border-border/70 bg-muted/20 px-3 py-3">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      Volgende afspraak
                    </p>
                    {instructor.nextAppointment ? (
                      <div className="mt-2 text-sm">
                        <p className="font-medium text-foreground">
                          {instructor.nextAppointment.label}
                          {instructor.nextAppointment.studentName
                            ? ` met ${instructor.nextAppointment.studentName}`
                            : ""}
                        </p>
                        <p className="text-muted-foreground">
                          {dateTimeFmt.format(
                            new Date(instructor.nextAppointment.startsAt),
                          )}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Geen aankomende afspraak gevonden.
                      </p>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {instructor.branchNames.length > 0 ? (
                      instructor.branchNames.slice(0, 3).map((name) => (
                        <Badge key={name} variant="outline">
                          {name}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="outline">Alle vestigingen</Badge>
                    )}
                    {instructor.vehicleLabels.slice(0, 2).map((label) => (
                      <Badge key={label} variant="info">
                        <Car className="h-3 w-3" aria-hidden />
                        {label}
                      </Badge>
                    ))}
                    {instructor.capabilityLabels.slice(0, 3).map((label) => (
                      <Badge key={label} variant="success">
                        {label}
                      </Badge>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/50 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
