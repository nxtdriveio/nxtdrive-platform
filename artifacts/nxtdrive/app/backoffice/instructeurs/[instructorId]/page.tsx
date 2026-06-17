import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  Car,
  Clock3,
  GraduationCap,
  History,
  ListChecks,
  MapPin,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { requireActiveOrganization } from "@/lib/organization/context";
import { loadOrganizationBranchScope } from "@/lib/organization/branch-scope";
import { loadBackofficeInstructorDetail } from "@/lib/instructors/backoffice";
import { rolesGrantPermission } from "@/lib/permissions";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { createNlDateTimeFormatter } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  assignInstructorVehicle,
  clearInstructorVehicle,
  toggleInstructorCapability,
  updateInstructorProfile,
} from "../actions";

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

const timeFmt = createNlDateTimeFormatter({
  hour: "2-digit",
  minute: "2-digit",
});

const WEEKDAY_LABELS: Record<number, string> = {
  1: "Ma",
  2: "Di",
  3: "Wo",
  4: "Do",
  5: "Vr",
  6: "Za",
  7: "Zo",
};

function hoursLabel(minutes: number): string {
  if (minutes <= 0) return "0 uur";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours} uur`;
  return `${hours}u ${rest}m`;
}

function durationLabel(startsAt: string, endsAt: string): string {
  const minutes = Math.max(
    0,
    Math.round(
      (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000,
    ),
  );
  return `${minutes} min`;
}

function workloadLabel(minutes: number): string {
  return minutes <= 0 ? "0 uur" : hoursLabel(minutes);
}

export default async function BackofficeInstructorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ instructorId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ instructorId }, sp, context] = await Promise.all([
    params,
    searchParams,
    requireActiveOrganization([...VIEW_ROLES]),
  ]);
  const service = createServiceRoleClient();
  const branchScope = await loadOrganizationBranchScope(service, context);
  const instructor = await loadBackofficeInstructorDetail(
    service,
    context.organization.id,
    branchScope,
    instructorId,
  );

  if (!instructor) notFound();

  const initials = instructor.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "I";
  const returnTo = `/backoffice/instructeurs/${instructor.id}`;
  const canManageUsers = context.roles.some((role) =>
    ["tenant_admin", "franchise_admin"].includes(role),
  );
  const canManageSettings = canManageUsers;
  const canManageVehicles =
    !!context.user.profile?.is_platform_admin ||
    rolesGrantPermission(context.roles, "vehicle:manage");
  const assignedVehicles = instructor.vehicleOptions.filter(
    (vehicle) => vehicle.assignedToInstructor,
  );
  const assignableVehicles = instructor.vehicleOptions.filter(
    (vehicle) => vehicle.active && vehicle.status !== "sold",
  );
  const success = typeof sp.success === "string" ? sp.success : null;
  const readiness = [
    {
      label: "Beschikbaarheid",
      ok: instructor.weeklyAvailabilityMinutes > 0,
      detail:
        instructor.weeklyAvailabilityMinutes > 0
          ? `${hoursLabel(instructor.weeklyAvailabilityMinutes)} per week`
          : "Nog geen weekritme ingesteld",
    },
    {
      label: "Eigenschappen",
      ok: instructor.capabilityLabels.length > 0,
      detail:
        instructor.capabilityLabels.length > 0
          ? `${instructor.capabilityLabels.length} planningtag(s)`
          : "Nog geen specialisaties gekoppeld",
    },
    {
      label: "Voertuig",
      ok: assignedVehicles.length > 0,
      detail:
        assignedVehicles.length > 0
          ? `${assignedVehicles.length} standaard voertuig(en)`
          : "Nog geen standaard voertuig",
    },
    {
      label: "Leerlingcontext",
      ok: instructor.activeStudents > 0,
      detail:
        instructor.activeStudents > 0
          ? `${instructor.activeStudents} gekoppelde leerling(en)`
          : "Nog geen lessen gekoppeld",
    },
  ];
  const readinessOpenCount = readiness.filter((item) => !item.ok).length;
  const vehicleWarnings = assignedVehicles.filter(
    (vehicle) => !vehicle.active || vehicle.status !== "active",
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/backoffice/instructeurs"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Terug naar instructeurs
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-lg font-semibold text-primary">
              {initials}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  {instructor.name}
                </h1>
                <Badge variant="primary">Instructeur</Badge>
                <Badge variant="outline">
                  {instructor.branchScopeType === "branches"
                    ? "Vestiging-scoped"
                    : "Organisatiebreed"}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {instructor.email}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/backoffice/agenda/nieuw?instructor_id=${instructor.id}`}
              className={buttonVariants({ size: "sm" })}
            >
              Les plannen
            </Link>
            <Link
              href={`/backoffice/agenda/afspraak/nieuw?instructor_id=${instructor.id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Afspraak plannen
            </Link>
            <Link
              href={`/backoffice/planning-board/instructors/${instructor.id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Planning openen
            </Link>
            <Link
              href={`/backoffice/beschikbaarheid?instructor=${instructor.id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Beschikbaarheid
            </Link>
          </div>
        </div>
      </div>

      {success ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {success === "profile_updated"
            ? "Instructeurgegevens bijgewerkt."
            : success === "capability_updated"
              ? "Eigenschappen bijgewerkt."
              : success === "vehicle_updated"
                ? "Voertuigkoppeling bijgewerkt."
              : "Wijziging opgeslagen."}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Vandaag"
          value={String(instructor.todayAppointments)}
          description="Afspraken op de huidige dag."
          icon={CalendarClock}
        />
        <MetricCard
          label="Aankomend"
          value={String(instructor.upcomingAppointments)}
          description="Geplande afspraken in de komende periode."
          icon={Clock3}
        />
        <MetricCard
          label="Leerlingen"
          value={String(instructor.activeStudents)}
          description="Unieke leerlingen met recente of komende lessen."
          icon={GraduationCap}
        />
        <MetricCard
          label="Beschikbaar"
          value={hoursLabel(instructor.weeklyAvailabilityMinutes)}
          description="Totaal ingestelde weekbeschikbaarheid."
          icon={Sparkles}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Operationele cockpit</CardTitle>
            <p className="text-sm text-muted-foreground">
              Werkdruk, planningmix en aandachtspunten voor deze instructeur.
            </p>
          </div>
          <Badge variant={readinessOpenCount === 0 ? "success" : "warning"}>
            {readinessOpenCount === 0
              ? "Planning gereed"
              : `${readinessOpenCount} actiepunt(en)`}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-3">
          <CockpitBlock
            icon={Activity}
            title="Komende 7 dagen"
            value={workloadLabel(instructor.workload.next7DaysMinutes)}
            description={`${instructor.workload.next7DaysAppointments} afspraak/afspraken, waarvan ${instructor.workload.next7DaysLessons} rijles(sen).`}
          />
          <CockpitBlock
            icon={Clock3}
            title="Vandaag gepland"
            value={workloadLabel(instructor.workload.todayMinutes)}
            description={
              instructor.todayAppointments > 0
                ? `${instructor.todayAppointments} item(s) op de dagplanning.`
                : "Geen lessen of afspraken vandaag."
            }
          />
          <CockpitBlock
            icon={ListChecks}
            title="Planningmix"
            value={
              instructor.appointmentBreakdown[0]
                ? instructor.appointmentBreakdown[0].label
                : "Nog leeg"
            }
            description={
              instructor.appointmentBreakdown.length > 0
                ? instructor.appointmentBreakdown
                    .slice(0, 3)
                    .map((item) => `${item.count}x ${item.label}`)
                    .join(", ")
                : "Nog geen aankomende afspraakmix beschikbaar."
            }
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(24rem,0.85fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Gegevens</CardTitle>
              <p className="text-sm text-muted-foreground">
                Basisprofiel van de instructeur. Login en e-mail blijven via
                medewerker-toegang lopen.
              </p>
            </CardHeader>
            <CardContent>
              {canManageUsers ? (
                <form action={updateInstructorProfile} className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <input type="hidden" name="instructor_id" value={instructor.id} />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <div className="space-y-2">
                    <Label htmlFor="full_name">Naam</Label>
                    <Input
                      id="full_name"
                      name="full_name"
                      defaultValue={instructor.name}
                      required
                      maxLength={160}
                    />
                    <p className="text-xs text-muted-foreground">
                      E-mail: {instructor.email}
                    </p>
                  </div>
                  <Button type="submit">Gegevens opslaan</Button>
                </form>
              ) : (
                <div className="rounded-xl border border-border bg-background/40 px-4 py-3">
                  <p className="font-medium text-foreground">{instructor.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {instructor.email}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>Operationele agenda</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Eerstvolgende lessen, examens en interne blokken.
                </p>
              </div>
              <Link
                href={`/backoffice/planning-board/instructors/${instructor.id}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Detailplanning
              </Link>
            </CardHeader>
            <CardContent>
              {instructor.recentAppointments.length === 0 ? (
                <EmptyState
                  icon={CalendarClock}
                  title="Nog geen afspraken"
                  description="Plan een les of afspraak om deze instructeur op de agenda te zetten."
                />
              ) : (
                <div className="space-y-3">
                  {instructor.recentAppointments.slice(0, 8).map((event) => (
                    <Link
                      key={`${event.kind}-${event.id}`}
                      href={
                        event.kind === "lesson"
                          ? `/backoffice/agenda/${event.id}`
                          : `/backoffice/agenda/afspraak/${event.id}`
                      }
                      className="flex flex-col gap-3 rounded-xl border border-border bg-background/40 px-4 py-3 transition hover:border-primary/50 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-foreground">
                            {event.label}
                          </p>
                          <Badge variant="outline">{event.status}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {event.studentName ?? "Geen leerling gekoppeld"}
                          {event.vehicleLabel ? ` - ${event.vehicleLabel}` : ""}
                        </p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-sm font-medium text-foreground">
                          {dateTimeFmt.format(new Date(event.startsAt))}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {timeFmt.format(new Date(event.startsAt))} -{" "}
                          {timeFmt.format(new Date(event.endsAt))} -{" "}
                          {durationLabel(event.startsAt, event.endsAt)}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>Leerlingen</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Leerlingen die recent of binnenkort bij deze instructeur rijden.
                </p>
              </div>
              <Link
                href="/backoffice/leerlingen"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Leerlingenlijst
              </Link>
            </CardHeader>
            <CardContent>
              {instructor.students.length === 0 ? (
                <EmptyState
                  icon={GraduationCap}
                  title="Nog geen gekoppelde leerlingen"
                  description="Zodra deze instructeur lessen geeft, verschijnen leerlingen hier."
                />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {instructor.students.slice(0, 8).map((student) => (
                    <Link
                      key={student.id}
                      href={`/backoffice/leerlingen/${student.id}`}
                      className="rounded-xl border border-border bg-background/40 px-4 py-3 transition hover:border-primary/50"
                    >
                      <p className="font-medium text-foreground">{student.name}</p>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {student.email ?? student.phone ?? "Geen contactgegevens"}
                      </p>
                      <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                        <span>{student.lessonCount} les(sen) gekoppeld</span>
                        <span>
                          Laatste les:{" "}
                          {student.lastLessonAt
                            ? dateTimeFmt.format(new Date(student.lastLessonAt))
                            : "Nog niet bekend"}
                        </span>
                        <span>
                          Volgende les:{" "}
                          {student.nextLessonAt
                            ? dateTimeFmt.format(new Date(student.nextLessonAt))
                            : "Niet gepland"}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>Eigenschappen</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Specialisaties en planningtags die de planning-engine gebruikt.
                </p>
              </div>
              <Link
                href="/backoffice/eigenschappen"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Definities
              </Link>
            </CardHeader>
            <CardContent>
              {instructor.capabilityOptions.length === 0 ? (
                <EmptyState
                  icon={BadgeCheck}
                  title="Nog geen instructeur-eigenschappen"
                  description="Maak eerst eigenschappen aan zoals automaat, faalangst, RIS of taalvaardigheid."
                />
              ) : (
                <div className="grid gap-2">
                  {instructor.capabilityOptions.map((capability) => (
                    <form
                      key={capability.id}
                      action={toggleInstructorCapability}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/40 px-4 py-3"
                    >
                      <input type="hidden" name="instructor_id" value={instructor.id} />
                      <input type="hidden" name="capability_id" value={capability.id} />
                      <input type="hidden" name="enabled" value={capability.enabled ? "false" : "true"} />
                      <input type="hidden" name="return_to" value={returnTo} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-foreground">
                            {capability.label}
                          </p>
                          <Badge variant={capability.enabled ? "success" : "outline"}>
                            {capability.enabled ? "Actief" : "Niet actief"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {capability.category} - {capability.matchBehavior}
                        </p>
                      </div>
                      {canManageSettings ? (
                        <Button
                          type="submit"
                          variant={capability.enabled ? "outline" : "primary"}
                          size="sm"
                        >
                          {capability.enabled ? "Verwijderen" : "Toevoegen"}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Alleen beheer
                        </span>
                      )}
                    </form>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>Voertuigen</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Standaard voertuigen die de planning-engine als eerste
                  voorstelt bij deze instructeur.
                </p>
              </div>
              <Link
                href="/backoffice/voertuigen"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Voertuigbeheer
              </Link>
            </CardHeader>
            <CardContent className="space-y-4">
              {assignedVehicles.length === 0 ? (
                <EmptyState
                  icon={Car}
                  title="Geen standaard voertuig"
                  description="Koppel een lesauto zodat de planning direct een logisch voertuig kan voorstellen."
                />
              ) : (
                <div className="space-y-2">
                  {assignedVehicles.map((vehicle) => (
                    <div
                      key={vehicle.id}
                      className="rounded-xl border border-border bg-background/40 px-4 py-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-foreground">
                            {vehicle.label}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {[
                              vehicle.branchName ?? "Alle vestigingen",
                              vehicle.transmission,
                              vehicle.licensePlate,
                            ]
                              .filter(Boolean)
                              .join(" - ")}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={
                              vehicle.active && vehicle.status === "active"
                                ? "success"
                                : "warning"
                            }
                          >
                            {vehicle.active ? vehicle.status : "inactief"}
                          </Badge>
                          {canManageVehicles ? (
                            <form action={clearInstructorVehicle}>
                              <input
                                type="hidden"
                                name="instructor_id"
                                value={instructor.id}
                              />
                              <input
                                type="hidden"
                                name="vehicle_id"
                                value={vehicle.id}
                              />
                              <input
                                type="hidden"
                                name="return_to"
                                value={returnTo}
                              />
                              <Button type="submit" variant="ghost" size="sm">
                                Ontkoppelen
                              </Button>
                            </form>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {canManageVehicles ? (
                <form
                  action={assignInstructorVehicle}
                  className="grid gap-3 rounded-xl border border-dashed border-border bg-background/30 p-3"
                >
                  <input type="hidden" name="instructor_id" value={instructor.id} />
                  <input type="hidden" name="return_to" value={returnTo} />
                  <div className="space-y-1.5">
                    <Label htmlFor="vehicle_id">Voertuig koppelen</Label>
                    <Select id="vehicle_id" name="vehicle_id" required defaultValue="">
                      <option value="" disabled>
                        Kies voertuig
                      </option>
                      {assignableVehicles.map((vehicle) => (
                        <option key={vehicle.id} value={vehicle.id}>
                          {vehicle.label}
                          {vehicle.branchName ? ` - ${vehicle.branchName}` : ""}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button type="submit" size="sm">
                    Koppelen aan instructeur
                  </Button>
                </form>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Planning readiness</CardTitle>
              <p className="text-sm text-muted-foreground">
                Snelle check of deze instructeur klaar is voor automatische
                planning en drag-and-drop toewijzing.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {readiness.map((item) => (
                <div
                  key={item.label}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border bg-background/40 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-foreground">{item.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.detail}
                    </p>
                  </div>
                  <Badge variant={item.ok ? "success" : "warning"}>
                    {item.ok ? "Gereed" : "Actie nodig"}
                  </Badge>
                </div>
              ))}
              {vehicleWarnings.length > 0 ? (
                <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
                  {vehicleWarnings.length} gekoppeld voertuig vraagt aandacht
                  voordat deze instructeur volledig betrouwbaar planbaar is.
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>Recente planninghistorie</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Laatste planningmutaties waarbij deze instructeur geraakt is.
                </p>
              </div>
              <span className="rounded-full bg-primary-soft p-2 text-primary">
                <History className="h-4 w-4" aria-hidden />
              </span>
            </CardHeader>
            <CardContent>
              {instructor.planningAuditTrail.length === 0 ? (
                <EmptyState
                  icon={History}
                  title="Nog geen planninghistorie"
                  description="Verplaatsingen en centrale planningacties verschijnen hier zodra ze gelogd zijn."
                />
              ) : (
                <div className="space-y-2">
                  {instructor.planningAuditTrail.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-border bg-background/40 px-4 py-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium text-foreground">
                          {item.action}
                        </p>
                        <Badge variant="outline">{item.entityType}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {dateTimeFmt.format(new Date(item.createdAt))}
                        {item.reason ? ` - ${item.reason}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Beheerlinks</CardTitle>
              <p className="text-sm text-muted-foreground">
                Deze sprint bundelt bestaande beheerflows rond de instructeur.
              </p>
            </CardHeader>
            <CardContent className="grid gap-3">
              <ManagementLink
                href={`/backoffice/medewerkers/${instructor.membershipId}/toegang`}
                icon={ShieldCheck}
                title="Toegang en sessies"
                description="Beheer loginstatus en toegang voor deze medewerker."
              />
              <ManagementLink
                href={`/backoffice/medewerkers/${instructor.membershipId}/rol`}
                icon={UserRound}
                title="Rol wijzigen"
                description="Wijzig medewerkerrol of behoud instructeursrol."
              />
              <ManagementLink
                href={`/backoffice/medewerkers/${instructor.membershipId}/vestigingen`}
                icon={MapPin}
                title="Vestigingstoegang"
                description="Beperk of verruim operationele branch-scope."
              />
              <ManagementLink
                href="/backoffice/eigenschappen"
                icon={BadgeCheck}
                title="Eigenschappen"
                description="Koppel specialisaties, transmissies en certificaten."
              />
              <ManagementLink
                href="/backoffice/voertuigen"
                icon={Car}
                title="Voertuigen"
                description="Koppel standaard voertuig en bekijk voertuigstatus."
              />
              <ManagementLink
                href="/backoffice/rayons"
                icon={Settings}
                title="Rayons"
                description="Beheer werkgebieden en reistijdregels."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Profielcontext</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <InfoBlock
                label="Vestigingen"
                values={
                  instructor.branchNames.length > 0
                    ? instructor.branchNames
                    : ["Alle vestigingen"]
                }
              />
              <InfoBlock
                label="Teams"
                values={
                  instructor.teamNames.length > 0
                    ? instructor.teamNames
                    : ["Nog geen team"]
                }
              />
              <InfoBlock
                label="Eigenschappen"
                values={
                  instructor.capabilityLabels.length > 0
                    ? instructor.capabilityLabels
                    : ["Nog niet ingericht"]
                }
              />
              <InfoBlock
                label="Voertuigen"
                values={
                  instructor.vehicleLabels.length > 0
                    ? instructor.vehicleLabels
                    : ["Geen standaard voertuig"]
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Beschikbaarheidsritme</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-2">
                {instructor.availabilityByWeekday.map((day) => (
                  <div
                    key={day.weekday}
                    className="rounded-xl border border-border bg-background/40 px-2 py-3 text-center"
                  >
                    <p className="text-xs font-medium text-muted-foreground">
                      {WEEKDAY_LABELS[day.weekday]}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-foreground">
                      {hoursLabel(day.minutes)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {day.blockCount} blok{day.blockCount === 1 ? "" : "ken"}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {instructor.exceptionCount} uitzondering
                {instructor.exceptionCount === 1 ? "" : "en"} geregistreerd.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: string;
  description: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>{label}</CardTitle>
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

function CockpitBlock({
  icon: Icon,
  title,
  value,
  description,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/40 px-4 py-4">
      <div className="flex items-start gap-3">
        <span className="rounded-full bg-primary-soft p-2 text-primary">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {title}
          </p>
          <p className="mt-2 text-xl font-semibold text-foreground">{value}</p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

function ManagementLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-xl border border-border bg-background/40 px-4 py-3 transition hover:border-primary/50"
    >
      <span className="rounded-full bg-primary-soft p-2 text-primary">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span>
        <span className="block font-medium text-foreground">{title}</span>
        <span className="mt-1 block text-sm text-muted-foreground">
          {description}
        </span>
      </span>
    </Link>
  );
}

function InfoBlock({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.map((value) => (
          <Badge key={value} variant="outline">
            {value}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
      <Icon className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
      <p className="mt-3 font-medium text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
