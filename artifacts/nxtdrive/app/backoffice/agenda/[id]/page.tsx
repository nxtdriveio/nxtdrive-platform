import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { loadTaskLaunchData } from "@/lib/tasks/launch-data";
import { CreateTaskFromEntityButton } from "@/app/backoffice/taken/create-task-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  LESSON_STATUS_LABEL,
  LESSON_STATUS_VARIANT,
  refundPctForHours,
} from "@/lib/lessons/types";
import {
  canManageAgendaRow,
  requireAgendaLessonAccess,
} from "@/lib/agenda/access";
import { loadCancellationPolicy } from "@/lib/lessons/cancellation-policy";
import { formatTegoed } from "@/lib/students/types";
import { SlotStudentSuggestions } from "@/components/agenda/slot-student-suggestions";
import { cancelLesson, completeLesson } from "../actions";

export const dynamic = "force-dynamic";

const dtFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function LessonDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const supabase = await createServerSupabaseClient();
  const service = createServiceRoleClient();
  const { context, branchScope, lesson } = await requireAgendaLessonAccess(
    service,
    id,
    "read",
  );
  if (!lesson) notFound();

  const tenant = context.organization;
  const canManageLesson = canManageAgendaRow(context, branchScope, lesson);

  const taskLaunch = await loadTaskLaunchData(service, tenant.id);

  const { data: student } = await supabase
    .from("students")
    .select("id, full_name")
    .eq("id", lesson.student_id)
    .maybeSingle();

  const { data: instructor } = await service
    .from("profiles")
    .select("id, full_name")
    .eq("id", lesson.instructor_id)
    .maybeSingle();

  const policy = await loadCancellationPolicy(supabase, tenant.id);

  const startsAt = new Date(lesson.starts_at);
  const hoursBefore = Math.max(
    0,
    (startsAt.getTime() - Date.now()) / (1000 * 60 * 60),
  );
  const refundPct = refundPctForHours(policy, hoursBefore);
  const wouldRefund = Math.round((lesson.credits_cost * refundPct) / 100);

  // Task #92 — only surface "slim herbezetten" when this freed slot is still in
  // the future. The duration is derived from the cancelled lesson's window.
  const durationMin = Math.max(
    0,
    Math.round(
      (new Date(lesson.ends_at).getTime() - startsAt.getTime()) / (1000 * 60),
    ),
  );
  const isCancelled =
    lesson.status === "cancelled_with_refund" ||
    lesson.status === "cancelled_no_refund";
  const showRefill =
    canManageLesson && isCancelled && startsAt.getTime() > Date.now() && durationMin > 0;

  return (
    <div className="space-y-6">
      <Link
        href="/backoffice/agenda"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Terug naar agenda
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {dtFmt.format(startsAt)}
          </h1>
          <p className="text-sm text-muted-foreground">
            {student?.full_name ?? "Leerling"} ·{" "}
            {instructor?.full_name ?? "Instructeur"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CreateTaskFromEntityButton
            entityType="lesson"
            entityId={lesson.id}
            entityLabel={`${dtFmt.format(startsAt)} — ${student?.full_name ?? "Leerling"}`}
            boards={taskLaunch.boards}
            members={taskLaunch.members}
          />
          <Badge variant={LESSON_STATUS_VARIANT[lesson.status]}>
            {LESSON_STATUS_LABEL[lesson.status]}
          </Badge>
        </div>
      </div>

      {sp.error ? (
        <Card className="border-danger/40 bg-danger/5 p-4 text-sm text-danger">
          Actie mislukt: {sp.error}
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Lesgegevens</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <Field label="Start" value={dtFmt.format(startsAt)} />
              <Field
                label="Einde"
                value={dtFmt.format(new Date(lesson.ends_at))}
              />
              <Field
                label="Locatie"
                value={lesson.location ?? "—"}
              />
              <Field
                label="Tegoed"
                value={formatTegoed(lesson.credits_cost)}
              />
              {lesson.cancellation_reason ? (
                <Field
                  label="Annuleringsreden"
                  value={lesson.cancellation_reason}
                />
              ) : null}
              {lesson.refunded_credits !== null &&
              lesson.refunded_credits > 0 ? (
                <Field
                  label="Refund"
                  value={`+${formatTegoed(lesson.refunded_credits)}`}
                />
              ) : null}
              {lesson.notes ? (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Notities
                  </dt>
                  <dd className="mt-1 whitespace-pre-wrap text-foreground">
                    {lesson.notes}
                  </dd>
                </div>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {lesson.status === "planned" && canManageLesson ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Voltooien</CardTitle>
                </CardHeader>
                <CardContent>
                  <form action={completeLesson}>
                    <input type="hidden" name="lesson_id" value={lesson.id} />
                    <Button type="submit" size="sm" className="w-full">
                      Markeer als voltooid
                    </Button>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Tegoed is al afgeschreven bij het plannen.
                    </p>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Annuleren</CardTitle>
                </CardHeader>
                <CardContent>
                  <form action={cancelLesson} className="space-y-3">
                    <input type="hidden" name="lesson_id" value={lesson.id} />
                    <p className="text-xs text-muted-foreground">
                      Bij annulering nu ({hoursBefore.toFixed(1)} u vooraf):
                      refund {refundPct}% ={" "}
                      <span className="font-medium text-foreground">
                        {formatTegoed(wouldRefund)}
                      </span>
                      .
                    </p>
                    <div className="space-y-1.5">
                      <Label htmlFor="reason">Reden</Label>
                      <Textarea
                        id="reason"
                        name="reason"
                        rows={2}
                        maxLength={500}
                        required
                        placeholder="bv. Leerling ziek"
                      />
                    </div>
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      className="w-full"
                    >
                      Les annuleren
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                Deze les is{" "}
                <span className="font-medium text-foreground">
                  {LESSON_STATUS_LABEL[lesson.status].toLowerCase()}
                </span>
                {canManageLesson ? ". Geen acties beschikbaar." : ". Alleen lezen."}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {showRefill ? (
        <SlotStudentSuggestions
          tenantId={tenant.id}
          instructorId={lesson.instructor_id}
          instructorName={instructor?.full_name ?? undefined}
          startsAt={lesson.starts_at}
          durationMin={durationMin}
          excludeAppointmentId={lesson.id}
          sourceLessonId={lesson.id}
        />
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-foreground">{value}</dd>
    </div>
  );
}
