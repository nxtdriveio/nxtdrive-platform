import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireActiveTenant } from "@/lib/auth/require-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  LESSON_STATUS_LABEL,
  LESSON_STATUS_VARIANT,
  refundPctForHours,
  type CancellationPolicy,
  type Lesson,
} from "@/lib/lessons/types";
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
  const { tenant } = await requireActiveTenant([
    "tenant_admin",
    "instructor",
  ]);
  const sp = await searchParams;

  const supabase = await createServerSupabaseClient();
  const service = createServiceRoleClient();

  const { data: lessonRaw } = await supabase
    .from("lessons")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (!lessonRaw) notFound();
  const lesson = lessonRaw as Lesson;

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

  const { data: policyRow } = await supabase
    .from("tenant_settings")
    .select("value")
    .eq("tenant_id", tenant.id)
    .eq("key", "cancellation_policy")
    .maybeSingle();
  const policy = (policyRow?.value ?? null) as CancellationPolicy | null;

  const startsAt = new Date(lesson.starts_at);
  const hoursBefore = Math.max(
    0,
    (startsAt.getTime() - Date.now()) / (1000 * 60 * 60),
  );
  const refundPct = refundPctForHours(policy, hoursBefore);
  const wouldRefund = Math.round((lesson.credits_cost * refundPct) / 100);

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
        <Badge variant={LESSON_STATUS_VARIANT[lesson.status]}>
          {LESSON_STATUS_LABEL[lesson.status]}
        </Badge>
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
                label="Credits"
                value={`${lesson.credits_cost}`}
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
                  value={`+${lesson.refunded_credits} credit(s)`}
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
          {lesson.status === "planned" ? (
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
                      Credits zijn al afgeschreven bij het plannen.
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
                        {wouldRefund} credit(s)
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
                . Geen acties beschikbaar.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
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
