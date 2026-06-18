import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Car, Clock, UserRound } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  loadInstructorRisLessonCard,
  loadStudentPlanningCardForLesson,
} from "@/lib/ris/data";
import { RisScriptScoring } from "@/components/ris/RisScriptScoring";
import { RisLessonPublicationPanel } from "@/components/ris/RisLessonPublicationPanel";
import { InstructorPlanningCardPanel } from "@/components/ris/InstructorPlanningCardPanel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const dateTimeFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

type LessonRow = {
  id: string;
  student_id: string;
  instructor_id: string | null;
  vehicle_id: string | null;
  status: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
};

export async function RisEvaluationWorkspace({ lessonId }: { lessonId: string }) {
  const { tenant, user, roles } = await requireActiveTenant([
    "instructor",
    "tenant_admin",
  ]);
  const service = createServiceRoleClient();

  const { data: lessonRaw, error: lessonError } = await service
    .from("lessons")
    .select("id, student_id, instructor_id, vehicle_id, status, starts_at, ends_at, location")
    .eq("id", lessonId)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (lessonError) throw new Error(`Les laden mislukt: ${lessonError.message}`);
  const lesson = lessonRaw as LessonRow | null;
  if (!lesson) notFound();
  if (!roles.includes("tenant_admin") && lesson.instructor_id !== user.id) {
    notFound();
  }

  const [studentRes, vehicleRes, ris, planningCard] = await Promise.all([
    service
      .from("students")
      .select("id, full_name")
      .eq("id", lesson.student_id)
      .eq("tenant_id", tenant.id)
      .maybeSingle(),
    lesson.vehicle_id
      ? service
          .from("vehicles")
          .select("label, license_plate")
          .eq("id", lesson.vehicle_id)
          .eq("tenant_id", tenant.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    loadInstructorRisLessonCard(service, tenant.id, lesson.id),
    loadStudentPlanningCardForLesson(service, tenant.id, lesson.student_id, lesson.id),
  ]);
  if (studentRes.error) throw new Error(`Leerling laden mislukt: ${studentRes.error.message}`);
  if (vehicleRes.error) throw new Error(`Voertuig laden mislukt: ${vehicleRes.error.message}`);
  const student = studentRes.data as { id: string; full_name: string } | null;
  if (!student) notFound();
  const vehicle = vehicleRes.data as { label: string; license_plate: string | null } | null;
  const vehicleLabel = vehicle
    ? [vehicle.label, vehicle.license_plate ? `(${vehicle.license_plate})` : null]
        .filter(Boolean)
        .join(" ")
    : "Geen voertuig gekoppeld";

  return (
    <div className="mx-auto flex w-full max-w-[100rem] flex-col gap-4 px-3 pb-8 sm:px-4 lg:px-6">
      <div className="flex flex-col gap-4 rounded-[1.6rem] border border-border bg-card/85 p-4 shadow-brand-card lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Link
            href="/instructor/evaluations"
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Terug naar lesevaluaties
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="primary">RIS methode</Badge>
            <Badge variant={lesson.status === "completed" ? "success" : "outline"}>
              {lesson.status}
            </Badge>
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-foreground">
            Les evaluatie
          </h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Score volgens RIS, begeleid de reflectie en publiceer pas daarna de
            leerlingveilige leskaart.
          </p>
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-2 lg:min-w-[28rem]">
          <InfoLine icon={UserRound} label={student.full_name} />
          <InfoLine icon={CalendarDays} label={dateTimeFmt.format(new Date(lesson.starts_at))} />
          <InfoLine icon={Clock} label={timeRange(lesson.starts_at, lesson.ends_at)} />
          <InfoLine icon={Car} label={vehicleLabel} />
        </div>
      </div>

      {ris.settings.lessonCardMode !== "ris" ? (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="pt-5 text-sm leading-6 text-warning">
            RIS staat nog niet actief voor deze tenant. Activeer RIS in de
            backoffice om nieuwe leskaarten volgens de RIS-methode te gebruiken.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(28rem,0.55fr)]">
        <div className="space-y-4">
          <InstructorPlanningCardPanel
            lessonId={lesson.id}
            studentId={student.id}
            studentName={student.full_name}
            planningCard={planningCard}
          />
          <RisScriptScoring lessonId={lesson.id} studentName={student.full_name} ris={ris} />
        </div>
        <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <RisLessonPublicationPanel
            lessonId={lesson.id}
            studentId={student.id}
            studentName={student.full_name}
            ris={ris}
          />
        </div>
      </div>
    </div>
  );
}

function timeRange(startsAt: string, endsAt: string | null) {
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;
  const timeFmt = new Intl.DateTimeFormat("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return end ? `${timeFmt.format(start)} - ${timeFmt.format(end)}` : timeFmt.format(start);
}

function InfoLine({
  icon: Icon,
  label,
}: {
  icon: typeof UserRound;
  label: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-border bg-background/60 px-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="truncate font-semibold text-foreground">{label}</span>
    </div>
  );
}
