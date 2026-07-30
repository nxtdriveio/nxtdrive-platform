import Link from "next/link";
import { ArrowLeft, MapPinned } from "lucide-react";
import {
  AGENDA_BACKOFFICE_READ_ROLES,
  requireAgendaAccessContext,
} from "@/lib/agenda/access";
import {
  addDaysYmd,
  resolveTenantTimeZone,
  startOfZonedDayUtc,
  zonedYmd,
} from "@/lib/datetime";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  AdminPage,
  AdminPageHeader,
} from "@/components/backoffice/admin-primitives";
import {
  ListMapWorkspace,
  type MapWorkspaceItem,
} from "@/domains/maps/ui/list-map-workspace";

export const dynamic = "force-dynamic";

export default async function PlanningBoardMapPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const service = createServiceRoleClient();
  const { context } = await requireAgendaAccessContext(
    service,
    AGENDA_BACKOFFICE_READ_ROLES,
  );
  const params = await searchParams;
  const timeZone = resolveTenantTimeZone(context.organization);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "")
    ? params.date!
    : zonedYmd(new Date(), timeZone);
  const start = startOfZonedDayUtc(day, timeZone);
  const end = startOfZonedDayUtc(addDaysYmd(day, 1), timeZone);
  const { data: lessons } = await service
    .from("lessons")
    .select("id, starts_at, ends_at, instructor_id, student_id")
    .eq("tenant_id", context.organization.id)
    .eq("status", "planned")
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString())
    .order("starts_at");
  const lessonIds = (lessons ?? []).map((lesson) => lesson.id);
  const [{ data: stops }, { data: decisions }, { data: students }] =
    lessonIds.length > 0
      ? await Promise.all([
          service
            .from("appointment_stops")
            .select(
              "id, lesson_id, formatted_address_snapshot, latitude_snapshot, longitude_snapshot",
            )
            .eq("tenant_id", context.organization.id)
            .eq("publication_status", "PUBLISHED")
            .eq("stop_type", "PICKUP")
            .in("lesson_id", lessonIds),
          service
            .from("route_calculation_decisions")
            .select(
              "appointment_id, status, method, confidence, as_of, created_at",
            )
            .eq("tenant_id", context.organization.id)
            .eq("appointment_type", "LESSON")
            .in("appointment_id", lessonIds)
            .order("created_at", { ascending: false }),
          service
            .from("students")
            .select("id, full_name")
            .eq("tenant_id", context.organization.id)
            .in("id", [
              ...new Set((lessons ?? []).map((lesson) => lesson.student_id)),
            ]),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];
  const lessonById = new Map(
    (lessons ?? []).map((lesson) => [lesson.id, lesson]),
  );
  const studentById = new Map(
    (students ?? []).map((student) => [student.id, student.full_name]),
  );
  type Decision = {
    appointment_id: string;
    status: string;
    method: string;
    confidence: string;
    as_of: string;
    created_at: string;
  };
  const decisionByLesson = new Map<string, Decision>();
  for (const decision of decisions ?? []) {
    if (!decisionByLesson.has(decision.appointment_id)) {
      decisionByLesson.set(decision.appointment_id, decision);
    }
  }
  const items: MapWorkspaceItem[] = (stops ?? []).flatMap((stop) => {
    const lesson = lessonById.get(stop.lesson_id);
    if (!lesson) return [];
    const decision = decisionByLesson.get(lesson.id);
    return [
      {
        id: stop.id,
        title: `${formatTime(lesson.starts_at)} · ${
          studentById.get(lesson.student_id) ?? "Leerling"
        }`,
        subtitle: stop.formatted_address_snapshot,
        meta: decision
          ? `${decision.method} · ${decision.confidence} · ${new Date(decision.as_of).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}`
          : "Nog geen server-side routecontrole",
        status:
          decision?.status === "INFEASIBLE"
            ? "BLOCKED"
            : ["TIGHT", "FALLBACK_ESTIMATE"].includes(decision?.status ?? "")
              ? "WARNING"
              : decision?.status === "FEASIBLE"
                ? "OK"
                : "UNKNOWN",
        latitude: stop.latitude_snapshot,
        longitude: stop.longitude_snapshot,
        instructorId: lesson.instructor_id,
      } satisfies MapWorkspaceItem,
    ];
  });

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Planning"
        title="Operationele dagkaart"
        description="Exacte locaties zijn alleen voor planners. Routebewijzen tonen methode, actualiteit en confidence; onbekend is nooit nul minuten."
        actions={
          <Link
            href={`/backoffice/planning-board?date=${encodeURIComponent(day)}`}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-brand-border px-3 text-sm font-black"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Planbord
          </Link>
        }
        meta={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-black text-primary">
            <MapPinned className="h-4 w-4" aria-hidden />
            {day}
          </span>
        }
      />
      <ListMapWorkspace
        items={items}
        mapOriginConfigured={
          process.env.NEXT_PUBLIC_MAP_RENDER_ORIGIN ===
          "https://maps.nxtdrive.io"
        }
      />
    </AdminPage>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
