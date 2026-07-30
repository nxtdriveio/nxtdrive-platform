import { MapPinned } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  addDaysYmd,
  resolveTenantTimeZone,
  startOfZonedDayUtc,
  zonedYmd,
} from "@/lib/datetime";
import { buildExternalNavigationUrl } from "@/domains/maps/application/navigation";
import { DayRouteClient, type DayRouteStop } from "./day-route-client";

export const dynamic = "force-dynamic";

export default async function InstructorDayRoutePage() {
  const { user, tenant } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);
  const timeZone = resolveTenantTimeZone(tenant);
  const day = zonedYmd(new Date(), timeZone);
  const start = startOfZonedDayUtc(day, timeZone);
  const end = startOfZonedDayUtc(addDaysYmd(day, 1), timeZone);
  const service = createServiceRoleClient();
  const { data: lessons } = await service
    .from("lessons")
    .select("id, student_id, starts_at, ends_at")
    .eq("tenant_id", tenant.id)
    .eq("instructor_id", user.id)
    .eq("status", "planned")
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString())
    .order("starts_at");
  const lessonIds = (lessons ?? []).map((lesson) => lesson.id);
  const studentIds = [
    ...new Set((lessons ?? []).map((lesson) => lesson.student_id)),
  ];
  const [{ data: stops }, { data: students }, { data: statusEvents }] =
    lessonIds.length > 0
      ? await Promise.all([
          service
            .from("appointment_stops")
            .select(
              "id, appointment_id, lesson_id, label_snapshot, formatted_address_snapshot, latitude_snapshot, longitude_snapshot, published_at",
            )
            .eq("tenant_id", tenant.id)
            .eq("appointment_type", "LESSON")
            .eq("stop_type", "PICKUP")
            .eq("publication_status", "PUBLISHED")
            .in("lesson_id", lessonIds),
          service
            .from("students")
            .select("id, full_name")
            .eq("tenant_id", tenant.id)
            .in("id", studentIds),
          service
            .from("appointment_travel_status_events")
            .select("appointment_id, status, occurred_at")
            .eq("tenant_id", tenant.id)
            .eq("instructor_user_id", user.id)
            .in("appointment_id", lessonIds)
            .order("occurred_at", { ascending: false }),
        ])
      : [
          { data: [] as Record<string, never>[] },
          { data: [] as Record<string, never>[] },
          { data: [] as Record<string, never>[] },
        ];
  const lessonById = new Map(
    (lessons ?? []).map((lesson) => [lesson.id, lesson]),
  );
  const studentById = new Map(
    (students ?? []).map((student) => [student.id, student.full_name]),
  );
  const latestStatus = new Map<string, string>();
  for (const event of statusEvents ?? []) {
    if (!latestStatus.has(event.appointment_id)) {
      latestStatus.set(event.appointment_id, event.status);
    }
  }
  const routeStops: DayRouteStop[] = (stops ?? [])
    .flatMap((stop): DayRouteStop[] => {
      const lesson = lessonById.get(stop.lesson_id);
      if (!lesson) return [];
      const coordinates =
        typeof stop.latitude_snapshot === "number" &&
        typeof stop.longitude_snapshot === "number"
          ? {
              latitude: stop.latitude_snapshot,
              longitude: stop.longitude_snapshot,
            }
          : null;
      return [
        {
          id: stop.id,
          appointmentId: lesson.id,
          startsAt: lesson.starts_at,
          endsAt: lesson.ends_at,
          label:
            studentById.get(lesson.student_id) ??
            stop.label_snapshot ??
            "Rijles",
          formattedAddress: stop.formatted_address_snapshot,
          coordinates,
          navigationUrl: buildExternalNavigationUrl({
            provider: "GOOGLE_MAPS",
            coordinates,
            formattedAddress: stop.formatted_address_snapshot,
          }),
          status:
            (latestStatus.get(lesson.id) as
              | DayRouteStop["status"]
              | undefined) ?? "PLANNED",
          validationStatus: coordinates
            ? "SNAPSHOT_COORDINATES"
            : "ADDRESS_ONLY",
          routeMethod: "UNKNOWN",
          routeAsOf: null,
          routeConfidence: "UNKNOWN",
        },
      ];
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 pb-24 xl:pb-6">
      <header className="border-b border-brand-border pb-3">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-brand-primary">
          <MapPinned className="h-4 w-4" aria-hidden />
          Operationele dag
        </div>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground">
          Dagroute
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Alleen jouw gepubliceerde afspraakstops. Open externe navigatie;
          NXTDrive registreert geen live locatie of afgelegde route.
        </p>
      </header>
      <DayRouteClient
        stops={routeStops}
        offlineKey={`${tenant.id}:${user.id}:${day}`}
        expiresAt={end.toISOString()}
      />
    </div>
  );
}
